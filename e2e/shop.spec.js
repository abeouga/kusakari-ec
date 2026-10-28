import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { replenishOrder } from './database.js';

test('browse, search, real cart, checkout and reload persisted order', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let order;
  try {
    await page.goto('/');
    await expect(page.getByTestId('product-olive')).toBeVisible();
    await page.getByRole('link', { name: '植物を探す', exact: true }).first().click();
    await expect(page).toHaveURL(/#plants$/);
    await page.getByRole('button', { name: 'ハーブ', exact: true }).click();
    await expect(page.getByTestId('product-rosemary')).toBeVisible();
    await expect(page.getByTestId('product-olive')).toHaveCount(0);
    await page.getByRole('button', { name: 'すべて', exact: true }).click();
    await page.getByLabel('植物を検索').fill('monstera');
    await expect(page.getByTestId('product-monstera')).toBeVisible();
    await expect(page.getByTestId('product-olive')).toHaveCount(0);
    await page.getByLabel('植物を検索').fill('  ks-olv-001  ');
    await expect(page.getByTestId('product-olive')).toBeVisible();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'ハーブ', exact: true }).click();
    await expect(page.locator('.product-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'すべて', exact: true }).click();
    await page.getByRole('button', { name: '検索をクリア' }).click();
    await page.getByLabel('商品の並び順').selectOption('price-desc');
    await expect(page.locator('.product-card').first()).toHaveAttribute('data-testid', 'product-canvas-bench');
    await page.getByLabel('商品の並び順').selectOption('price-asc');
    await expect(page.locator('.product-card').first()).toHaveAttribute('data-testid', 'product-canvas-brick');
    await page.getByRole('button', { name: 'オリーブの詳細', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('KS-OLV-001');
    await page.getByRole('dialog').getByRole('button', { name: 'カートに追加', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('カートを更新');
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await page.getByRole('button', { name: 'オリーブを1個増やす' }).click();
    await expect(page.locator('.quantity-control')).toHaveText('2');
    await expect(page.locator('.grand-total')).toContainText('13,600');
    await page.reload();
    await expect(page.getByRole('link', { name: 'カートを開く（2点）' })).toBeVisible();
    await page.getByRole('button', { name: '注文内容を確認する' }).click();
    await expect(page.getByRole('heading', { name: '注文内容の確認' })).toBeVisible();
    const saved = page.waitForResponse(
      (response) => response.url().endsWith('/api/orders') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '注文を確定する' }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    order = await response.json();
    expect(order.totalYen).toBe(13600);
    await expect(page.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'カートを開く（0点）' })).toBeVisible();
    await page.getByRole('link', { name: '注文履歴', exact: true }).first().click();
    await expect(page.getByTestId(`order-${order.id}`)).toBeVisible();
    const history = await page.request.get('/api/orders');
    expect((await history.json())[0].id).toBe(order.id);
    await mkdir('artifacts/e2e', { recursive: true });
    await writeFile('artifacts/e2e/order-after-reload.json', JSON.stringify(await history.json(), null, 2));
    await page.screenshot({ path: 'artifacts/e2e/order-after-reload.png', fullPage: true });
    await page.goto('/');
    await page.screenshot({ path: 'artifacts/e2e/catalog-desktop.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    if (order) replenishOrder(order, 1);
  }
});

test('nearest store, stock shortage, material match and cart removal', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('product-monstera').getByRole('button', { name: 'モンステラをカートに追加', exact: true }).click();
  await expect(page.getByRole('link', { name: 'カートを開く（1点）' })).toBeVisible();
  await page.getByRole('link', { name: /カートを開く/ }).click();
  await page.locator('.cart-store').getByRole('button', { name: '変更', exact: true }).click();
  await page.getByLabel('距離の基準').selectOption('横浜駅');
  await expect(page.locator('.store-card').first()).toContainText('横浜グリーンハウス');
  await expect(page.locator('.store-card').first()).toContainText('0 km');
  await page.locator('.store-card').first().getByRole('button', { name: 'この店舗で受け取る' }).click();
  await expect(page.locator('.store-card').first()).toContainText('選択中');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.goto('/');
  await expect(page.getByTestId('product-monstera').getByRole('button', { name: 'モンステラをカートに追加', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: /カートを開く/ }).click();
  await expect(page.locator('.cart-content')).toContainText('在庫不足');
  await expect(page.getByRole('button', { name: '注文内容を確認する' })).toBeDisabled();
  await page.getByRole('button', { name: 'モンステラを削除' }).click();
  await expect(page.getByRole('heading', { name: 'まだ植物が入っていません。' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('checkbox', { name: '在庫ありのみ' }).check();
  await expect(page.getByTestId('product-monstera')).toHaveCount(0);
  await page.getByRole('button', { name: '材料リストから探す' }).click();
  await page.getByRole('button', { name: '商品候補を検索' }).click();
  await expect(page.locator('.material-candidate')).toHaveCount(3);
  await page.locator('.material-candidate').first().getByRole('button', { name: 'カートに追加' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('カートを更新');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('link', { name: /カートを開く/ }).click();
  await expect(page.locator('.cart-store')).toContainText('横浜グリーンハウス');
  await page.getByRole('button', { name: 'オリーブを削除' }).click();
  await expect(page.getByRole('heading', { name: 'まだ植物が入っていません。' })).toBeVisible();
  const cart = await page.request.get('/api/cart');
  expect((await cart.json()).items).toHaveLength(0);
});

test('mobile layout, images, keyboard dialog and empty search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('product-olive')).toBeVisible();
  await page.evaluate(async () => {
    // Optional external fonts must not block checks of the actual local product images.
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => image.decode()));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('植物を検索').fill('存在しない植物');
  await expect(page.getByText('条件に合う植物が見つかりません。')).toBeVisible();
  await page.getByRole('button', { name: '条件をリセット' }).click();
  await page.getByRole('button', { name: 'ローズマリーの詳細', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('heading', { level: 1 }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await mkdir('artifacts/e2e', { recursive: true });
  // Preserved test products can make the full catalog exceed Chromium's capture limits.
  // Width overflow and every image are checked above; retain the actual mobile viewport as evidence.
  await page.screenshot({ path: 'artifacts/e2e/catalog-mobile.png', fullPage: false });
});

test('visible error and retry after an explicitly injected network outage', async ({ page }) => {
  await page.route('**/api/cart', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('サーバーに接続できません');
  await page.unroute('**/api/cart');
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.getByTestId('product-olive')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('checkout retry after an explicitly lost response keeps the same order', async ({ page }) => {
  let order;
  const payloads = [];
  try {
    await page.goto('/');
    await expect(page.getByTestId('product-rosemary')).toBeVisible();
    const productsResponse = await page.request.get('/api/products?storeId=1');
    const products = await productsResponse.json();
    const before = products.find((product) => product.id === 'rosemary').stock;
    await page.getByRole('button', { name: 'ローズマリーをカートに追加' }).click();
    await expect(page.getByRole('link', { name: 'カートを開く（1点）' })).toBeVisible();
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await page.getByRole('button', { name: '注文内容を確認する' }).click();
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      payloads.push(route.request().postDataJSON());
      if (payloads.length === 1) {
        // 実APIで注文を保存した後、ブラウザーへの応答だけを遮断します。
        const saved = await route.fetch();
        order = await saved.json();
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.getByRole('button', { name: '注文を確定する' }).click();
    await expect(page.getByRole('alert')).toContainText('サーバーに接続できません');
    await page.getByRole('button', { name: '注文を確定する' }).click();
    await expect(page.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    await page.reload();
    await expect(page.getByRole('link', { name: 'カートを開く（0点）' })).toBeVisible();
    await page.getByRole('link', { name: '注文履歴', exact: true }).first().click();
    await expect(page.getByTestId(`order-${order.id}`)).toBeVisible();
    const historyResponse = await page.request.get('/api/orders');
    const history = await historyResponse.json();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(order.id);
    const afterResponse = await page.request.get('/api/products?storeId=1');
    const after = await afterResponse.json();
    expect(after.find((product) => product.id === 'rosemary').stock).toBe(before - 1);
    await mkdir('artifacts/e2e', { recursive: true });
    await writeFile('artifacts/e2e/checkout-retry-after-reload.json', JSON.stringify(history, null, 2));
    await page.screenshot({ path: 'artifacts/e2e/checkout-retry-after-reload.png', fullPage: true });
  } finally {
    if (order) replenishOrder(order, 1);
  }
});
