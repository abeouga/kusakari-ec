import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createScarceProduct, removeScarceProduct, replenishOrder, sql } from './database.js';
import { ec, login, call, prepareMember } from './business-helpers.js';

// Issue #113: the cart and orders belong to a signed-in buyer (#10), mutations carry the CSRF token, and an order is
// paid at the store unless a card is chosen (#131). The two buyers are the test buyer and the operator (#108).
/** @param {import('@playwright/test').Browser} browser @param {string} email @param {'USER'|'ADMIN'} role */
async function buyer(browser, email, role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  prepareMember(await login(page, email), role);
  return { context, request: page.request };
}

/** @param {import('@playwright/test').APIRequestContext} request @param {any} cart @param {number} expectedTotalYen */
const order = (request, cart, expectedTotalYen = cart.totalYen, requestId = randomUUID()) =>
  call(request, '/orders', 'POST', {
    requestId,
    revision: cart.revision,
    expectedTotalYen,
    paymentMethod: 'PAY_AT_STORE',
  });

test('API validation, cart revision conflict, price confirmation and session isolation', async ({ browser }) => {
  const a = await buyer(browser, 'test.user@example.com', 'USER');
  const b = await buyer(browser, 'test.admin@example.com', 'ADMIN');
  try {
    let cart = await call(a.request, '/cart').then((r) => r.json());
    const put = (data) => call(a.request, '/cart/items/olive', 'PUT', data);
    expect((await put({ quantity: 1.5, revision: cart.revision })).status()).toBe(400);
    expect((await put({ quantity: 100, revision: cart.revision })).status()).toBe(400);
    expect((await put({ quantity: 1, revision: cart.revision, priceYen: 1 })).status()).toBe(400);
    const changed = await put({ quantity: 1, revision: cart.revision });
    expect(changed.status()).toBe(200);
    expect((await put({ quantity: 2, revision: cart.revision })).status()).toBe(409);
    cart = await changed.json();
    expect((await call(b.request, '/cart').then((r) => r.json())).items).toHaveLength(0);
    const ordersBefore = (await call(a.request, '/orders').then((r) => r.json())).length;
    const price = await order(a.request, cart, 1);
    expect(price.status()).toBe(409);
    expect((await price.json()).code).toBe('PRICE_CHANGED');
    expect(await call(a.request, '/orders').then((r) => r.json())).toHaveLength(ordersBefore);
    expect((await call(a.request, '/cart').then((r) => r.json())).items).toHaveLength(1);
    // The payment method is required and limited to the card and paying at the store (PayPay and others are gone).
    for (const paymentMethod of [undefined, 'PAYPAY', 'RAKUTEN_PAY']) {
      const rejected = await call(a.request, '/orders', 'POST', {
        requestId: randomUUID(),
        revision: cart.revision,
        expectedTotalYen: cart.totalYen,
        paymentMethod,
      });
      expect(rejected.status(), String(paymentMethod)).toBe(400);
    }
    expect((await a.request.get(`${ec}/api/stores?latitude=999&longitude=1`)).status()).toBe(400);
    expect((await a.request.get(`${ec}/api/stores?latitude=1`)).status()).toBe(400);
    const quote = (data) => a.request.post(`${ec}/api/materials/quote`, { data });
    const unknown = await quote({ storeId: 1, items: [{ materialCode: 'unknown', quantity: 2, unit: 'piece' }] });
    expect((await unknown.json())[0]).toEqual({ materialCode: 'unknown', status: 'UNMAPPED', candidates: [] });
    expect((await quote({ storeId: 1, items: [null] })).status()).toBe(400);
    expect(
      (await quote({ storeId: 1, items: [{ materialCode: 'plant.olive', quantity: 2, unit: 'm2' }] })).status(),
    ).toBe(400);
    const csrf = await a.request.get(`${ec}/api/auth/csrf`).then((r) => r.json());
    expect(
      (
        await a.request.put(`${ec}/api/cart/items/olive`, {
          headers: { Origin: 'https://untrusted.example', [csrf.headerName]: csrf.token },
          data: { quantity: 0, revision: cart.revision },
        })
      ).status(),
    ).toBe(403);
    // Without the CSRF token a signed-in member cannot change the cart either.
    expect(
      (await a.request.put(`${ec}/api/cart/items/olive`, { data: { quantity: 0, revision: cart.revision } })).status(),
    ).toBe(403);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('same checkout key returns one persisted order and decrements stock once', async ({ browser }) => {
  const a = await buyer(browser, 'test.user@example.com', 'USER');
  let first;
  try {
    const stock = async () =>
      (await call(a.request, '/products?storeId=1').then((r) => r.json())).find((p) => p.id === 'rosemary').stock;
    const before = await stock();
    const ordersBefore = (await call(a.request, '/orders').then((r) => r.json())).length;
    const empty = await call(a.request, '/cart').then((r) => r.json());
    const cart = await call(a.request, '/cart/items/rosemary', 'PUT', { quantity: 2, revision: empty.revision }).then(
      (r) => r.json(),
    );
    const requestId = randomUUID();
    const results = await Promise.all([
      order(a.request, cart, cart.totalYen, requestId),
      order(a.request, cart, cart.totalYen, requestId),
    ]);
    expect(results.map((r) => r.status())).toEqual([200, 200]);
    const [one, two] = (await Promise.all(results.map((r) => r.json()))).map((result) => result.orders[0]);
    first = one;
    expect(one.id).toBe(two.id);
    expect(await stock()).toBe(before - 2);
    expect(await call(a.request, '/orders').then((r) => r.json())).toHaveLength(ordersBefore + 1);
    expect(sql(`SELECT COUNT(*) FROM orders WHERE id='${one.id}';`)).toBe('1');
    const reused = await order(a.request, cart, 1, requestId);
    expect(reused.status()).toBe(409);
    expect((await reused.json()).code).toBe('REQUEST_REUSED');
  } finally {
    await a.context.close();
    if (first) replenishOrder(first, 1);
  }
});

test('two buyers competing for the last unit cannot oversell', async ({ browser }) => {
  const productId = createScarceProduct();
  const buyers = [
    await buyer(browser, 'test.user@example.com', 'USER'),
    await buyer(browser, 'test.admin@example.com', 'ADMIN'),
  ];
  try {
    const carts = await Promise.all(
      buyers.map(async ({ request }) => {
        const empty = await call(request, '/cart').then((r) => r.json());
        const response = await call(request, `/cart/items/${productId}`, 'PUT', {
          quantity: 1,
          revision: empty.revision,
        });
        expect(response.status()).toBe(200);
        return response.json();
      }),
    );
    const responses = await Promise.all(buyers.map(({ request }, i) => order(request, carts[i], 1200)));
    expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
    const stock = sql(`SELECT quantity FROM inventory WHERE product_id='${productId}';`);
    expect(stock).toBe('0');
    expect(sql(`SELECT COUNT(*) FROM order_items WHERE product_id='${productId}';`)).toBe('1');
    const loser = responses.findIndex((r) => r.status() === 409);
    expect((await responses[loser].json()).code).toBe('OUT_OF_STOCK');
    expect((await call(buyers[loser].request, '/cart').then((r) => r.json())).items).toHaveLength(1);
    await mkdir('artifacts/e2e', { recursive: true });
    await writeFile(
      'artifacts/e2e/concurrent-checkout.json',
      JSON.stringify(
        { statuses: responses.map((r) => r.status()), remainingStock: Number(stock), persistedOrders: 1 },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all(buyers.map(({ context }) => context.close()));
    removeScarceProduct(productId);
  }
});
