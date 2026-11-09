import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, login, call, password, prepareMember } from './business-helpers.js';
import { sql } from './database.js';

// Issue #10: signed-out visitors cannot add to or open a cart; after login the member cart works as usual.
test.use({ trace: 'off' });
const evidence = 'artifacts/login-required-cart';
const cartCounts = () => sql("SELECT CONCAT((SELECT COUNT(*) FROM carts), ':', (SELECT COUNT(*) FROM cart_items));");
const prompt = 'カートを利用するにはログインしてください。';

async function addFromCatalog(page, product) {
  await page.getByLabel('植物を検索', { exact: true }).fill(product.sku);
  await page
    .getByTestId(`product-${product.id}`)
    .getByRole('button', { name: `${product.name}をカートに追加`, exact: true })
    .click();
}

test('signed-out visitors are sent to login instead of using a cart', async ({ page, browser }) => {
  await mkdir(evidence, { recursive: true });
  // Detach any earlier cart of the test member so this run starts from its own empty cart.
  const fixtureContext = await browser.newContext();
  try {
    prepareMember(await login(await fixtureContext.newPage(), 'test.user@example.com'), 'USER');
  } finally {
    await fixtureContext.close();
  }
  const before = cartCounts();
  const writes = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/cart') && request.method() !== 'GET')
      writes.push(request.url());
  });

  await page.goto(ec);
  const products = await page.request.get(`${ec}/api/products?storeId=1`).then((r) => r.json());
  const product = products.find((item) => item.active && item.stock >= 2);
  expect(product).toBeTruthy();
  await addFromCatalog(page, product);
  await expect(page).toHaveURL(`${ec}/account/login?returnTo=${encodeURIComponent(`${ec}/`)}`);
  await expect(page.getByLabel('メールアドレス', { exact: true })).toBeVisible();

  for (const path of ['/cart', '/cart/gardens/any-garden']) {
    await page.goto(ec + path);
    await expect(page.getByRole('heading', { name: prompt, exact: true })).toBeVisible();
    await expect(page.getByLabel('メールアドレス', { exact: true })).toBeVisible();
    await expect(page.locator('.cart-content')).toHaveCount(0);
  }
  await page.screenshot({ path: `${evidence}/signed-out-cart.png`, fullPage: true });
  expect(writes).toEqual([]);
  const signedOutWrites = [...writes];
  expect(cartCounts()).toBe(before);
  const signedOut = {
    cart: (await page.request.get(`${ec}/api/cart`)).status(),
    write: (await call(page.request, `/cart/items/${product.id}`, 'PUT', { quantity: 1, revision: 0 })).status(),
    removedImport: (
      await call(page.request, '/cart/guest-items', 'PUT', {
        storeId: 1,
        revision: 0,
        items: [{ productId: product.id, quantity: 1 }],
      })
    ).status(),
  };
  expect(signedOut.cart).toBe(401);
  expect(signedOut.write).toBe(401);
  expect([401, 404, 405]).toContain(signedOut.removedImport);

  // Logging in from the cart prompt returns to the cart page.
  await page.goto(`${ec}/cart`);
  await page.getByLabel('メールアドレス', { exact: true }).fill('test.user@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('main').getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(`${ec}/cart`);
  await expect(page.getByRole('heading', { name: 'まだ商品が入っていません。', exact: true })).toBeVisible();

  await page.goto(ec);
  await addFromCatalog(page, product);
  await expect(page.locator('.toast')).toContainText('カートを更新しました。');
  await page.goto(`${ec}/cart`);
  await page.reload();
  const line = page.locator('.cart-line').filter({ hasText: product.name });
  await expect(line).toBeVisible();
  await expect(line.getByLabel('数量', { exact: true })).toHaveText('1');
  await page.screenshot({ path: `${evidence}/member-cart-after-reload.png`, fullPage: true });
  const cart = await call(page.request, '/cart').then((r) => r.json());
  expect(cart.items.find((item) => item.product.id === product.id)?.quantity).toBe(1);
  // The removed guest import endpoint no longer changes the member cart.
  const removedImport = (
    await call(page.request, '/cart/guest-items', 'PUT', {
      storeId: cart.storeId,
      revision: cart.revision,
      items: [{ productId: product.id, quantity: 2 }],
    })
  ).status();
  expect([404, 405]).toContain(removedImport);
  expect((await call(page.request, '/cart').then((r) => r.json())).revision).toBe(cart.revision);
  await writeFile(
    `${evidence}/api.json`,
    JSON.stringify(
      {
        productId: product.id,
        before,
        signedOut,
        signedOutCartWrites: signedOutWrites,
        memberCart: cart,
        removedImport,
      },
      null,
      2,
    ),
  );
});
