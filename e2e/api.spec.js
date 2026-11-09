import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createScarceProduct, removeScarceProduct, replenishOrder, sql } from './database.js';

test('API validation, cart revision conflict, price confirmation and session isolation', async ({ playwright }) => {
  const a = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:15186' });
  const b = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:15186' });
  try {
    let cart = await (await a.get('/api/cart')).json();
    expect((await a.put('/api/cart/items/olive', { data: { quantity: 1.5, revision: cart.revision } })).status()).toBe(
      400,
    );
    expect((await a.put('/api/cart/items/olive', { data: { quantity: 100, revision: cart.revision } })).status()).toBe(
      400,
    );
    expect(
      (await a.put('/api/cart/items/olive', { data: { quantity: 1, revision: cart.revision, priceYen: 1 } })).status(),
    ).toBe(400);
    const changed = await a.put('/api/cart/items/olive', { data: { quantity: 1, revision: cart.revision } });
    expect(changed.status()).toBe(200);
    expect((await a.put('/api/cart/items/olive', { data: { quantity: 2, revision: cart.revision } })).status()).toBe(
      409,
    );
    cart = await changed.json();
    expect((await b.get('/api/cart').then((r) => r.json())).items).toHaveLength(0);
    const price = await a.post('/api/orders', {
      data: { requestId: randomUUID(), revision: cart.revision, expectedTotalYen: 1 },
    });
    expect(price.status()).toBe(409);
    expect((await price.json()).code).toBe('PRICE_CHANGED');
    expect(await a.get('/api/orders').then((r) => r.json())).toHaveLength(0);
    expect((await a.get('/api/cart').then((r) => r.json())).items).toHaveLength(1);
    expect((await a.get('/api/stores?latitude=999&longitude=1')).status()).toBe(400);
    expect((await a.get('/api/stores?latitude=1')).status()).toBe(400);
    const unknown = await a.post('/api/materials/quote', {
      data: { storeId: 1, items: [{ materialCode: 'unknown', quantity: 2, unit: 'piece' }] },
    });
    expect((await unknown.json())[0]).toEqual({ materialCode: 'unknown', status: 'UNMAPPED', candidates: [] });
    expect((await a.post('/api/materials/quote', { data: { storeId: 1, items: [null] } })).status()).toBe(400);
    expect(
      (
        await a.post('/api/materials/quote', {
          data: { storeId: 1, items: [{ materialCode: 'plant.olive', quantity: 2, unit: 'm2' }] },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.put('/api/cart/items/olive', {
          headers: { Origin: 'https://untrusted.example' },
          data: { quantity: 0, revision: cart.revision },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test('same checkout key returns one persisted order and decrements stock once', async ({ request }) => {
  let order;
  const before = (await request.get('/api/products?storeId=1').then((r) => r.json())).find(
    (p) => p.id === 'rosemary',
  ).stock;
  try {
    const empty = await request.get('/api/cart').then((r) => r.json());
    const cart = await request
      .put('/api/cart/items/rosemary', { data: { quantity: 2, revision: empty.revision } })
      .then((r) => r.json());
    const body = { requestId: randomUUID(), revision: cart.revision, expectedTotalYen: cart.totalYen };
    const results = await Promise.all([
      request.post('/api/orders', { data: body }),
      request.post('/api/orders', { data: body }),
    ]);
    expect(results.map((r) => r.status())).toEqual([200, 200]);
    const [first, second] = (await Promise.all(results.map((r) => r.json()))).map((result) => result.orders[0]);
    order = first;
    expect(first.id).toBe(second.id);
    const after = (await request.get('/api/products?storeId=1').then((r) => r.json())).find(
      (p) => p.id === 'rosemary',
    ).stock;
    expect(after).toBe(before - 2);
    expect(await request.get('/api/orders').then((r) => r.json())).toHaveLength(1);
    expect(sql(`SELECT COUNT(*) FROM orders WHERE id='${first.id}';`)).toBe('1');
    const reused = await request.post('/api/orders', { data: { ...body, expectedTotalYen: 1 } });
    expect(reused.status()).toBe(409);
    expect((await reused.json()).code).toBe('REQUEST_REUSED');
  } finally {
    if (order) replenishOrder(order, 1);
  }
});

test('two buyers competing for the last unit cannot oversell', async ({ playwright }) => {
  const productId = createScarceProduct();
  const clients = await Promise.all(
    [1, 2].map(() => playwright.request.newContext({ baseURL: 'http://127.0.0.1:15186' })),
  );
  try {
    const carts = await Promise.all(
      clients.map(async (client) => {
        const empty = await client.get('/api/cart').then((r) => r.json());
        const response = await client.put(`/api/cart/items/${productId}`, {
          data: { quantity: 1, revision: empty.revision },
        });
        expect(response.status()).toBe(200);
        return response.json();
      }),
    );
    const responses = await Promise.all(
      clients.map((client, i) =>
        client.post('/api/orders', {
          data: { requestId: randomUUID(), revision: carts[i].revision, expectedTotalYen: 1200 },
        }),
      ),
    );
    expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
    const stock = sql(`SELECT quantity FROM inventory WHERE product_id='${productId}' AND store_id=1;`);
    expect(stock).toBe('0');
    expect(sql(`SELECT COUNT(*) FROM order_items WHERE product_id='${productId}';`)).toBe('1');
    const loser = responses.findIndex((r) => r.status() === 409);
    expect((await responses[loser].json()).code).toBe('OUT_OF_STOCK');
    expect((await clients[loser].get('/api/cart').then((r) => r.json())).items).toHaveLength(1);
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
    await Promise.all(clients.map((c) => c.dispose()));
    removeScarceProduct(productId);
  }
});
