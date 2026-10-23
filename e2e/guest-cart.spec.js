import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, login, call, password, prepareMember } from './business-helpers.js';
import { sql } from './database.js';

test.use({ trace: 'off' });
const evidence = 'artifacts/guest-cart';
const cartCounts = () => sql("SELECT CONCAT((SELECT COUNT(*) FROM carts), ':', (SELECT COUNT(*) FROM cart_items));");
const storage = (page) => page.evaluate(async () => ({
  local: Object.keys(localStorage), session: Object.keys(sessionStorage), databases: (await indexedDB.databases()).map((db) => db.name),
}));

async function addFromCatalog(page, product) {
  await page.getByLabel('植物を検索', { exact: true }).fill(product.sku);
  await page.getByTestId(`product-${product.id}`).getByRole('button', { name: `${product.name}をカートに追加`, exact: true }).click();
}

async function openCart(page) {
  await page.locator('.kusakari-site-header').getByRole('link', { name: /^カートを開く/ }).click();
  await expect(page).toHaveURL(ec + '/cart');
}

test('guest cart supports edits without API writes or persistence and reload clears it', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  const before = cartCounts();
  const writes = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/cart') && request.method() !== 'GET') writes.push(request.method());
  });
  await page.goto(ec);
  const beforeStorage = await storage(page);
  const products = await page.request.get('/api/products?storeId=1').then((r) => r.json());
  const product = products.find((item) => item.active && item.stock >= 3);
  expect(product).toBeTruthy();
  await addFromCatalog(page, product);
  await openCart(page);
  const line = page.locator('.cart-line');
  await expect(line).toContainText(product.name);
  await line.getByRole('button', { name: `${product.name}を1個増やす`, exact: true }).click();
  await expect(line.getByLabel('数量', { exact: true })).toHaveText('2');
  await line.getByRole('button', { name: `${product.name}を1個減らす`, exact: true }).click();
  await expect(line.getByLabel('数量', { exact: true })).toHaveText('1');
  await line.getByRole('button', { name: `${product.name}を削除`, exact: true }).click();
  await expect(line).toHaveCount(0);
  await page.getByRole('tabpanel').getByRole('link', { name: '植物を探す', exact: true }).click();
  await addFromCatalog(page, product);
  await openCart(page);
  await expect(line).toHaveCount(1);
  await expect(page.getByText('このカートは一時的なものです。', { exact: false })).toBeVisible();
  await page.screenshot({ path: `${evidence}/guest-cart.png`, fullPage: true });
  expect(writes).toEqual([]);
  expect(await storage(page)).toEqual(beforeStorage);
  expect(cartCounts()).toBe(before);
  expect((await page.request.get('/api/cart')).status()).toBe(401);
  expect((await call(page.request, '/cart/guest-items', 'PUT', { storeId: 1, revision: 0,
    items: [{ productId: product.id, quantity: 1 }] })).status()).toBe(401);
  expect((await call(page.request, '/orders', 'POST', { requestId: crypto.randomUUID(), revision: 0, expectedTotalYen: product.priceYen })).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'まだ植物が入っていません。', exact: true })).toBeVisible();
  await expect(page.locator('.cart-line')).toHaveCount(0);
  expect(cartCounts()).toBe(before);
  await page.screenshot({ path: `${evidence}/guest-after-reload.png`, fullPage: true });
  await writeFile(`${evidence}/anonymous.json`, JSON.stringify({ productId: product.id, before, after: cartCounts(), cartWrites: writes }, null, 2));
});

test('guest cart requires checkout login, merges only after authentication and retries a lost response once', async ({ page, browser }) => {
  await mkdir(evidence, { recursive: true });
  const existingContext = await browser.newContext();
  const existing = await existingContext.newPage();
  try {
    prepareMember(await login(existing, 'test.user@example.com'), 'USER');
    const empty = await call(existing.request, '/cart').then((r) => r.json());
    const products = await call(existing.request, `/products?storeId=${empty.storeId}`).then((r) => r.json());
    const product = products.find((item) => item.active && item.stock >= 3);
    expect(product).toBeTruthy();
    const saved = await call(existing.request, `/cart/items/${product.id}`, 'PUT', { quantity: 1, revision: empty.revision }).then((r) => r.json());
    await page.goto(ec);
    if (saved.storeId !== 1) {
      await page.locator('.kusakari-site-header').getByRole('button', { name: '店舗を探す', exact: true }).click();
      await page.locator('.store-card').filter({ hasText: saved.storeName }).getByRole('button', { name: 'この店舗で受け取る', exact: true }).click();
      await page.getByRole('button', { name: '閉じる', exact: true }).click();
    }
    await page.getByLabel('植物を検索', { exact: true }).fill(product.sku);
    await page.getByTestId(`product-${product.id}`).getByRole('button', { name: `${product.name}の詳細`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'カートに追加', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    await openCart(page);
    await page.getByRole('button', { name: '注文内容を確認する', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${ec}/account/login\\?returnTo=`));
    expect(await call(existing.request, '/cart').then((r) => r.json())).toEqual(saved);
    let importCalls = 0;
    await page.route('**/api/cart/guest-items', async (route) => {
      importCalls += 1;
      await route.fetch(); // Real API write; inject only a lost response after the transaction commits.
      await route.abort('failed');
    });
    await page.getByLabel('メールアドレス', { exact: true }).fill('test.user@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await call(page.request, '/auth/me').then((r) => r.json())).authenticated).toBe(true);
    const expected = (saved.items.find((line) => line.product.id === product.id)?.quantity ?? 0) + 1;
    await expect.poll(async () => (await call(page.request, '/cart').then((r) => r.json())).items.find((line) => line.product.id === product.id)?.quantity).toBe(expected);
    await page.unroute('**/api/cart/guest-items');
    await page.getByRole('button', { name: 'カートを引き継いで続ける', exact: true }).click();
    await expect(page).toHaveURL(ec + '/cart');
    await page.reload();
    const cart = await call(page.request, '/cart').then((r) => r.json());
    expect(cart.items.find((line) => line.product.id === product.id).quantity).toBe(expected);
    expect(importCalls).toBe(1);
    await expect(page.locator('.cart-line').filter({ hasText: product.name })).toBeVisible();
    await page.getByRole('button', { name: '注文内容を確認する', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'お支払い・受け取りの確認', exact: true })).toBeVisible();
    await page.screenshot({ path: `${evidence}/authenticated-confirmation.png`, fullPage: true });
    await writeFile(`${evidence}/authenticated-cart.json`, JSON.stringify({ before: saved, after: cart, expected, importCalls }, null, 2));
  } finally { await existingContext.close(); }
});

test('guest cart import validates every line and stale revisions without partially changing the member cart', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await login(page, 'test.user@example.com');
  const before = await call(page.request, '/cart').then((r) => r.json());
  const products = await call(page.request, `/products?storeId=${before.storeId}`).then((r) => r.json());
  const product = products.find((item) => item.active && item.stock >= 1);
  const invalid = await call(page.request, '/cart/guest-items', 'PUT', { storeId: before.storeId, revision: before.revision,
    items: [{ productId: product.id, quantity: 1 }, { productId: 'missing-guest-product', quantity: 1 }] });
  expect(invalid.status()).toBe(409);
  expect(await call(page.request, '/cart').then((r) => r.json())).toEqual(before);
  const stale = await call(page.request, '/cart/guest-items', 'PUT', { storeId: before.storeId, revision: before.revision + 1,
    items: [{ productId: product.id, quantity: 1 }] });
  expect(stale.status()).toBe(409);
  const after = await call(page.request, '/cart').then((r) => r.json());
  expect(after).toEqual(before);
  await writeFile(`${evidence}/atomic-import.json`, JSON.stringify({ before, after }, null, 2));
});
