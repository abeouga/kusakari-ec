import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('unconfigured Cognito does not claim registration or login success', async ({ page }) => {
  await page.goto('/account');
  await expect(page.getByText('Cognitoが未設定のため、ログイン・新規登録は利用できません。')).toBeVisible();
  await page.getByRole('link', { name: '新規登録', exact: true }).click();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByText('Cognitoが未設定のため、ログイン・新規登録は利用できません。')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Cognitoが未設定のため、ログイン・新規登録は利用できません。')).toBeVisible();
  expect((await (await page.request.get('/api/auth/me')).json()).authenticated).toBe(false);
});

test('seller application, review, store pickup and buyer notifications share mock state', async ({ page }) => {
  await page.goto('/seller/application');
  await page.getByLabel('会社・事業者名').fill('モック申請園芸店');
  await page.getByLabel('担当者名', { exact: true }).fill('確認 担当者');
  await page.getByLabel('連絡先メール').fill('new-seller@example.jp');
  await page.getByLabel('所在地').fill('神奈川県横浜市');
  await page.getByLabel('電話番号').fill('045-000-0000');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '出店を申請', exact: true }).click();
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await page.getByRole('link', { name: '管理者画面', exact: true }).click();
  await expect(page.locator('.kusakari-site-header')).toContainText('管理者画面');
  await page.getByRole('link', { name: '出店審査', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'モック申請園芸店' });
  await row.getByRole('button', { name: '却下', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('理由');
  await page.getByLabel('審査コメント・却下理由').fill('入力内容を確認しました');
  await row.getByRole('button', { name: '承認', exact: true }).click();
  await expect(row).toContainText('承認済み');
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'メインナビゲーション' })
    .getByRole('link', { name: '出店者', exact: true })
    .click();
  await page.getByRole('link', { name: '出店者通知', exact: true }).click();
  await expect(page.locator('.workspace-main')).toContainText('出店審査：承認済み');
  await page.getByRole('link', { name: '店舗受け取り', exact: true }).click();
  await expect(page.getByText('受取店舗：湘南オリーブ園', { exact: true })).toBeVisible();
  await expect(page.getByText(/配送先|発送日|配送会社|追跡番号/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '引き渡し完了にする', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '受取準備完了にする', exact: true }).click();
  await page.getByRole('button', { name: '受取準備完了を確定', exact: true }).click();
  await expect(page.getByRole('button', { name: '受取準備完了にする', exact: true })).toBeDisabled();
  await expect(page.getByRole('table')).toContainText('受取準備完了');
  await page.getByRole('combobox', { name: '注文状態', exact: true }).selectOption('受取準備完了');
  await expect(page.getByRole('table')).toContainText('SAMPLE-1001');
  await expect(page.getByRole('table')).not.toContainText('SAMPLE-1002');
  await page.getByRole('link', { name: 'アカウント', exact: true }).click();
  await page.getByRole('link', { name: '注文履歴' }).click();
  const preparingOrder = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'SAMPLE-1001', exact: true }) });
  await expect(preparingOrder).toContainText('受取準備完了');
  await expect(preparingOrder.getByRole('button', { name: 'キャンセルを申請', exact: true })).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'メインナビゲーション' })
    .getByRole('link', { name: '出店者', exact: true })
    .click();
  await page.getByRole('link', { name: '店舗受け取り', exact: true }).click();
  await page.getByRole('button', { name: '引き渡し完了にする', exact: true }).click();
  await page.getByRole('button', { name: '引き渡し完了を確定', exact: true }).click();
  await expect(page.getByRole('button', { name: '引き渡し完了にする', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: '注文状態', exact: true }).selectOption('引き渡し完了');
  await expect(page.getByRole('table')).toContainText('SAMPLE-1001');
  await mkdir('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/workspace-seller-orders.png', fullPage: true });
  await page.getByRole('link', { name: 'アカウント', exact: true }).click();
  await page.getByRole('link', { name: '通知一覧', exact: true }).click();
  await expect(page.getByRole('button', { name: /SAMPLE-1001の受取準備完了/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /SAMPLE-1001の引き渡し完了/ })).toHaveCount(1);
  await page.getByRole('button', { name: /SAMPLE-1001の受取準備完了/ }).click();
  await expect(page.locator('.workspace-main')).toContainText('営業時間：10:00〜18:00');
  await page.getByRole('link', { name: '注文履歴' }).click();
  await expect(page.locator('.workspace-main')).toContainText('引き渡し完了');
  await expect(page.locator('.workspace-main')).toContainText(
    '受取準備完了・引き渡し完了・キャンセル済みの注文は申請できません',
  );
  await page.getByRole('link', { name: '管理者画面', exact: true }).click();
  await page.getByRole('link', { name: '全注文管理', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'SAMPLE-1001' })).toContainText('引き渡し完了');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'SAMPLE-1001' })).toContainText('注文受付');
  await page.screenshot({ path: 'artifacts/e2e/pickup-after-reload.png', fullPage: true });
  const health = await page.request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  await writeFile('artifacts/e2e/pickup-api-health.json', JSON.stringify(await health.json(), null, 2));
});

test('operator category CRUD and responsive navigation', async ({ page }) => {
  await page.goto('/operator/categories');
  await page.getByLabel('カテゴリ名').fill('確認用カテゴリ');
  await page.getByRole('button', { name: 'カテゴリを追加' }).click();
  const row = page.getByRole('row').filter({ hasText: '確認用カテゴリ' });
  await row.getByRole('button', { name: '編集', exact: true }).click();
  await page.getByLabel('カテゴリ名').fill('変更済みカテゴリ');
  await page.getByRole('button', { name: '変更を保存' }).click();
  await page
    .getByRole('row')
    .filter({ hasText: '変更済みカテゴリ' })
    .getByRole('button', { name: '削除', exact: true })
    .click();
  await page.getByRole('button', { name: '削除を確定' }).click();
  await expect(page.locator('table')).not.toContainText('変更済みカテゴリ');
  await page.screenshot({ path: 'artifacts/e2e/workspace-operator.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('デモ画面の切り替え')).toHaveCount(0);
  await expect(page.locator('.kusakari-site-header')).toContainText('管理者画面');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/workspace-mobile.png', fullPage: true });
});

test('incoming Canvas materials are validated and use the real product API', async ({ page }) => {
  const items = [
    { materialCode: 'plant.oak', quantity: 2, unit: 'piece' },
    { materialCode: 'garden.bench', quantity: 1, unit: 'piece' },
  ];
  await page.goto(`/materials#${new URLSearchParams({ 'canvas-items': JSON.stringify(items) })}`);
  await expect(page.locator('.material-candidate')).toHaveCount(2);
  await expect(page.locator('.material-results')).toContainText('コナラ');
  await page.locator('.material-candidate').first().getByRole('button', { name: 'カートに追加' }).click();
  await expect(page.getByRole('status')).toContainText('カートを更新');
  const cart = await (await page.request.get('/api/cart')).json();
  expect(cart.items.find((item) => item.product.id === 'canvas-oak').quantity).toBe(2);
  await page.goto(
    `/materials#${new URLSearchParams({ 'canvas-items': JSON.stringify([{ materialCode: 'plant.oak', quantity: -1, unit: 'piece' }]) })}`,
  );
  await expect(page.getByRole('alert')).toContainText('1〜99');
  await expect(page.locator('.material-candidate')).toHaveCount(0);
  await page.goto(
    `/materials#${new URLSearchParams({ 'canvas-items': JSON.stringify([{ materialCode: 'plant.unknown', quantity: 1, unit: 'piece' }]) })}`,
  );
  await expect(page.locator('.material-results')).toContainText('対応する商品はありません');
  await expect(page.locator('.material-candidate')).toHaveCount(0);
});

test('buyer, seller and operator routes render without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const routes = [
    '/account',
    '/notifications',
    '/purchases',
    '/store/1',
    '/seller',
    '/seller/products',
    '/seller/orders',
    '/seller/sales',
    '/seller/profile',
    '/seller/application',
    '/seller/notifications',
    '/operator',
    '/operator/applications',
    '/operator/members',
    '/operator/sellers',
    '/operator/products',
    '/operator/categories',
    '/operator/orders',
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('.workspace-main h1')).toBeVisible();
    await expect(page.locator('.workspace-main')).not.toContainText('ページが見つかりません');
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/seller');
  await expect(page.locator('.workspace-sidebar')).toBeVisible();
  const sidebar = await page.locator('.workspace-sidebar').boundingBox();
  expect(sidebar.x).toBe(0);
  await expect(page.locator('.workspace-header select')).toHaveCount(0);
  await expect(page.locator('.workspace-sidebar nav a svg')).toHaveCount(8);
  await page.screenshot({ path: 'artifacts/e2e/workspace-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
  await expect(navigation.locator('button').filter({ hasText: 'Kusakariについて' }).locator('+ a')).toHaveText(
    '出店者',
  );
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
  await expect(page.locator('.workspace-main h1')).toHaveText('ユーザーアカウント');
  expect(errors).toEqual([]);
});
