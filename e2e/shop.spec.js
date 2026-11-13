import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createScarceProduct, removeScarceProduct, replenishOrder, sql } from './database.js';
import { ec, login, call, prepareMember } from './business-helpers.js';

// Issue #113: a cart needs a signed-in buyer (#10), the pickup store is the product's store (#70, #119), and the
// order is paid at the store unless a card is chosen (#131).
async function buyer(page) {
  prepareMember(await login(page, 'test.user@example.com'), 'USER');
  await page.goto(`${ec}/`);
}

test('browse, search, real cart, checkout and reload persisted order', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let order;
  try {
    await buyer(page);
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
    // The catalog lists every store's public products; the order follows the prices the API returns.
    const prices = (await call(page.request, '/products').then((r) => r.json())).map((p) => p.priceYen);
    await page.getByLabel('商品の並び順').selectOption('price-desc');
    await expect(page.locator('.product-card').first()).toContainText(Math.max(...prices).toLocaleString('ja-JP'));
    await page.getByLabel('商品の並び順').selectOption('price-asc');
    await expect(page.locator('.product-card').first()).toContainText(Math.min(...prices).toLocaleString('ja-JP'));
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
    await expect(page.getByRole('heading', { name: 'お支払い・受け取りの確認' })).toBeVisible();
    await expect(page.getByTestId('checkout-store')).toContainText('二子玉川ガーデン');
    await expect(page.getByTestId('checkout-payment')).toContainText('店頭払い');
    const saved = page.waitForResponse(
      (response) => response.url().endsWith('/api/orders') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '注文を確定する' }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    [order] = (await response.json()).orders;
    expect(order.totalYen).toBe(13600);
    await expect(page.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'カートを開く（0点）' })).toBeVisible();
    await page.goto(`${ec}/purchases`);
    await expect(page.getByTestId(`order-${order.id}`)).toBeVisible();
    const history = await call(page.request, '/orders').then((r) => r.json());
    expect(history[0].id).toBe(order.id);
    await mkdir('artifacts/e2e', { recursive: true });
    await writeFile('artifacts/e2e/order-after-reload.json', JSON.stringify(history, null, 2));
    await page.screenshot({ path: 'artifacts/e2e/order-after-reload.png', fullPage: true });
    await page.goto(`${ec}/`);
    await page.screenshot({ path: 'artifacts/e2e/catalog-desktop.png' });
    expect(errors).toEqual([]);
  } finally {
    if (order) replenishOrder(order, 1);
  }
});

test('store guide, stock shortage and cart removal', async ({ page }) => {
  const productId = createScarceProduct();
  try {
    await buyer(page);
    // The store guide orders the stores by distance; the pickup store is not chosen there.
    await page.getByRole('button', { name: '店舗一覧', exact: true }).click();
    await page.getByLabel('距離の基準').selectOption('横浜駅');
    await expect(page.locator('.store-card').first()).toContainText('横浜グリーンハウス');
    await expect(page.locator('.store-card').first()).toContainText('0 km');
    await expect(page.getByRole('button', { name: 'この店舗で受け取る' })).toHaveCount(0);
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.getByLabel('植物を検索').fill(productId);
    const card = page.getByTestId(`product-${productId}`);
    await card.getByRole('button', { name: 'Concurrency fixtureをカートに追加', exact: true }).click();
    await expect(page.getByRole('link', { name: 'カートを開く（1点）' })).toBeVisible();
    // The last unit is sold elsewhere while the buyer still has it in the cart.
    sql(`UPDATE inventory SET quantity=0 WHERE product_id='${productId}';`);
    await page.reload();
    await page.getByLabel('植物を検索').fill(productId);
    await expect(card.getByRole('button', { name: 'Concurrency fixtureをカートに追加', exact: true })).toBeDisabled();
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await expect(page.locator('.cart-content')).toContainText('在庫不足');
    await expect(page.getByRole('button', { name: '注文内容を確認する' })).toBeDisabled();
    await page.getByRole('button', { name: 'Concurrency fixtureを削除' }).click();
    await expect(page.getByRole('heading', { name: 'まだ商品が入っていません。' })).toBeVisible();
    await page.goto(`${ec}/`);
    await page.getByLabel('植物を検索').fill(productId);
    await page.getByRole('checkbox', { name: '在庫ありのみ' }).check();
    await expect(card).toHaveCount(0);
    const cart = await call(page.request, '/cart').then((r) => r.json());
    expect(cart.items).toHaveLength(0);
  } finally {
    removeScarceProduct(productId);
  }
});

test('mobile layout, images, keyboard dialog and empty search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ec}/`);
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
  await buyer(page);
  await page.route('**/api/cart', (route) => route.abort());
  await page.reload();
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
    await buyer(page);
    await expect(page.getByTestId('product-rosemary')).toBeVisible();
    const before = (await call(page.request, '/products?storeId=1').then((r) => r.json())).find(
      (product) => product.id === 'rosemary',
    ).stock;
    const ordersBefore = (await call(page.request, '/orders').then((r) => r.json())).length;
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
        [order] = (await saved.json()).orders;
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
    await page.goto(`${ec}/purchases`);
    await expect(page.getByTestId(`order-${order.id}`)).toBeVisible();
    const history = await call(page.request, '/orders').then((r) => r.json());
    expect(history).toHaveLength(ordersBefore + 1);
    expect(history[0].id).toBe(order.id);
    const after = await call(page.request, '/products?storeId=1').then((r) => r.json());
    expect(after.find((product) => product.id === 'rosemary').stock).toBe(before - 1);
    await mkdir('artifacts/e2e', { recursive: true });
    await writeFile('artifacts/e2e/checkout-retry-after-reload.json', JSON.stringify(history, null, 2));
    await page.screenshot({ path: 'artifacts/e2e/checkout-retry-after-reload.png', fullPage: true });
  } finally {
    if (order) replenishOrder(order, 1);
  }
});
