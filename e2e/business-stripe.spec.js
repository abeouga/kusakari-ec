import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ec, call, login, prepareMember, productInput, add, capture } from './business-helpers.js';
import { replenishOrder, sql } from './database.js';
import { eventFor, intentOf, signature, startStripeListener, stripeApi, stripeReady } from './stripe-helpers.js';

// Issue #132/#133: card payments and refunds against the real Stripe test mode, the real API and MySQL.
// The API is never mocked: Stripe sends its events through `stripe listen` to the E2E API.
test.use({ trace: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!stripeReady, 'Stripe test keys in .env and the Stripe CLI are required for card payment tests.');

const dir = 'artifacts/business/stripe';
const webhook = 'http://127.0.0.1:18286/api/payments/stripe/webhook';
const stock = (id) => Number(sql(`SELECT quantity FROM inventory WHERE product_id='${id}';`));
const notices = (request, orderId, title) =>
  call(request, '/notifications')
    .then((r) => r.json())
    .then((list) => list.filter((n) => n.title === title && n.body.startsWith(orderId)).length);

let stopListener = () => {};
/** @type {import('@playwright/test').BrowserContext} */ let buyerContext;
/** @type {import('@playwright/test').BrowserContext} */ let sellerContext;
/** @type {import('@playwright/test').Page} */ let buyer;
/** @type {import('@playwright/test').Page} */ let seller;

test.beforeAll(async ({ browser }) => {
  await mkdir(dir, { recursive: true });
  stopListener = await startStripeListener(webhook);
  buyerContext = await browser.newContext();
  sellerContext = await browser.newContext();
  buyer = await buyerContext.newPage();
  seller = await sellerContext.newPage();
  prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
  prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
});

test.afterAll(async () => {
  stopListener();
  await buyerContext?.close();
  await sellerContext?.close();
});

async function newProduct(stockCount = 5) {
  const created = await call(seller.request, '/products', 'POST', { ...productInput(), stock: stockCount });
  expect(created.status(), await created.text()).toBe(200);
  return created.json();
}

/** Card checkout through the API: the orders wait for payment and the response has the client secret. */
async function cardCheckout() {
  const cart = await call(buyer.request, '/cart').then((r) => r.json());
  const payload = {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'CARD',
  };
  const response = await call(buyer.request, '/orders', 'POST', payload);
  expect(response.status(), await response.text()).toBe(200);
  return { ...(await response.json()), payload };
}

const order = (id) => call(buyer.request, `/orders/${id}`).then((r) => r.json());
const waitStatus = (id, status) =>
  expect.poll(async () => (await order(id)).status, { timeout: 60000, intervals: [1000] }).toBe(status);

/** The Payment Element's card frame (Stripe's iframe; its title depends on the locale). */
async function cardFrame() {
  for (let attempt = 0; attempt < 60; attempt++) {
    for (const frame of buyer.frames()) {
      if (await frame.locator('input[name="number"]').count().catch(() => 0)) return frame;
    }
    await buyer.waitForTimeout(500);
  }
  throw new Error('The card input frame did not appear.');
}

/** Fills the Payment Element (an iframe from Stripe) and pays. */
async function payWithCard(number) {
  const frame = await cardFrame();
  await frame.locator('input[name="number"]').fill(number);
  await frame.locator('input[name="expiry"]').fill('12 / 34');
  await frame.locator('input[name="cvc"]').fill('123');
  const country = frame.locator('select[name="country"]');
  if (await country.count()) await country.selectOption('JP');
  await buyer.getByRole('button', { name: /を支払う$/ }).click();
}

async function openCardStep(productId, quantity) {
  await add(buyer.request, productId, quantity);
  await buyer.goto(`${ec}/cart`);
  await buyer.getByRole('button', { name: '注文内容を確認する' }).click();
  await buyer.getByRole('radio', { name: /クレジットカード/ }).check();
  const ordered = buyer.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
  await buyer.getByRole('button', { name: '注文してカードで支払う', exact: true }).click();
  const response = await ordered;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.orders.map((o) => o.status)).toEqual(['PENDING_PAYMENT']);
  expect(result.payment.status).toBe('PENDING');
  return result;
}

test('a test card pays the order; it is accepted only after the webhook and survives a reload', async () => {
  const product = await newProduct();
  const { orders, payment } = await openCardStep(product.id, 2);
  // Stock is reserved while the order waits for payment, and no one is notified yet.
  expect(stock(product.id)).toBe(3);
  expect(await notices(buyer.request, orders[0].id, 'ご注文を受け付けました')).toBe(0);
  await payWithCard('4242424242424242');
  await expect(buyer.getByRole('heading', { name: '注文を保存しました' })).toBeVisible({ timeout: 60000 });
  const accepted = await order(orders[0].id);
  expect([accepted.status, accepted.paymentStatus, accepted.details.paymentMethod]).toEqual([
    'ACCEPTED',
    'SUCCEEDED',
    'CARD',
  ]);
  expect(sql(`SELECT status, amount_yen FROM payments WHERE id='${payment.id}';`)).toBe(
    `SUCCEEDED\t${accepted.totalYen}`,
  );
  expect(stock(product.id)).toBe(3);
  expect(await notices(buyer.request, orders[0].id, 'ご注文を受け付けました')).toBe(1);

  // Replaying the real payment_intent.succeeded event (signed like Stripe signs it) changes nothing.
  const intentId = sql(`SELECT payment_intent_id FROM payments WHERE id='${payment.id}';`);
  const event = await eventFor('payment_intent.succeeded', intentId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = JSON.stringify(event);
    const replay = await buyer.request.post(webhook, {
      data: body,
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature(body) },
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).processed).toBe(false);
  }
  expect(sql(`SELECT COUNT(*) FROM stripe_events WHERE event_id='${event.id}';`)).toBe('1');
  expect(stock(product.id)).toBe(3);
  expect(await notices(buyer.request, orders[0].id, 'ご注文を受け付けました')).toBe(1);

  // A body whose signature does not match is refused and changes nothing.
  const forged = JSON.stringify({ ...event, id: `evt_${randomUUID().replaceAll('-', '')}` });
  for (const header of [signature(forged, 'whsec_not_the_secret'), '']) {
    const refused = await buyer.request.post(webhook, {
      data: forged,
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    });
    expect(refused.status()).toBe(400);
  }
  expect((await order(orders[0].id)).status).toBe('ACCEPTED');

  await buyer.goto(`${ec}/purchases`);
  await buyer.reload();
  const card = buyer.getByTestId(`order-${orders[0].id}`);
  await expect(card).toContainText('注文受付');
  await card.getByRole('button').first().click();
  await expect(card.getByTestId('payment-state')).toContainText('クレジットカード');
  await expect(card.getByTestId('payment-state')).toContainText('支払い済み');
  await capture(buyer, `${dir}/card-paid-reloaded.png`, card);
  await writeFile(`${dir}/card-paid-order.json`, JSON.stringify(await order(orders[0].id), null, 2));
});

test('a declined card does not confirm the order and the stock comes back', async () => {
  const product = await newProduct();
  const { orders, payment } = await openCardStep(product.id, 1);
  expect(stock(product.id)).toBe(4);
  await payWithCard('4000000000000002');
  await expect(buyer.getByText('お支払いができなかったため、注文を取り消しました。')).toBeVisible({ timeout: 60000 });
  const cancelled = await order(orders[0].id);
  expect([cancelled.status, cancelled.paymentStatus]).toEqual(['CANCELLED', 'FAILED']);
  expect(stock(product.id)).toBe(5);
  expect(await notices(buyer.request, orders[0].id, 'ご注文を受け付けました')).toBe(0);
  // The PaymentIntent is cancelled so that the cancelled order cannot be paid later.
  const intentId = sql(`SELECT payment_intent_id FROM payments WHERE id='${payment.id}';`);
  await expect.poll(async () => (await stripeApi(`/payment_intents/${intentId}`)).status).toBe('canceled');
  await buyer.goto(`${ec}/purchases`);
  await buyer.reload();
  await expect(buyer.getByTestId(`order-${orders[0].id}`)).toContainText('キャンセル');
  await capture(buyer, `${dir}/card-declined-reloaded.png`);
  await writeFile(`${dir}/card-declined-order.json`, JSON.stringify(cancelled, null, 2));
});

test('two stores in one checkout make one payment; approving one cancellation refunds only that order', async () => {
  const product = await newProduct();
  await add(buyer.request, product.id, 1);
  await add(buyer.request, 'garden-demo-conifer', 1);
  const coniferBefore = stock('garden-demo-conifer');
  const { orders, payment, payload } = await cardCheckout();
  let omiya;
  try {
    expect(orders.map((o) => [o.storeId, o.status])).toEqual([
      [1, 'PENDING_PAYMENT'],
      [3, 'PENDING_PAYMENT'],
    ]);
    omiya = orders[1];
    expect(payment.amountYen).toBe(orders[0].totalYen + orders[1].totalYen);
    expect(sql(`SELECT COUNT(*) FROM payments WHERE request_id='${payload.requestId}';`)).toBe('1');
    expect(sql(`SELECT COUNT(DISTINCT payment_id), COUNT(*) FROM orders WHERE payment_id='${payment.id}';`)).toBe(
      '1\t2',
    );
    // Pay with Stripe's test card on the server side; the webhook accepts both orders.
    await stripeApi(`/payment_intents/${intentOf(payment.clientSecret)}/confirm`, { payment_method: 'pm_card_visa' });
    await waitStatus(orders[0].id, 'ACCEPTED');
    await waitStatus(orders[1].id, 'ACCEPTED');

    // The buyer asks to cancel the store 1 order; the store's MANAGER approves it.
    const [store1] = orders;
    const productStock = stock(product.id);
    expect(
      (
        await call(buyer.request, `/orders/${store1.id}/cancellation`, 'POST', { reason: '受け取りに行けません' })
      ).status(),
    ).toBe(200);
    const decision = { approved: true, reason: '承知しました' };
    const approved = await call(seller.request, `/seller/orders/${store1.id}/cancellation`, 'PUT', decision);
    expect(approved.status(), await approved.text()).toBe(200);
    expect((await call(seller.request, `/seller/orders/${store1.id}/cancellation`, 'PUT', decision)).status()).toBe(
      409,
    );
    await expect
      .poll(async () => (await order(store1.id)).refundStatus, { timeout: 60000, intervals: [1000] })
      .toBe('SUCCEEDED');
    expect(stock(product.id)).toBe(productStock + 1);
    expect(sql(`SELECT COUNT(*), SUM(amount_yen) FROM refunds WHERE payment_id='${payment.id}';`)).toBe(
      `1\t${store1.totalYen}`,
    );
    const stripeRefunds = await stripeApi(`/refunds?payment_intent=${intentOf(payment.clientSecret)}`);
    expect(stripeRefunds.data.map((r) => r.amount)).toEqual([store1.totalYen]);
    expect((await order(omiya.id)).refundStatus).toBeNull();
    expect((await order(omiya.id)).status).toBe('ACCEPTED');

    await seller.goto(`${ec}/seller/orders`);
    await seller.reload();
    const sellerCard = seller.getByTestId(`order-${store1.id}`);
    await expect(sellerCard).toBeAttached();
    await expect(sellerCard.getByTestId('payment-state')).toContainText('返金済み');
    await capture(seller, `${dir}/refund-seller-reloaded.png`, sellerCard);
    const persisted = await Promise.all(orders.map((o) => order(o.id)));
    await writeFile(`${dir}/two-stores-refund-orders.json`, JSON.stringify(persisted, null, 2));
  } finally {
    // The demo conifer belongs to the shared sample store: put its stock back.
    if (omiya) replenishOrder(omiya, 3);
    expect(stock('garden-demo-conifer')).toBe(coniferBefore);
  }
});

test('an unpaid order expires: it is cancelled, the stock comes back and the payment intent is cancelled', async () => {
  const product = await newProduct();
  await add(buyer.request, product.id, 2);
  const { orders, payment } = await cardCheckout();
  expect(stock(product.id)).toBe(3);
  // Move the checkout 31 minutes into the past instead of waiting; the job runs every minute.
  sql(`UPDATE payments SET created_at = created_at - INTERVAL 31 MINUTE WHERE id='${payment.id}';`);
  await expect
    .poll(async () => (await order(orders[0].id)).status, { timeout: 100000, intervals: [2000] })
    .toBe('CANCELLED');
  expect((await order(orders[0].id)).paymentStatus).toBe('EXPIRED');
  expect(stock(product.id)).toBe(5);
  await expect
    .poll(async () => (await stripeApi(`/payment_intents/${intentOf(payment.clientSecret)}`)).status)
    .toBe('canceled');
  await buyer.goto(`${ec}/purchases`);
  await buyer.reload();
  const card = buyer.getByTestId(`order-${orders[0].id}`);
  await card.getByRole('button').first().click();
  await expect(card.getByTestId('payment-state')).toContainText('期限切れ');
  await capture(buyer, `${dir}/expired-reloaded.png`, card);
  await writeFile(`${dir}/expired-order.json`, JSON.stringify(await order(orders[0].id), null, 2));
});

test('pay at store still creates an accepted order without a payment', async () => {
  const product = await newProduct();
  await add(buyer.request, product.id, 1);
  const cart = await call(buyer.request, '/cart').then((r) => r.json());
  const response = await call(buyer.request, '/orders', 'POST', {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'PAY_AT_STORE',
  });
  expect(response.status(), await response.text()).toBe(200);
  const { orders, payment } = await response.json();
  expect(payment).toBeNull();
  expect([orders[0].status, orders[0].paymentStatus]).toEqual(['ACCEPTED', null]);
  expect(stock(product.id)).toBe(4);
  // Old payment choices are refused by the API.
  const old = await call(buyer.request, '/orders', 'POST', {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'PAYPAY',
  });
  expect(old.status()).toBe(400);
});
