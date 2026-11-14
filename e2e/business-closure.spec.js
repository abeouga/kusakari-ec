import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ec, call, login, prepareMember, productInput, add, checkout, openStore, capture } from './business-helpers.js';
import { sql } from './database.js';
import { intentOf, startStripeListener, stripeApi, stripeReady } from './stripe-helpers.js';

// Issue #79 (store closure) and #109 (organization suspension) through the real API, MySQL, Cognito and Stripe test mode.
// Every store and organization here is created by the test; the sample stores and organization are never closed.
test.use({ trace: 'off' });
test.describe.configure({ mode: 'serial' });

const dir = 'artifacts/business/closure';
const webhook = 'http://127.0.0.1:18286/api/payments/stripe/webhook';
const stock = (/** @type {string} */ id) => Number(sql(`SELECT quantity FROM inventory WHERE product_id='${id}';`));
const id = (/** @type {unknown} */ value) => {
  if (!Number.isInteger(value)) throw new Error('Unexpected fixture id.');
  return Number(value);
};

/** @type {import('@playwright/test').Page} */ let owner;
/** @type {import('@playwright/test').Page} */ let buyer;
/** @type {import('@playwright/test').Page} */ let admin;
let stopListener = () => {};

test.beforeAll(async ({ browser }) => {
  await mkdir(dir, { recursive: true });
  if (stripeReady) stopListener = await startStripeListener(webhook);
  owner = await (await browser.newContext()).newPage();
  buyer = await (await browser.newContext()).newPage();
  admin = await (await browser.newContext()).newPage();
  prepareMember(await login(owner, 'test.seller@example.com'), 'SHOP_OWNER');
  prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
  prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
});

test.afterAll(async () => {
  stopListener();
  for (const page of [owner, buyer, admin]) await page?.context().close();
});

/** @param {import('@playwright/test').Page} page @param {number} storeId */
async function newProduct(page, storeId, stockCount = 5) {
  const created = await call(page.request, '/products', 'POST', { ...productInput(), storeId, stock: stockCount });
  expect(created.status(), await created.text()).toBe(200);
  return created.json();
}

const order = (/** @type {string} */ orderId) => call(buyer.request, `/orders/${orderId}`).then((r) => r.json());
const sellerStore = (/** @type {number} */ storeId) =>
  call(owner.request, '/seller/stores')
    .then((r) => r.json())
    .then((stores) => stores.find((/** @type {{id:number}} */ s) => s.id === storeId));
/** @param {string} title @param {string} orderId */
const notices = (title, orderId) =>
  call(buyer.request, '/notifications')
    .then((r) => r.json())
    .then((list) => list.filter((n) => n.title === title && n.body.startsWith(orderId)).length);
/** @param {import('@playwright/test').APIRequestContext} request @param {string} orderId @param {string} from @param {string} to */
async function advance(request, orderId, from, to) {
  const changed = await call(request, `/seller/orders/${orderId}/status`, 'PUT', { expectedStatus: from, status: to });
  expect(changed.status(), await changed.text()).toBe(200);
}

test('an owner closes a store: closing stops new orders, the last pickup closes it and buyers no longer see it', async ({
  playwright,
}) => {
  const name = `閉鎖確認店 ${randomUUID().slice(0, 8)}`;
  const storeId = await openStore(owner.request, name);
  const product = await newProduct(owner, storeId);
  await add(buyer.request, product.id, 1);
  const { order: open } = await checkout(buyer.request);
  // A second line stays in the cart while the store is closing.
  await add(buyer.request, product.id, 1);

  await owner.goto(`${ec}/seller/stores`);
  const row = owner.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: '閉鎖する', exact: true }).click();
  const dialog = owner.getByRole('alertdialog', { name: '店舗の閉鎖の確認' });
  await expect(dialog).toContainText('受け取り待ちの注文（1');
  await dialog.getByRole('button', { name: '閉鎖を始める', exact: true }).click();
  await expect(row).toContainText('閉鎖中（オーナーが開始・未完了の注文 1件）');
  expect(sql(`SELECT closing_started_by, closed_at IS NULL FROM stores WHERE id=${id(storeId)};`)).toBe('OWNER\t1');

  // Buyers see the closing store marked as closing, cannot order, and the line stays as "not purchasable".
  const page = await call(buyer.request, `/stores/${storeId}`);
  expect(page.status()).toBe(200);
  expect((await page.json()).closingStartedAt).not.toBeNull();
  const cart = await call(buyer.request, '/cart').then((r) => r.json());
  const line = cart.items.find((/** @type {any} */ l) => l.product.id === product.id);
  expect([line.unavailableReason, cart.canCheckout, cart.removedItems]).toEqual(['STORE_CLOSING', false, []]);
  const refused = await call(buyer.request, '/orders', 'POST', {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'PAY_AT_STORE',
  });
  expect(refused.status()).toBe(409);
  const closingNotice = await call(buyer.request, '/notifications').then((r) => r.json());
  expect(
    closingNotice.some((/** @type {any} */ n) => n.title === 'ご注文の店舗は閉鎖予定です' && n.body.startsWith(name)),
  ).toBe(true);
  await buyer.goto(`${ec}/store/${storeId}`);
  await expect(buyer.locator('.workspace-main')).toContainText('閉店予定');
  await buyer.goto(`${ec}/purchases`);
  const card = buyer.getByTestId(`order-${open.id}`);
  await card.getByRole('button').first().click();
  await expect(card).toContainText('この店舗は閉鎖予定です');
  await capture(buyer, `${dir}/closing-buyer-order.png`, card);

  // The owner can take it back while closing, and start again.
  expect((await call(owner.request, `/seller/stores/${storeId}/closure`, 'DELETE')).status()).toBe(200);
  expect((await sellerStore(storeId)).closingStartedAt).toBeNull();
  expect((await call(owner.request, `/seller/stores/${storeId}/closure`, 'POST')).status()).toBe(200);

  // The order is handed over as usual; the last pickup closes the store.
  await advance(owner.request, open.id, 'ACCEPTED', 'READY');
  expect((await sellerStore(storeId)).closedAt).toBeNull();
  await advance(owner.request, open.id, 'READY', 'COMPLETED');
  await expect.poll(async () => (await sellerStore(storeId)).closedAt, { timeout: 30000 }).not.toBeNull();
  expect(sql(`SELECT COUNT(*) FROM store_members WHERE store_id=${id(storeId)};`)).toBe('0');
  expect((await call(owner.request, `/seller/stores/${storeId}/closure`, 'DELETE')).status()).toBe(409);
  expect((await call(owner.request, `/seller/stores/${storeId}/published`, 'PUT', { published: false })).status()).toBe(
    409,
  );

  // Closed: the public page is gone (also signed out), and the line leaves the cart with a notice.
  expect((await call(buyer.request, `/stores/${storeId}`)).status()).toBe(404);
  const signedOut = await playwright.request.newContext();
  expect((await signedOut.get(`${ec}/api/stores/${storeId}`)).status()).toBe(404);
  await signedOut.dispose();
  await buyer.goto(`${ec}/cart`);
  await expect(buyer.getByText(`${product.name}は購入できなくなったためカートから外しました。`)).toBeVisible();
  await buyer.reload();
  await expect(buyer.getByText(product.name)).toHaveCount(0);
  await buyer.goto(`${ec}/store/${storeId}`);
  await buyer.reload();
  await expect(buyer.locator('.workspace-main')).toContainText('店舗が見つかりません');
  await capture(buyer, `${dir}/closed-store-page-reloaded.png`);

  await owner.goto(`${ec}/seller/stores`);
  await owner.reload();
  await expect(row).toContainText('閉鎖済み');
  await expect(row.getByRole('button', { name: '閉鎖する', exact: true })).toHaveCount(0);
  await capture(owner, `${dir}/owner-stores-closed-reloaded.png`, row);
  await writeFile(
    `${dir}/owner-closure.json`,
    JSON.stringify(
      {
        store: await sellerStore(storeId),
        order: await order(open.id),
        cart: await call(buyer.request, '/cart').then((r) => r.json()),
      },
      null,
      2,
    ),
  );
});

test('the operator closes a store and cancels its open orders: card payments are refunded, stock returns, buyers are told', async () => {
  test.skip(!stripeReady, 'Stripe test keys in .env and the Stripe CLI are required for the refund.');
  const name = `運営閉鎖確認店 ${randomUUID().slice(0, 8)}`;
  const storeId = await openStore(owner.request, name);
  const product = await newProduct(owner, storeId);
  // A card order (paid with Stripe's test card) and a pay-at-store order.
  await add(buyer.request, product.id, 2);
  const cart = await call(buyer.request, '/cart').then((r) => r.json());
  const placed = await call(buyer.request, '/orders', 'POST', {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'CARD',
  });
  expect(placed.status(), await placed.text()).toBe(200);
  const { orders, payment } = await placed.json();
  const card = orders[0];
  await stripeApi(`/payment_intents/${intentOf(payment.clientSecret)}/confirm`, { payment_method: 'pm_card_visa' });
  await expect.poll(async () => (await order(card.id)).status, { timeout: 60000, intervals: [1000] }).toBe('ACCEPTED');
  await add(buyer.request, product.id, 1);
  const { order: atStore } = await checkout(buyer.request);
  expect(stock(product.id)).toBe(2);

  await admin.goto(`${ec}/operator/sellers`);
  await admin.getByLabel('店舗名・会社名・所在地で検索').fill(name);
  const section = admin.getByTestId(`operator-store-${storeId}`);
  await section.getByRole('button', { name: '閉鎖する', exact: true }).click();
  await admin
    .getByRole('alertdialog', { name: '店舗の閉鎖の確認' })
    .getByRole('button', { name: '閉鎖を始める' })
    .click();
  await expect(section).toContainText('閉鎖中（運営が開始・未完了の注文 2件）');
  // A closure started by the operator can only be taken back by the operator.
  const ownerCancel = await call(owner.request, `/seller/stores/${storeId}/closure`, 'DELETE');
  expect([ownerCancel.status(), (await ownerCancel.json()).code]).toEqual([403, 'CLOSED_BY_OPERATOR']);

  await section.getByRole('button', { name: '未完了の注文をまとめてキャンセル' }).click();
  const dialog = admin.getByRole('alertdialog', { name: '未完了の注文のまとめてキャンセルの確認' });
  await dialog.getByRole('button', { name: 'まとめてキャンセルを確定' }).click();
  await expect(dialog.getByRole('alert')).toContainText('キャンセルの理由を入力してください。');
  await dialog.getByLabel('キャンセルの理由（購入者に通知します）').fill('店舗の事故のため受け渡しができません');
  await dialog.getByRole('button', { name: 'まとめてキャンセルを確定' }).click();
  await expect(section).toContainText('閉鎖済み');

  await expect
    .poll(async () => (await order(card.id)).refundStatus, { timeout: 60000, intervals: [1000] })
    .toBe('SUCCEEDED');
  const [cancelledCard, cancelledAtStore] = await Promise.all([order(card.id), order(atStore.id)]);
  expect([cancelledCard.status, cancelledCard.cancelledBy, cancelledCard.cancellationStatus]).toEqual([
    'CANCELLED',
    'OPERATOR',
    'NONE',
  ]);
  expect([cancelledAtStore.status, cancelledAtStore.refundStatus]).toEqual(['CANCELLED', null]);
  expect(stock(product.id)).toBe(5);
  const refunds = await stripeApi(`/refunds?payment_intent=${intentOf(payment.clientSecret)}`);
  expect(refunds.data.map((/** @type {any} */ r) => r.amount)).toEqual([card.totalYen]);
  expect(await notices('この注文は出店者からキャンセルされました', card.id)).toBe(1);
  expect(await notices('この注文は出店者からキャンセルされました', atStore.id)).toBe(1);
  expect((await call(buyer.request, `/stores/${storeId}`)).status()).toBe(404);

  await buyer.goto(`${ec}/purchases`);
  await buyer.reload();
  const cardView = buyer.getByTestId(`order-${card.id}`);
  await cardView.getByRole('button').first().click();
  await expect(cardView).toContainText(
    'この注文は出店者からキャンセルされました（運営から：店舗の事故のため受け渡しができません）',
  );
  await expect(cardView.getByTestId('payment-state')).toContainText('返金済み');
  await capture(buyer, `${dir}/operator-cancelled-order-reloaded.png`, cardView);
  await admin.reload();
  await admin.getByLabel('店舗名・会社名・所在地で検索').fill(name);
  await expect(section).toContainText('閉鎖済み');
  await capture(admin, `${dir}/operator-store-closed-reloaded.png`, section);
  await writeFile(
    `${dir}/operator-closure.json`,
    JSON.stringify({ store: await sellerStore(storeId), orders: [cancelledCard, cancelledAtStore] }, null, 2),
  );
});

test('closed stores lose their contact 90 days after closing (the daily job), and only those', async () => {
  const stores = [];
  for (const days of [91, 10]) {
    const storeId = await openStore(owner.request, `連絡先確認店 ${days} ${randomUUID().slice(0, 8)}`);
    // No open order: the closure completes at once.
    expect((await call(owner.request, `/seller/stores/${storeId}/closure`, 'POST')).status()).toBe(200);
    expect((await sellerStore(storeId)).closedAt).not.toBeNull();
    // Move the closure into the past instead of waiting; the E2E API runs the daily job every few seconds.
    sql(`UPDATE stores SET contact_name='閉鎖確認担当', contact_email='closure-check@example.com',
           closing_started_at = closing_started_at - INTERVAL ${days} DAY, closed_at = closed_at - INTERVAL ${days} DAY
         WHERE id=${id(storeId)};`);
    stores.push(storeId);
  }
  const contact = (/** @type {number} */ storeId) =>
    sql(`SELECT CONCAT(contact_name, '|', contact_email) FROM stores WHERE id=${id(storeId)};`);
  await expect.poll(() => contact(stores[0]), { timeout: 60000, intervals: [2000] }).toBe('|');
  expect(contact(stores[1])).toBe('閉鎖確認担当|closure-check@example.com');
  // The rows stay.
  expect(sql(`SELECT COUNT(*) FROM stores WHERE id IN (${stores.map(id).join(',')});`)).toBe('2');
  await writeFile(
    `${dir}/contact-purge.json`,
    JSON.stringify(await Promise.all(stores.map((storeId) => sellerStore(storeId))), null, 2),
  );
});

test('the operator stops an organization, takes it back, stops it again and it is suspended once no order is open', async () => {
  // A dedicated organization without an owner, with one published store; the operator registers its product.
  const suffix = randomUUID().slice(0, 8);
  const orgName = `停止確認組織 ${suffix}`;
  const [orgId, storeId] = sql(`INSERT INTO organizations(name) VALUES('${orgName}');
    SET @org = LAST_INSERT_ID();
    INSERT INTO stores(organization_id,name,address,business_hours,published) VALUES(@org,'停止確認店 ${suffix}','東京都 検証用店舗','10:00-18:00',TRUE);
    SELECT @org, LAST_INSERT_ID();`)
    .split('\t')
    .map(Number);
  const product = await newProduct(admin, storeId);
  await add(buyer.request, product.id, 1);
  const { order: first } = await checkout(buyer.request);

  await admin.goto(`${ec}/operator/organizations`);
  const section = admin.getByRole('region', { name: orgName });
  const stopAccepting = async () => {
    await section.getByRole('button', { name: '受付を停止', exact: true }).click();
    const dialog = admin.getByRole('alertdialog', { name: '組織の受付停止の確認' });
    await dialog.getByLabel('理由（必須）').fill('事故の調査のため');
    await dialog.getByRole('button', { name: '受付停止を確定' }).click();
  };
  await stopAccepting();
  // An open order keeps the organization "not accepting" instead of suspended.
  await expect(section).toContainText('受付停止中（未完了の注文 1件');
  const blocked = await call(buyer.request, `/cart/items/${product.id}`, 'PUT', {
    quantity: 1,
    revision: (await call(buyer.request, '/cart').then((r) => r.json())).revision,
  });
  expect(blocked.status()).toBe(409);
  expect(
    (await call(buyer.request, `/products?storeId=${storeId}`).then((r) => r.json())).map(
      (/** @type {any} */ p) => p.id,
    ),
  ).not.toContain(product.id);

  // Taking it back accepts orders again.
  await section.getByRole('button', { name: '受付停止を取り消す' }).click();
  await admin.getByRole('alertdialog', { name: '通常に戻す確認' }).getByRole('button', { name: '通常に戻す' }).click();
  await expect(section).toContainText('状態：通常');
  await add(buyer.request, product.id, 1);
  const { order: second } = await checkout(buyer.request);
  await add(buyer.request, product.id, 1);

  await stopAccepting();
  await expect(section).toContainText('受付停止中（未完了の注文 2件');
  expect(sql(`SELECT suspended FROM organizations WHERE id=${id(orgId)};`)).toBe('0');
  // One order is handed over; the other is cancelled by the operator, which suspends the organization.
  await advance(admin.request, first.id, 'ACCEPTED', 'READY');
  await advance(admin.request, first.id, 'READY', 'COMPLETED');
  await admin.reload();
  await expect(section).toContainText('受付停止中（未完了の注文 1件');
  await section.getByRole('button', { name: '未完了の注文をまとめてキャンセル' }).click();
  const cancel = admin.getByRole('alertdialog', { name: '未完了の注文のまとめてキャンセルの確認' });
  await cancel.getByLabel('理由（必須）').fill('組織の停止のため');
  await cancel.getByRole('button', { name: 'まとめてキャンセルを確定' }).click();
  await expect(section).toContainText('状態：停止');
  expect((await order(second.id)).status).toBe('CANCELLED');
  expect(await notices('この注文は出店者からキャンセルされました', second.id)).toBe(1);

  // Suspended: the store and its product are gone, and the cart drops the line when it is opened.
  expect((await call(buyer.request, `/stores/${storeId}`)).status()).toBe(404);
  const stores = await call(buyer.request, '/stores').then((r) => r.json());
  expect(stores.map((/** @type {any} */ s) => s.id)).not.toContain(storeId);
  await buyer.goto(`${ec}/cart`);
  await expect(buyer.getByText(`${product.name}は購入できなくなったためカートから外しました。`)).toBeVisible();
  await buyer.reload();
  await expect(buyer.getByText(product.name)).toHaveCount(0);
  await capture(buyer, `${dir}/suspended-cart-reloaded.png`);
  expect(sql(`SELECT COUNT(*) FROM products WHERE id='${product.id}';`)).toBe('1');

  await admin.reload();
  await section.getByText('履歴').click();
  await expect(section).toContainText('停止（自動）');
  await capture(admin, `${dir}/organization-suspended-reloaded.png`, section);
  const organizations = await call(admin.request, '/operator/organizations').then((r) => r.json());
  const suspended = organizations.find((/** @type {any} */ o) => o.id === orgId);
  expect(suspended.status).toBe('SUSPENDED');
  expect(suspended.events.map((/** @type {any} */ e) => e.type)).toEqual([
    'SUSPEND',
    'STOP_ACCEPTING',
    'RESUME',
    'STOP_ACCEPTING',
  ]);

  // Resuming does not put the removed line back.
  const resumed = await call(admin.request, `/operator/organizations/${orgId}/resume`, 'POST', { reason: '' });
  expect((await resumed.json()).status).toBe('ACTIVE');
  const after = await call(buyer.request, '/cart').then((r) => r.json());
  expect(after.items.map((/** @type {any} */ l) => l.product.id)).not.toContain(product.id);
  await writeFile(
    `${dir}/organization-suspension.json`,
    JSON.stringify({ organization: suspended, cart: after }, null, 2),
  );
});
