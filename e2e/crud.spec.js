import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { replenishOrder, sql } from './database.js';

test('product CRUD, plant filters, gallery and archived cart through real MySQL', async ({ page }) => {
  test.setTimeout(90000);
  let product;
  const sku = `CRUD-${randomUUID().slice(0, 8)}`;
  try {
    await page.goto('/');
    await expect(page.getByTestId('product-olive')).toBeVisible();
    await page.getByRole('button', { name: '商品管理', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '新しい商品', exact: true }).click();
    await expect(page).toHaveURL(/\/seller\/products\/new$/);
    const manager = page.locator('.workspace-main');
    await addImages(manager, [
      'frontend/public/images/olive.png',
      'frontend/public/images/rosemary.png',
      'frontend/public/images/lavender.png',
    ]);
    await manager.getByLabel('商品名', { exact: true }).fill('CRUDデモ植物');
    await manager.getByLabel('商品番号', { exact: true }).fill(sku);
    await manager.getByRole('combobox', { name: 'カテゴリー', exact: true }).selectOption('ハーブ');
    await manager.getByLabel('税込価格（円）').fill('3200');
    await manager.getByLabel('選択店舗の在庫').fill('5');
    await manager.locator('summary').getByText('詳しい情報', { exact: true }).click();
    await manager.getByLabel('生産者名', { exact: true }).fill('CRUDデモ農園');
    await manager.getByLabel('商品説明', { exact: true }).fill('専用DBだけに保存するテスト用の商品です。');
    const existingProducts = await page.request.get('/api/products?storeId=1').then((r) => r.json());
    await manager.locator('summary').getByText('サイズ', { exact: true }).click();
    await manager.getByLabel('植物の高さ（cm・土際から）', { exact: true }).fill('275');
    await manager
      .getByLabel('商品番号', { exact: true })
      .fill(existingProducts.find((item) => item.id === 'olive').sku);
    await manager.getByRole('button', { name: '次へ', exact: true }).click();
    await manager.getByRole('button', { name: '手動で設定', exact: true }).click();
    await manager.getByRole('button', { name: '次へ', exact: true }).click();
    const rejected = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await manager.getByRole('button', { name: '出品する', exact: true }).click();
    const rejectedResponse = await rejected;
    expect(rejectedResponse.status()).toBe(409);
    const rejectedInput = rejectedResponse.request().postDataJSON();
    expect(rejectedInput.heightCm).toBe(275);
    expect(rejectedInput.plantModelProfile.heightCm).toBe(rejectedInput.heightCm);
    await expect(page).toHaveURL(/\/seller\/products\/new$/);
    await expect(manager.getByRole('alert')).toBeVisible();
    await expect(manager.getByLabel('商品名', { exact: true })).toHaveValue('CRUDデモ植物');
    await manager.getByRole('button', { name: '商品情報を修正', exact: true }).click();
    await manager.getByLabel('商品番号', { exact: true }).fill(sku);
    await manager.getByRole('button', { name: '次へ', exact: true }).click();
    await manager.getByRole('button', { name: '設定せず次へ', exact: true }).click();
    const created = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await manager.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(200);
    product = await response.json();
    const input = response.request().postDataJSON();
    expect((await page.request.post('/api/products', { data: input })).status()).toBe(409);
    expect((await page.request.post('/api/products', { data: { ...input, priceYen: -1 } })).status()).toBe(400);
    expect(
      (await page.request.post('/api/products', { data: { ...input, imageUrl: 'javascript:alert(1)' } })).status(),
    ).toBe(400);
    expect((await page.request.post('/api/products', { data: { ...input, ownerId: 'unexpected' } })).status()).toBe(
      400,
    );
    await expect(manager.getByRole('status')).toContainText('商品を保存');
    await expect(page).toHaveURL(/\/seller\/products$/);
    // Set test-owned catalog attributes directly; the removed guidance editor is not a setup path.
    sql(`UPDATE products SET sunlight='半日陰',care_level=3,use_case='室内インテリア' WHERE id='${product.id}';`);
    await page.reload();
    await expect(page.getByTestId(`manage-${product.id}`)).toBeVisible();
    await page.goto('/');
    await expect(page.getByTestId(`product-${product.id}`)).toBeVisible();
    await page.getByRole('combobox', { name: '日照条件', exact: true }).selectOption('半日陰');
    await page.getByRole('combobox', { name: '手入れレベル', exact: true }).selectOption('3');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'CRUDデモ植物の詳細', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('region', { name: '出品者Tips' })).toHaveCount(0);
    await page.getByRole('button', { name: '商品画像2', exact: true }).click();
    await expect(page.locator('.detail-main-image')).toHaveAttribute('src', product.images[0]);
    await mkdir('artifacts/e2e', { recursive: true });
    await page.screenshot({ path: 'artifacts/e2e/crud-detail-after-reload.png', fullPage: true });
    const catalog = await page.request.get('/api/products?storeId=1');
    const savedProduct = (await catalog.json()).find((item) => item.id === product.id);
    expect(savedProduct.images).toEqual(product.images);
    expect(savedProduct.careLevel).toBe(3);
    expect(savedProduct.heightCm).toBe(275);
    await writeFile('artifacts/e2e/crud-product-after-reload.json', JSON.stringify(savedProduct, null, 2));
    await page.getByLabel('購入数量').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'カートに追加', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('カートを更新');
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.getByRole('button', { name: '商品管理', exact: true }).click();
    await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
    await page.screenshot({ path: 'artifacts/e2e/crud-product-manager.png', fullPage: true });
    await page.getByRole('dialog').getByLabel('税込価格（円）').fill('3500');
    await page.getByRole('dialog').getByLabel('選択店舗の在庫').fill('2');
    await page.getByRole('button', { name: '変更を保存', exact: true }).click();
    await expect(page.getByTestId(`manage-${product.id}`)).toContainText('3,500');
    await page.reload();
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await expect(page.locator('.grand-total')).toContainText('7,000');
    const otherStock = await page.request.get('/api/products?storeId=2').then((r) => r.json());
    expect(otherStock.find((item) => item.id === product.id).stock).toBe(0);
    await page.goto('/');
    await page.getByRole('button', { name: '商品管理', exact: true }).click();
    await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('button', { name: '削除を確定', exact: true }).click();
    await expect(page.getByTestId(`manage-${product.id}`)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId(`product-${product.id}`)).toHaveCount(0);
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await expect(page.getByRole('button', { name: '注文内容を確認する' })).toBeDisabled();
    await page.getByRole('button', { name: 'CRUDデモ植物を削除', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'まだ植物が入っていません。' })).toBeVisible();
    expect(sql(`SELECT active FROM products WHERE id='${product.id}';`)).toBe('1');
    expect(sql(`SELECT publication_status FROM inventory WHERE product_id='${product.id}' AND store_id=1;`)).toBe(
      'DELETED',
    );
  } finally {
    if (product && /^[a-f0-9-]{36}$/.test(product.id)) {
      sql(
        `DELETE FROM cart_items WHERE product_id='${product.id}'; DELETE FROM product_images WHERE product_id='${product.id}'; DELETE FROM inventory WHERE product_id='${product.id}'; DELETE FROM products WHERE id='${product.id}';`,
      );
    }
  }
});

async function fillDelivery(page, name) {
  await page.getByRole('combobox', { name: '受取方法', exact: true }).selectOption('DELIVERY');
  await page.getByLabel('受取者名', { exact: true }).fill(name);
  await page.getByLabel('電話番号', { exact: true }).fill('000-0000-0000');
  await page.getByLabel('メールアドレス', { exact: true }).fill('demo@example.invalid');
  await page.getByLabel('郵便番号', { exact: true }).fill('000-0000');
  await page.getByLabel('住所', { exact: true }).fill('デモ県デモ市 サンプル住所');
  await page.getByLabel('建物名・部屋番号', { exact: true }).fill('デモ棟 101');
  await page.getByLabel('受取・配送希望日', { exact: true }).fill('2026-12-10');
  await page.getByRole('combobox', { name: '希望時間帯', exact: true }).selectOption('14-16');
  await page.getByRole('button', { name: '入力情報を保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('受取・配送情報を保存');
}

test('delivery CRUD, order snapshot edit and history deletion are persisted and isolated', async ({
  page,
  playwright,
}) => {
  await mkdir('artifacts/e2e', { recursive: true });
  let order;
  let checkoutBody;
  try {
    await page.goto('/');
    await expect(page.getByTestId('product-rosemary')).toBeVisible();
    await page.getByRole('button', { name: 'ローズマリーをカートに追加', exact: true }).click();
    await expect(page.getByRole('link', { name: 'カートを開く（1点）' })).toBeVisible();
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await fillDelivery(page, 'デモ受取者');
    await expect(page.locator('.grand-total')).toContainText('2,280');
    await page.reload();
    await expect(page.locator('.grand-total')).toContainText('2,280');
    await expect(page.getByLabel('受取者名', { exact: true })).toHaveValue('デモ受取者');
    await page.screenshot({ path: 'artifacts/e2e/crud-cart-after-reload.png', fullPage: true });
    await page.getByRole('button', { name: '入力情報を削除', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '受取方法', exact: true })).toHaveValue('PICKUP');
    await expect(page.getByLabel('受取者名', { exact: true })).toHaveValue('');
    await fillDelivery(page, 'デモ受取者');
    await page.getByRole('button', { name: '注文内容を確認する', exact: true }).click();
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '注文を確定する', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    checkoutBody = response.request().postDataJSON();
    order = await response.json();
    expect(order.totalYen).toBe(2280);
    expect(order.subtotalYen).toBe(1480);
    expect(order.shippingFeeYen).toBe(800);
    await expect(page.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '注文履歴', exact: true }).first().click();
    await page.getByRole('button', { name: '注文情報を編集', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '受取方法', exact: true })).toBeDisabled();
    await page.getByLabel('受取者名', { exact: true }).fill('変更後デモ受取者');
    await page.getByRole('button', { name: '入力情報を保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('変更後デモ受取者');
    await expect(page.getByRole('button', { name: '編集を閉じる' })).toHaveCount(0);
    const history = await page.request.get('/api/orders');
    const updated = (await history.json())[0];
    const other = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      expect((await other.put(`/api/orders/${order.id}`, { data: updated.details })).status()).toBe(404);
      expect((await other.delete(`/api/orders/${order.id}`)).status()).toBe(404);
    } finally {
      await other.dispose();
    }
    const cart = await page.request.get('/api/cart').then((r) => r.json());
    const different = { ...cart.details, recipientName: '別のカート受取者' };
    const invalidDate = { ...different, requestedDate: '2026-02-30' };
    expect(
      (
        await page.request.put('/api/cart/details', { data: { revision: cart.revision, details: invalidDate } })
      ).status(),
    ).toBe(400);
    const invalidPayment = { ...different, paymentMethod: 'STORE' };
    expect(
      (
        await page.request.put('/api/cart/details', { data: { revision: cart.revision, details: invalidPayment } })
      ).status(),
    ).toBe(400);
    expect(
      (await page.request.put('/api/cart/details', { data: { revision: cart.revision, details: different } })).status(),
    ).toBe(200);
    const unchanged = await page.request.get('/api/orders').then((r) => r.json());
    expect(unchanged[0].details.recipientName).toBe('変更後デモ受取者');
    await page.reload();
    await page.getByRole('button', { name: '注文履歴', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('変更後デモ受取者');
    await writeFile('artifacts/e2e/crud-order-after-reload.json', JSON.stringify(unchanged, null, 2));
    await page.screenshot({ path: 'artifacts/e2e/crud-order-after-reload.png', fullPage: true });
    await page.getByRole('button', { name: '履歴から削除', exact: true }).click();
    await page.getByRole('button', { name: '履歴削除を確定', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('注文履歴はまだありません');
    await page.reload();
    expect(await page.request.get('/api/orders').then((r) => r.json())).toHaveLength(0);
    const replay = await page.request.post('/api/orders', { data: checkoutBody });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).id).toBe(order.id);
    expect(sql(`SELECT COUNT(*) FROM orders WHERE id='${order.id}';`)).toBe('1');
  } finally {
    if (order) replenishOrder(order, 1);
  }
});

test('mobile detail and delivery form fit the screen and survive reload', async ({ page }) => {
  await mkdir('artifacts/e2e', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('product-olive')).toBeVisible();
  await page.getByRole('button', { name: 'オリーブの詳細', exact: true }).click();
  await expect(page.locator('.detail-main-image')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/crud-detail-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'ローズマリーをカートに追加', exact: true }).click();
  await page.getByRole('link', { name: /カートを開く/ }).click();
  await fillDelivery(page, 'モバイルデモ受取者');
  await page.reload();
  await expect(page.locator('.grand-total')).toContainText('2,280');
  await expect(page.getByLabel('受取者名', { exact: true })).toHaveValue('モバイルデモ受取者');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('受取者名', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/e2e/crud-cart-mobile.png', fullPage: true });
  const cart = await page.request.get('/api/cart').then((response) => response.json());
  await writeFile('artifacts/e2e/crud-cart-mobile.json', JSON.stringify(cart, null, 2));
});
