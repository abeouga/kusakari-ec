import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('buyer sidebar has one back button and preserves the originating page', async ({ page }) => {
  await page.goto('/seller/orders');
  await page.getByRole('link', { name: 'アカウント', exact: true }).click();
  const sidebar = page.locator('.workspace-sidebar');
  await expect(sidebar.locator('nav > a')).toHaveCount(4);
  await expect(sidebar.locator('nav > a svg')).toHaveCount(4);
  await expect(sidebar.getByRole('link', { name: '商品を探す', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button')).toHaveCount(1);
  await expect(sidebar.locator('.lucide-arrow-left')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await expect(page).toHaveURL(/\/seller\/orders$/);
  await expect(page.locator('.workspace-main h1')).toHaveText('受注・店舗受け取り');
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await page.getByRole('link', { name: 'アカウント', exact: true }).click();
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.hero')).toBeVisible();
});

test('direct account entry falls back to the shop and sidebars have icons on desktop and mobile', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('artifacts/e2e', { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/account');
    await page.reload();
    const sidebar = page.locator('.workspace-sidebar');
    await expect(sidebar.getByRole('button', { name: '戻る', exact: true })).toBeVisible();
    await expect(sidebar.locator('nav > a')).toHaveCount(4);
    await expect(sidebar.locator('nav > a svg')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/e2e/sidebar-account-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '戻る', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('link', { name: 'アカウント', exact: true }).click();
    await sidebar.getByRole('link', { name: '通知一覧', exact: true }).click();
    await expect(page.locator('.workspace-main h1')).toHaveText('通知一覧');
    await sidebar.getByRole('link', { name: '注文履歴', exact: true }).click();
    await expect(page.locator('.workspace-main h1')).toHaveText('注文履歴');
    await sidebar.getByRole('link', { name: '配置素材の商品候補', exact: true }).click();
    await expect(page.locator('.workspace-main h1')).toHaveText('配置素材の商品候補');
    await sidebar.getByRole('button', { name: '戻る', exact: true }).click();
    await expect(page).toHaveURL(/\/purchases$/);
    for (const role of ['seller', 'operator']) {
      await page.goto(`/${role}`);
      const menu = sidebar.locator('nav > a');
      const count = role === 'seller' ? 8 : 6;
      await expect(menu).toHaveCount(count);
      await expect(menu.locator('svg')).toHaveCount(count);
      await expect(sidebar.locator(':scope > a svg')).toHaveCount(0);
      await expect(sidebar.getByRole('link', { name: 'アカウント管理', exact: true })).toHaveCount(0);
      await expect(sidebar.getByRole('button', { name: '戻る', exact: true })).toHaveCount(1);
      if (role === 'seller') {
        await expect(menu.nth(0)).toHaveText('ダッシュボード');
        await expect(menu.nth(1)).toHaveText('出店申請');
        await expect(sidebar.getByRole('link', { name: 'お問い合わせ', exact: true })).toHaveCount(0);
        await expect(sidebar.getByRole('link', { name: '購入者サイトへ戻る', exact: true })).toHaveCount(0);
        await sidebar.getByRole('link', { name: '商品一覧・登録', exact: true }).click();
        await sidebar.getByRole('button', { name: '戻る', exact: true }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.locator('.hero')).toBeVisible();
        await page.goto('/seller/messages');
        await expect(page).toHaveURL(/\/seller$/);
      }
      if (role === 'operator') {
        await expect(page).toHaveURL(/\/operator\/members$/);
        await page.reload();
        await expect(page.locator('.workspace-main h1')).toHaveText('会員管理');
        await expect(sidebar.getByRole('link', { name: '会員管理', exact: true })).toHaveCount(1);
        await expect(sidebar.getByRole('link', { name: 'アカウント管理', exact: true })).toHaveCount(0);
        await expect(sidebar.getByRole('link', { name: /ダッシュボード|手数料/ })).toHaveCount(0);
        await expect(menu).toHaveText(['会員管理', '商品審査', 'カテゴリ管理', '出店審査', '店舗管理', '全注文管理']);
        await sidebar.getByRole('link', { name: '店舗管理', exact: true }).click();
        await page.reload();
        await expect(page.locator('.workspace-main h1')).toHaveText('店舗管理');
        await expect(page.getByRole('heading', { name: '店舗情報・利用状態', exact: true })).toBeVisible();
      }
      await page.screenshot({ path: `artifacts/e2e/sidebar-${role}-${width}.png`, fullPage: true });
    }
    await page.goto('/operator/settlements');
    await expect(page).toHaveURL(/\/operator\/members$/);
    await expect(page.locator('.workspace-main h1')).toHaveText('会員管理');
    await expect(page.getByRole('button', { name: '手数料を更新', exact: true })).toHaveCount(0);
  }
  const cart = await (await page.request.get('/api/cart')).json();
  await writeFile('artifacts/e2e/sidebar-api.json', JSON.stringify(cart, null, 2));
  expect(errors).toEqual([]);
});
