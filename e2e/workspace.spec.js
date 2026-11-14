import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, login, prepareMember } from './business-helpers.js';

// Issue #113: the workspace runs on real Cognito and MySQL; the demo screens with shared mock data are gone.

test('operator category CRUD and responsive navigation', async ({ page }) => {
  prepareMember(await login(page, 'test.admin@example.com'), 'ADMIN');
  const name = `確認用カテゴリ${Date.now().toString(36)}`;
  await page.goto(`${ec}/operator/categories`);
  const main = page.locator('.workspace-main');
  await main.getByLabel('カテゴリ名').fill(name);
  await main.getByRole('button', { name: '保存', exact: true }).click();
  const card = main.locator('section.workspace-card').filter({ hasText: name });
  await expect(card).toHaveCount(1);
  await page.reload();
  await card.getByRole('button', { name: '編集', exact: true }).click();
  await main.getByLabel('カテゴリ名').fill(`${name}変更`);
  await main.getByRole('button', { name: '保存', exact: true }).click();
  const renamed = main.locator('section.workspace-card').filter({ hasText: `${name}変更` });
  await expect(renamed).toHaveCount(1);
  await renamed.getByRole('button', { name: '削除', exact: true }).click();
  await page.getByRole('button', { name: '削除を確定' }).click();
  await expect(main.getByText('カテゴリを削除しました。')).toBeVisible();
  await page.reload();
  await expect(main).not.toContainText(name);
  await mkdir('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/workspace-operator.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.kusakari-site-header')).toContainText('管理者画面');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/workspace-mobile.png', fullPage: true });
});

test('buyer, seller and operator routes render without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('artifacts/e2e', { recursive: true });
  // The operator may open the buyer, seller and operator pages (#108); the seller pages act on the sample stores.
  prepareMember(await login(page, 'test.admin@example.com'), 'ADMIN');
  const routes = [
    '/account',
    '/notifications',
    '/purchases',
    '/store/1',
    '/seller/products',
    '/seller/orders',
    '/seller/sales',
    '/seller/stores',
    '/seller/profile',
    '/seller/notifications',
    '/operator/applications',
    '/operator/members',
    '/operator/sellers',
    '/operator/organizations',
    '/operator/products',
    '/operator/categories',
    '/operator/orders',
  ];
  for (const route of routes) {
    await page.goto(`${ec}${route}`);
    await expect(page.locator('.workspace-main').getByRole('heading').first()).toBeVisible();
    await expect(page.locator('.workspace-main')).not.toContainText('ページが見つかりません');
    await expect(page.locator('.workspace-main')).not.toContainText('この画面を利用する権限がありません。');
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${ec}/seller`);
  await expect(page).toHaveURL(`${ec}/seller/products`);
  await expect(page.locator('.workspace-sidebar')).toBeVisible();
  const sidebar = await page.locator('.workspace-sidebar').boundingBox();
  expect(sidebar.x).toBe(0);
  await page.screenshot({ path: 'artifacts/e2e/workspace-dashboard.png', fullPage: true });
  await page.getByRole('link', { name: '商品一覧へ戻る', exact: true }).click();
  await expect(page).toHaveURL(`${ec}/`);
  const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
  await expect(navigation.getByRole('link', { name: '出店者', exact: true })).toBeVisible();
  await expect(page.locator('.history-button svg')).toHaveCount(1);
  await expect(page.locator('.account-entry svg')).toHaveCount(1);
  await expect(page.locator('.site-header .bag-text')).toHaveText('カート');
  await expect(page.locator('.site-header a[href="/notifications"]')).toHaveCount(0);
  await expect(page.locator('.store-strip')).toHaveCount(0);
  await expect(page.locator('.benefits')).toHaveCount(0);
  const hero = await page.locator('.hero').boundingBox();
  const catalog = await page.locator('.catalog').boundingBox();
  expect(catalog.x).toBe(hero.x);
  expect(catalog.width).toBe(hero.width);
  await page.screenshot({ path: 'artifacts/e2e/ec-header-wide.png', fullPage: false });
  await page.locator('.catalog').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/e2e/ec-catalog-wide.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await navigation.getByRole('link', { name: '出店者', exact: true }).scrollIntoViewIfNeeded();
  await expect(navigation.getByRole('link', { name: '出店者', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/ec-header-mobile.png', fullPage: false });
  await page.getByRole('link', { name: 'アカウント', exact: true }).click();
  await expect(page.locator('.workspace-main h1')).toHaveText('アカウント情報');
  await page.reload();
  await expect(page.locator('.workspace-main h1')).toHaveText('アカウント情報');
  const session = await page.request.get(`${ec}/api/auth/me`).then((r) => r.json());
  expect(session.accountType).toBe('ADMIN');
  await writeFile('artifacts/e2e/workspace-session.json', JSON.stringify(session, null, 2));
  expect(errors).toEqual([]);
});
