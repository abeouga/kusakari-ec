import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add } from './business-helpers.js';
import { replenishOrder, sql } from './database.js';

test.use({ trace: 'off' });

// PR evidence at desktop and phone widths (no email addresses are shown on these pages).
async function shoot(page, name) {
  await page.screenshot({ path: `artifacts/business/${name}-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/business/${name}-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
}

// Issue #70: the cart has no pickup-store control. Each line is picked up at the store its product belongs to,
// checkout creates one order per pickup store, and each product's stock is reduced.
test('cart lines keep their own pickup store and checkout splits orders per store', async ({ browser }) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  const errors = [];
  buyer.on('pageerror', (error) => errors.push(error.message));
  let omiyaOrder;
  try {
    prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    const input = productInput();
    const created = await call(seller.request, '/products', 'POST', input);
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();

    // Store 1 sells the seller's product; the conifer belongs to store 3. The cart lists lines by product id,
    // and a generated id always sorts before 'garden-demo-conifer', so the order below is fixed.
    await add(buyer.request, product.id, 1);
    const stock = (id) => Number(sql(`SELECT quantity FROM inventory WHERE product_id='${id}';`));
    const coniferBefore = stock('garden-demo-conifer');
    expect(coniferBefore).toBeGreaterThan(0);

    await buyer.goto(ec);
    await buyer.getByRole('button', { name: '店舗を探す', exact: true }).click();
    // The store list is a guide: the pickup store is not chosen there.
    const omiya = buyer.locator('.store-card').filter({ hasText: '大宮ボタニカル' });
    await expect(omiya.getByRole('link', { name: '店舗の紹介を見る' })).toHaveAttribute('href', '/store/3');
    await expect(buyer.getByRole('dialog').getByRole('button', { name: 'この店舗で受け取る' })).toHaveCount(0);
    await buyer.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    // The catalog lists every store's products with the store that sells each one.
    await buyer.getByLabel('植物を検索').fill('円錐形の針葉樹');
    const conifer = buyer.getByTestId('product-garden-demo-conifer');
    await expect(conifer).toContainText('販売店舗：大宮ボタニカル');
    await conifer.getByRole('button', { name: /をカートに追加$/ }).click();
    await expect(buyer.getByRole('link', { name: 'カートを開く（2点）' })).toBeVisible();

    // The cart shows each line's store and offers no way to change it.
    await buyer.goto(`${ec}/cart`);
    await expect(buyer.locator('.cart-line')).toHaveCount(2);
    await expect(buyer.locator('.cart-store')).toHaveCount(0);
    await expect(buyer.locator('.cart-content').getByRole('button', { name: '変更', exact: true })).toHaveCount(0);
    const line = (name) => buyer.locator('.cart-line').filter({ hasText: name }).locator('.cart-line-store');
    await expect(line(input.name)).toHaveText('受取店舗：二子玉川ガーデン');
    await expect(line('円錐形の針葉樹')).toHaveText('受取店舗：大宮ボタニカル');
    await mkdir('artifacts/business', { recursive: true });
    await shoot(buyer, 'pickup-store-cart');

    await buyer.getByRole('button', { name: '注文内容を確認する' }).click();
    await expect(buyer.getByRole('heading', { name: 'お支払い・受け取りの確認' })).toBeVisible();
    await expect(buyer.getByTestId('checkout-store')).toHaveText([/二子玉川ガーデン/, /大宮ボタニカル/]);
    await expect(buyer.getByRole('list', { name: '二子玉川ガーデンで受け取る商品' })).toContainText(input.name);
    await expect(buyer.getByRole('list', { name: '大宮ボタニカルで受け取る商品' })).toContainText('円錐形の針葉樹');
    await shoot(buyer, 'pickup-store-confirm');

    const ordered = buyer.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await buyer.getByRole('button', { name: '注文を確定する', exact: true }).click();
    const response = await ordered;
    expect(response.status()).toBe(200);
    const { orders } = await response.json();
    expect(orders.map((order) => [order.storeId, order.storeName, order.items.map((item) => item.productId)])).toEqual([
      [1, '二子玉川ガーデン', [product.id]],
      [3, '大宮ボタニカル', ['garden-demo-conifer']],
    ]);
    omiyaOrder = orders[1];
    await expect(buyer.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();
    await expect(buyer.locator('.order-summary .order-store')).toHaveText([
      '受取店舗：二子玉川ガーデン',
      '受取店舗：大宮ボタニカル',
    ]);
    await buyer.screenshot({ path: 'artifacts/business/pickup-store-complete.png', fullPage: true });

    // Each product's stock was reduced, and the store is recorded on its order.
    expect(stock(product.id)).toBe(input.stock - 1);
    expect(stock('garden-demo-conifer')).toBe(coniferBefore - 1);
    for (const order of orders) {
      expect(sql(`SELECT store_id FROM orders WHERE id='${order.id}';`)).toBe(String(order.storeId));
    }

    await buyer.goto(`${ec}/purchases`);
    await buyer.reload();
    for (const order of orders) await expect(buyer.getByTestId(`order-${order.id}`)).toContainText(order.storeName);
    const history = await call(buyer.request, '/orders').then((r) => r.json());
    const saved = orders.map((order) => history.find((entry) => entry.id === order.id));
    expect(saved.map((order) => order.storeId)).toEqual([1, 3]);
    await writeFile('artifacts/business/pickup-store-orders.json', JSON.stringify(saved, null, 2));
    await buyer.screenshot({ path: 'artifacts/business/pickup-store-history.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    // Restore the shared demo product's stock; the seller's product belongs to this test.
    if (omiyaOrder) replenishOrder(omiyaOrder, 3);
    await buyerContext.close();
    await sellerContext.close();
  }
});
