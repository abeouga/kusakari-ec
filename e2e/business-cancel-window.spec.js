import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add, checkout } from './business-helpers.js';

test.use({ trace: 'off' });

/** @param {import('@playwright/test').Page} buyer @param {string} id */
async function openOrder(buyer, id) {
  await buyer.goto(`${ec}/purchases`);
  const card = buyer.getByTestId(`order-${id}`);
  await card.locator('.order-card-head').click();
  return card;
}

/** @param {import('@playwright/test').Locator} card */
async function fillCancellation(card) {
  await card.getByText('注文のキャンセルを申請', { exact: true }).click();
  const form = card.getByRole('form', { name: 'キャンセル申請' });
  await form.getByRole('radio', { name: '受け取りに行けなくなった', exact: true }).check();
  await form.getByLabel('申請後は取り消せないことを確認しました').check();
  return form.getByRole('button', { name: 'キャンセルを申請', exact: true });
}

// Issue #19 (EC-B14): buyers can request a cancellation only while the order is still "注文受付".
test('cancellation can be requested only until the order is ready for pickup', async ({ browser }) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  const dir = 'artifacts/business/cancel-window';
  await mkdir(dir, { recursive: true });
  try {
    prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    const created = await call(seller.request, '/products', 'POST', productInput());
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();

    // A rejected request on an accepted order can be requested again, and the store is notified each time.
    await add(buyer.request, product.id, 1);
    const { order: accepted } = await checkout(buyer.request);
    let card = await openOrder(buyer, accepted.id);
    await (await fillCancellation(card)).click();
    await expect(buyer.getByRole('status')).toContainText('キャンセル申請を送信しました。');
    const notices = await call(seller.request, '/notifications').then((r) => r.json());
    expect(JSON.stringify(notices)).toContain(accepted.id);
    const rejected = await call(seller.request, `/seller/orders/${accepted.id}/cancellation`, 'PUT', {
      approved: false,
      reason: '準備を始めています',
    });
    expect(rejected.status(), await rejected.text()).toBe(200);
    card = await openOrder(buyer, accepted.id);
    await (await fillCancellation(card)).click();
    await expect(card.locator('.order-cancel-note')).toContainText('キャンセルを申請中です');
    expect((await call(buyer.request, `/orders/${accepted.id}`).then((r) => r.json())).cancellationStatus).toBe(
      'PENDING',
    );

    // The seller marks the order ready while the buyer has the form open: the request is refused and not recorded.
    await add(buyer.request, product.id, 1);
    const { order } = await checkout(buyer.request);
    card = await openOrder(buyer, order.id);
    const submit = await fillCancellation(card);
    const ready = await call(seller.request, `/seller/orders/${order.id}/status`, 'PUT', {
      expectedStatus: 'ACCEPTED',
      status: 'READY',
    });
    expect(ready.status(), await ready.text()).toBe(200);
    await submit.click();
    await expect(buyer.getByRole('alert').filter({ hasText: '注文状態が変わりました' })).toContainText(
      '注文状態が変わりました。最新の状態を確認してください。',
    );

    await buyer.reload();
    card = buyer.getByTestId(`order-${order.id}`);
    await card.locator('.order-card-head').click();
    await expect(card.locator('.order-card-head')).not.toContainText('キャンセル申請中');
    await expect(card.getByText('注文のキャンセルを申請', { exact: true })).toHaveCount(0);
    await expect(card.locator('.order-cancel-note')).toHaveText(
      '受取準備完了後はキャンセルを申請できません。受取店舗へお問い合わせください。',
    );
    await buyer.screenshot({ path: `${dir}/ready-reloaded.png`, fullPage: true });
    const saved = await call(buyer.request, `/orders/${order.id}`).then((r) => r.json());
    expect(saved).toMatchObject({ status: 'READY', cancellationStatus: 'NONE' });
    const direct = await call(buyer.request, `/orders/${order.id}/cancellation`, 'POST', { reason: '直接の申請' });
    expect(direct.status()).toBe(409);
    await writeFile(`${dir}/ready-order.json`, JSON.stringify(saved, null, 2));
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});
