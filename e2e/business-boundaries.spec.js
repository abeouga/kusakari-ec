import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { call, login, prepareMember, productInput, add, checkout } from './business-helpers.js';

test('price changes, store suspension, private attachments and pickup cancellation race', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [buyer, seller, admin] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    for (const [page, email, role] of [
      [buyer, 'test.user@example.com', 'USER'],
      [seller, 'test.seller@example.com', 'SELLER'],
      [admin, 'test.admin@example.com', 'ADMIN'],
    ])
      prepareMember(await login(page, email), role);
    const input = productInput();
    const created = await call(seller.request, '/products', 'POST', input);
    expect(created.status()).toBe(200);
    const p = await created.json();
    const original = await add(buyer.request, p.id);
    const changed = await call(seller.request, `/products/${p.id}`, 'PUT', { ...input, priceYen: 2100 });
    expect(changed.status(), await changed.text()).toBe(200);
    const stale = await call(buyer.request, '/orders', 'POST', {
      requestId: randomUUID(),
      revision: original.revision,
      expectedTotalYen: original.totalYen,
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).code).toBe('PRICE_CHANGED');
    expect((await call(admin.request, '/operator/stores/1/enabled', 'PUT', { enabled: false })).status()).toBe(200);
    try {
      const cart = await call(buyer.request, '/cart').then((r) => r.json());
      expect(
        (
          await call(buyer.request, '/orders', 'POST', {
            requestId: randomUUID(),
            revision: cart.revision,
            expectedTotalYen: cart.totalYen,
          })
        ).status(),
      ).toBe(409);
      expect((await call(seller.request, '/seller/orders?storeId=1')).status()).toBe(403);
    } finally {
      expect((await call(admin.request, '/operator/stores/1/enabled', 'PUT', { enabled: true })).status()).toBe(200);
    }
    const { order } = await checkout(buyer.request);
    const attempts = await Promise.all([
      call(buyer.request, `/orders/${order.id}/cancellation`, 'POST', { reason: '競合検証' }),
      call(seller.request, `/seller/orders/${order.id}/status`, 'PUT', { expectedStatus: 'ACCEPTED', status: 'READY' }),
    ]);
    expect(attempts.map((r) => r.status()).sort()).toEqual([200, 409]);
    if (attempts[0].ok()) {
      const result = await call(seller.request, `/seller/orders/${order.id}/cancellation`, 'PUT', {
        approved: true,
        reason: '',
      });
      expect(result.status()).toBe(200);
    }
    const state = await call(buyer.request, `/orders/${order.id}`).then((r) => r.json());
    expect(['CANCELLED', 'READY']).toContain(state.status);
    const stock = await call(buyer.request, '/products?storeId=1')
      .then((r) => r.json())
      .then((ps) => ps.find((product) => product.id === p.id).stock);
    expect(stock).toBe(state.status === 'CANCELLED' ? 5 : 4);
    expect((await call(buyer.request, `/orders/${order.id}`, 'DELETE')).status()).toBe(200);
    expect((await call(buyer.request, '/orders').then((r) => r.json())).some((o) => o.id === order.id)).toBe(false);
    expect((await call(seller.request, `/seller/orders/${order.id}`).then((r) => r.json())).id).toBe(order.id);
    expect((await call(admin.request, '/operator/orders').then((r) => r.json())).some((o) => o.id === order.id)).toBe(
      true,
    );
    const applications = await call(admin.request, '/operator/applications').then((r) => r.json());
    if (applications.length) {
      const id = applications[0].id;
      expect((await call(seller.request, `/account/store-applications/${id}/document`)).status()).toBe(404);
      expect((await call(admin.request, `/account/store-applications/${id}/document`)).status()).toBe(200);
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
