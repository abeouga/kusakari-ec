import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, login, call, prepareMember } from './business-helpers.js';

// Issue #113: the workspace needs a signed-in member, and each account sees only its own menus (#108). The seller and
// operator sidebars (icons, folding) are covered by business-sidebar-collapse.spec.js; this file keeps the buyer side
// and the forwarding of removed pages.
const buyerLinks = ['アカウント情報', '注文履歴', '通知一覧'];
const settingLinks = ['受取連絡先', 'パスワード変更', '退会'];

test('buyer sidebar returns to the shop and keeps the account pages on desktop and mobile', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('artifacts/e2e', { recursive: true });
  prepareMember(await login(page, 'test.user@example.com'), 'USER');
  const sidebar = page.locator('.workspace-sidebar');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${ec}/account`);
    await page.reload();
    await expect(sidebar.getByRole('navigation', { name: 'マイページ' }).getByRole('link')).toHaveText(buyerLinks);
    await expect(sidebar.getByRole('navigation', { name: 'アカウント設定' }).getByRole('link')).toHaveText(
      settingLinks,
    );
    // A buyer has no seller, operator or application menus.
    await expect(sidebar.getByRole('navigation')).toHaveCount(2);
    await expect(sidebar.getByRole('link', { name: '商品管理', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/e2e/sidebar-account-${width}.png`, fullPage: true });
    for (const label of [...buyerLinks, ...settingLinks]) {
      await sidebar.getByRole('link', { name: label, exact: true }).click();
      await expect(page.locator('.workspace-main h1')).toHaveText(label);
    }
    await sidebar.getByRole('link', { name: '商品一覧へ戻る', exact: true }).click();
    await expect(page).toHaveURL(`${ec}/`);
    await expect(page.locator('.hero')).toBeVisible();
  }
  // The buyer cannot open the seller or operator pages.
  for (const path of ['/seller/products', '/operator/members']) {
    await page.goto(`${ec}${path}`);
    await expect(page.getByRole('alert')).toHaveText('この画面を利用する権限がありません。');
  }
  const cart = await call(page.request, '/cart').then((r) => r.json());
  await writeFile('artifacts/e2e/sidebar-api.json', JSON.stringify(cart, null, 2));
  expect(errors).toEqual([]);
});

test('removed seller and operator pages forward to the first page of each menu', async ({ page }) => {
  for (const [email, role, removed, first, title] of [
    ['test.seller@example.com', 'SELLER', ['/seller', '/seller/messages'], '/seller/products', '商品管理'],
    ['test.admin@example.com', 'ADMIN', ['/operator', '/operator/settlements'], '/operator/members', '会員管理'],
  ]) {
    prepareMember(await login(page, email), role);
    for (const path of removed) {
      await page.goto(`${ec}${path}`);
      await expect(page).toHaveURL(`${ec}${first}`);
      await page.reload();
      await expect(page.locator('.workspace-main h1, .workspace-main h2').first()).toHaveText(title);
    }
    await expect(page.getByRole('button', { name: '手数料を更新', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `artifacts/e2e/sidebar-${role.toLowerCase()}-forwarded.png`, fullPage: true });
  }
});
