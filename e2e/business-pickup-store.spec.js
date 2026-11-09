import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add } from './business-helpers.js';
import { replenishOrder, sql } from './database.js';

test.use({ trace: 'off' });

// Issue #70: the cart has no pickup-store control. Each line is picked up at the store whose stock it was
// added from, checkout creates one order per pickup store, and each store's stock is reduced.
test('cart lines keep their own pickup store and checkout splits orders per store', async ({ browser }) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  const errors = [];
  buyer.on('pageerror', (error) => errors.push(error.message));
  let yokohamaOrder;
  try {
    prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    const input = productInput();
    const created = await call(seller.request, '/products', 'POST', input);
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();

    // Store 1 sells the seller's product; the buyer then browses store 2 and adds its lavender.
    const cart = await call(buyer.request, '/cart').then((r) => r.json());
    expect((await call(buyer.request, '/cart/store', 'PUT', { storeId: 1, revision: cart.revision })).status()).toBe(
      200,
    );
    await add(buyer.request, product.id, 1);
    const stock = (storeId, id) =>
      Number(sql(`SELECT quantity FROM inventory WHERE store_id=${storeId} AND product_id='${id}';`));
    const lavenderBefore = stock(2, 'lavender');
    expect(lavenderBefore).toBeGreaterThan(0);

    await buyer.goto(ec);
    await buyer.getByRole('button', { name: '店舗を探す', exact: true }).click();
    const yokohama = buyer.locator('.store-card').filter({ hasText: '横浜グリーンハウス' });
    await yokohama.getByRole('button', { name: 'この店舗で受け取る' }).click();
    await expect(yokohama.getByRole('button', { name: '選択中' })).toBeVisible();
    await buyer.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    await buyer
      .getByTestId('product-lavender')
      .getByRole('button', { name: /をカートに追加$/ })
      .click();
    await expect(buyer.getByRole('link', { name: 'カートを開く（2点）' })).toBeVisible();

    // The cart shows each line's store and offers no way to change it.
    await buyer.goto(`${ec}/cart`);
    await expect(buyer.locator('.cart-line')).toHaveCount(2);
    await expect(buyer.locator('.cart-store')).toHaveCount(0);
    await expect(buyer.locator('.cart-content').getByRole('button', { name: '変更', exact: true })).toHaveCount(0);
    const line = (name) => buyer.locator('.cart-line').filter({ hasText: name }).locator('.cart-line-store');
    await expect(line(input.name)).toHaveText('受取店舗：二子玉川ガーデン');
    await expect(line('ラベンダー')).toHaveText('受取店舗：横浜グリーンハウス');
    await mkdir('artifacts/business', { recursive: true });
    await buyer.screenshot({ path: 'artifacts/business/pickup-store-cart.png', fullPage: true });

    await buyer.getByRole('button', { name: '注文内容を確認する' }).click();
    await expect(buyer.getByRole('heading', { name: 'お支払い・受け取りの確認' })).toBeVisible();
    await expect(buyer.getByTestId('checkout-store')).toHaveText([/二子玉川ガーデン/, /横浜グリーンハウス/]);
    await expect(buyer.getByRole('list', { name: '二子玉川ガーデンで受け取る商品' })).toContainText(input.name);
    await expect(buyer.getByRole('list', { name: '横浜グリーンハウスで受け取る商品' })).toContainText('ラベンダー');
    await buyer.screenshot({ path: 'artifacts/business/pickup-store-confirm.png', fullPage: true });

    const ordered = buyer.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await buyer.getByRole('button', { name: '注文を確定する', exact: true }).click();
    const response = await ordered;
    expect(response.status()).toBe(200);
    const { orders } = await response.json();
    expect(orders.map((order) => [order.storeId, order.storeName, order.items.map((item) => item.productId)])).toEqual([
      [1, '二子玉川ガーデン', [product.id]],
      [2, '横浜グリーンハウス', ['lavender']],
    ]);
    yokohamaOrder = orders[1];
    await expect(buyer.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();
    await expect(buyer.locator('.order-summary .order-store')).toHaveText([
      '受取店舗：二子玉川ガーデン',
      '受取店舗：横浜グリーンハウス',
    ]);
    await buyer.screenshot({ path: 'artifacts/business/pickup-store-complete.png', fullPage: true });

    // Each pickup store's own stock was reduced, and the store is recorded on its order.
    expect(stock(1, product.id)).toBe(input.stock - 1);
    expect(stock(2, 'lavender')).toBe(lavenderBefore - 1);
    for (const order of orders) {
      expect(sql(`SELECT store_id FROM orders WHERE id='${order.id}';`)).toBe(String(order.storeId));
    }

    await buyer.goto(`${ec}/purchases`);
    await buyer.reload();
    for (const order of orders) await expect(buyer.getByTestId(`order-${order.id}`)).toContainText(order.storeName);
    const history = await call(buyer.request, '/orders').then((r) => r.json());
    const saved = orders.map((order) => history.find((entry) => entry.id === order.id));
    expect(saved.map((order) => order.storeId)).toEqual([1, 2]);
    await writeFile('artifacts/business/pickup-store-orders.json', JSON.stringify(saved, null, 2));
    await buyer.screenshot({ path: 'artifacts/business/pickup-store-history.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    // Restore the shared demo product's stock; the seller's product belongs to this test.
    if (yokohamaOrder) replenishOrder(yokohamaOrder, 2);
    await buyerContext.close();
    await sellerContext.close();
  }
});
