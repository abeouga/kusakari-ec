import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ec, call, login, prepareMember, productInput, add, openStore, capture } from './business-helpers.js';
import { sql } from './database.js';
import { e2eDatabasePort, importRuntimeTools } from '../scripts/runtime-tools.mjs';

// Issue #16: the operator warns a product or store before (or without) suspending it, through the real API, MySQL and
// Cognito. Every store and product here is created by the test in the sample organization; sample data is untouched.
test.use({ trace: 'off' });
test.describe.configure({ mode: 'serial' });

const dir = 'artifacts/business/moderation';
const id = (/** @type {unknown} */ value) => {
  if (!Number.isInteger(value)) throw new Error('Unexpected fixture id.');
  return Number(value);
};
const productId = (/** @type {string} */ value) => {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(value)) throw new Error('Unexpected fixture id.');
  return value;
};

/** @type {import('@playwright/test').Page} */ let owner;
/** @type {import('@playwright/test').Page} */ let buyer;
/** @type {import('@playwright/test').Page} */ let admin;

test.beforeAll(async ({ browser }) => {
  await mkdir(dir, { recursive: true });
  owner = await (await browser.newContext()).newPage();
  buyer = await (await browser.newContext()).newPage();
  admin = await (await browser.newContext()).newPage();
  prepareMember(await login(owner, 'test.seller@example.com'), 'SHOP_OWNER');
  prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
  prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
});

test.afterAll(async () => {
  for (const page of [owner, buyer, admin]) await page?.context().close();
});

/** @param {number} storeId */
async function newProduct(storeId) {
  const created = await call(owner.request, '/products', 'POST', { ...productInput(), storeId });
  expect(created.status(), await created.text()).toBe(200);
  return created.json();
}

/** @param {number} storeId */
const buyerSees = (storeId) => call(buyer.request, `/products?storeId=${storeId}`).then((r) => r.json());
/** @param {string} title @param {string} name */
const ownerNotices = (title, name) =>
  call(owner.request, '/notifications')
    .then((r) => r.json())
    .then((list) => list.filter((/** @type {any} */ n) => n.title === title && n.body.startsWith(name)));

/**
 * Runs one operator-style dialog: open it from the button, try the empty reason when it is required, then confirm.
 * @param {import('@playwright/test').Locator} scope @param {string} button @param {string} title
 * @param {string} confirm @param {string} reason
 */
async function operate(scope, button, title, confirm, reason, required = true) {
  await scope.getByRole('button', { name: button, exact: true }).click();
  const dialog = admin.getByRole('alertdialog', { name: title });
  if (required) {
    await dialog.getByRole('button', { name: confirm, exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('理由を入力してください。');
  }
  await dialog.getByRole('textbox').fill(reason);
  await dialog.getByRole('button', { name: confirm, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('a warned product stays on sale, is suspended from the danger zone, resumed and cleared, with its history', async () => {
  const storeId = await openStore(owner.request, `警告確認店 ${randomUUID().slice(0, 8)}`);
  const product = await newProduct(storeId);
  const warnReason = `ラベルの表記に誤りがあります ${randomUUID().slice(0, 4)}`;

  // Warn: the reason is required, the product stays on sale and the store's people are notified.
  await admin.goto(`${ec}/operator/products`);
  const card = admin.getByTestId(`operator-product-${product.id}`);
  await operate(card, '警告する', '警告の確認', '警告する', warnReason);
  await expect(card.locator('.moderation-warning')).toContainText(`警告中運営からの警告：${warnReason}`);
  await expect(card).toContainText('公開可能');
  expect((await buyerSees(storeId)).some((/** @type {any} */ p) => p.id === product.id)).toBe(true);
  const warned = await ownerNotices('商品に運営から警告がありました', product.name);
  expect(warned.map((/** @type {any} */ n) => n.body)).toEqual([`${product.name} / ${warnReason}`]);

  // The seller sees the badge and the reason in the product list, and the notice in the notifications.
  await owner.goto(`${ec}/seller/products`);
  await owner.getByLabel('管理する店舗').selectOption(String(storeId));
  const notices = owner.getByRole('region', { name: '運営からの警告・停止' });
  await expect(notices).toContainText(product.name);
  await expect(notices).toContainText(warnReason);
  await expect(owner.getByTestId(`manage-${product.id}`)).toContainText('警告中');
  await capture(owner, `${dir}/seller-product-warning.png`, notices);
  await owner.goto(`${ec}/seller/notifications`);
  await expect(owner.locator('.workspace-main')).toContainText(`${product.name} / ${warnReason}`);

  // Suspend from the danger zone without another warning: the reason is required and buyers no longer see it.
  await operate(
    card.getByRole('region', { name: 'デンジャーエリア' }),
    '公開を停止',
    '公開停止の確認',
    '公開停止を確定',
    '是正されないため停止します',
  );
  await expect(card).toContainText('公開停止中');
  await expect(card.getByRole('region', { name: 'デンジャーエリア' })).toHaveCount(0);
  expect((await buyerSees(storeId)).some((/** @type {any} */ p) => p.id === product.id)).toBe(false);
  await owner.goto(`${ec}/seller/products`);
  await owner.getByLabel('管理する店舗').selectOption(String(storeId));
  await expect(owner.getByTestId(`manage-${product.id}`)).toContainText('運営により公開停止中');

  // Resume (reason optional) from the normal position, then clear the warning.
  await operate(card, '公開停止を解除', '公開停止の解除の確認', '公開停止の解除を確定', '', false);
  await expect(card).toContainText('公開可能');
  expect((await buyerSees(storeId)).some((/** @type {any} */ p) => p.id === product.id)).toBe(true);
  await operate(card, '警告を解除', '警告の解除の確認', '警告を解除する', '表記が直りました', false);
  await expect(card.locator('.moderation-warning')).toHaveCount(0);

  // Every operation is one history row with the operator; it survives a reload.
  await admin.reload();
  await card.getByText('警告・停止の履歴', { exact: true }).click();
  const history = card.locator('.moderation-events li');
  await expect(history).toHaveCount(4);
  await expect(history.nth(0)).toContainText('警告の解除');
  await expect(history.nth(0)).toContainText('表記が直りました');
  await expect(history.nth(3)).toContainText(`警告（`);
  await expect(history.nth(3)).toContainText(warnReason);
  await capture(admin, `${dir}/operator-product-history-reloaded.png`, card);
  const events = await call(admin.request, `/operator/products/${product.id}/moderation-events`).then((r) => r.json());
  expect(events.map((/** @type {any} */ e) => e.type)).toEqual(['CLEAR_WARNING', 'RESUME', 'SUSPEND', 'WARN']);
  expect(
    sql(
      `SELECT GROUP_CONCAT(event_type ORDER BY id) FROM product_moderation_events WHERE product_id='${productId(product.id)}';`,
    ),
  ).toBe('WARN,SUSPEND,RESUME,CLEAR_WARNING');
  const listed = await call(admin.request, '/operator/products')
    .then((r) => r.json())
    .then((rows) => rows.find((/** @type {any} */ row) => row.id === product.id));
  expect([listed.suspended, listed.warning]).toEqual([false, null]);
  for (const title of [
    '商品の公開を停止しました',
    '商品の公開停止を解除しました',
    '商品への運営の警告が解除されました',
  ])
    expect(await ownerNotices(title, product.name)).toHaveLength(1);
  await writeFile(`${dir}/product-moderation.json`, JSON.stringify({ product: listed, events }, null, 2));

  // The API refuses a warning or a suspension without a reason.
  for (const [path, body] of [
    ['warning', { warned: true, reason: ' ' }],
    ['moderation', { suspended: true, reason: '' }],
  ]) {
    const refused = await call(admin.request, `/operator/products/${product.id}/${path}`, 'PUT', body);
    expect([refused.status(), (await refused.json()).code]).toEqual([400, 'REASON_REQUIRED']);
  }
  // Sellers and buyers cannot moderate or read the operator history.
  expect(
    (
      await call(owner.request, `/operator/products/${product.id}/warning`, 'PUT', { warned: true, reason: 'x' })
    ).status(),
  ).toBe(403);
  expect((await call(buyer.request, `/operator/products/${product.id}/moderation-events`)).status()).toBe(403);
});

test('a store warning is shown to the store people and cleared; suspension needs a reason and is notified', async () => {
  const name = `店舗警告確認店 ${randomUUID().slice(0, 8)}`;
  const storeId = await openStore(owner.request, name);
  const warnReason = '営業時間の表示が実際と違います';

  await admin.goto(`${ec}/operator/sellers`);
  const card = admin.getByTestId(`operator-store-${storeId}`);
  await operate(card, '警告する', '警告の確認', '警告する', warnReason);
  await expect(card.locator('.moderation-warning')).toContainText(warnReason);
  await expect(card).toContainText('公開中');
  expect((await call(buyer.request, `/stores/${storeId}`)).status()).toBe(200);
  // Buyers see nothing of the warning (issue #16 decision 9).
  expect((await call(buyer.request, `/stores/${storeId}`).then((r) => r.json())).warning).toBeNull();
  expect((await ownerNotices('店舗に運営から警告がありました', name)).map((/** @type {any} */ n) => n.body)).toEqual([
    `${name} / ${warnReason}`,
  ]);

  await owner.goto(`${ec}/seller/stores`);
  const row = owner.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText(`警告中運営からの警告：${warnReason}`);
  await owner.reload();
  await expect(row).toContainText(warnReason);
  await capture(owner, `${dir}/seller-store-warning-reloaded.png`, row);

  // Clear the warning: the seller's row no longer shows it.
  await operate(card, '警告を解除', '警告の解除の確認', '警告を解除する', '', false);
  await expect(card.locator('.moderation-warning')).toHaveCount(0);
  await owner.reload();
  await expect(row).not.toContainText('警告中');
  expect(await ownerNotices('店舗への運営の警告が解除されました', name)).toHaveLength(1);

  // Suspension from the danger zone requires a reason (the API too) and is notified, as is the resumption.
  const refused = await call(admin.request, `/operator/stores/${storeId}/enabled`, 'PUT', {
    enabled: false,
    reason: '',
  });
  expect([refused.status(), (await refused.json()).code]).toEqual([400, 'REASON_REQUIRED']);
  await operate(
    card.getByRole('region', { name: 'デンジャーエリア' }),
    '利用を停止',
    '利用停止の確認',
    '利用停止を確定',
    '確認のため停止します',
  );
  await expect(card).toContainText('運営により停止中');
  expect((await call(buyer.request, `/stores/${storeId}`)).status()).toBe(404);
  await operate(card, '利用を再開', '利用再開の確認', '利用再開を確定', '確認が終わりました', false);
  await expect(card).toContainText('公開中');
  expect(await ownerNotices('店舗の利用が停止されました', name)).toHaveLength(1);
  expect(await ownerNotices('店舗の利用停止が解除されました', name)).toHaveLength(1);

  await admin.reload();
  await card.getByText('警告・停止の履歴', { exact: true }).click();
  await expect(card.locator('.moderation-events li')).toHaveCount(4);
  await capture(admin, `${dir}/operator-store-history-reloaded.png`, card);
  const events = await call(admin.request, `/operator/stores/${storeId}/moderation-events`).then((r) => r.json());
  expect(events.map((/** @type {any} */ e) => e.type)).toEqual(['RESUME', 'SUSPEND', 'CLEAR_WARNING', 'WARN']);
  expect(events.every((/** @type {any} */ e) => e.actorName)).toBe(true);
  expect(sql(`SELECT COUNT(*) FROM store_moderation_events WHERE store_id=${id(storeId)};`)).toBe('4');
  const stores = await call(owner.request, '/seller/stores').then((r) => r.json());
  await writeFile(
    `${dir}/store-moderation.json`,
    JSON.stringify({ store: stores.find((/** @type {any} */ s) => s.id === storeId), events }, null, 2),
  );
});

test('checkout waits for a suspension in progress and refuses the suspended product', async () => {
  const storeId = await openStore(owner.request, `停止競合確認店 ${randomUUID().slice(0, 8)}`);
  const product = await newProduct(storeId);
  await add(buyer.request, product.id, 1);
  const cart = await call(buyer.request, '/cart').then((r) => r.json());
  expect(cart.canCheckout).toBe(true);

  // Fault injection: a transaction holds the product row like the operator's suspension, commits after 3 seconds.
  const port = e2eDatabasePort();
  const tools = importRuntimeTools(process.cwd());
  const executable = process.env.MYSQL_CLIENT || (tools.MySql ? join(tools.MySql, 'mysql.exe') : 'mysql');
  const holder = spawn(
    executable,
    ['-h', '127.0.0.1', '-P', String(port), '-u', String(process.env.KUSAKARI_EC_DB_USER), 'kusakari_e2e'],
    { env: { ...process.env, MYSQL_PWD: process.env.KUSAKARI_EC_DB_PASSWORD } },
  );
  const finished = new Promise((resolve) => holder.on('close', resolve));
  holder.stdin.end(
    `START TRANSACTION; UPDATE products SET suspended=TRUE WHERE id='${productId(product.id)}'; DO SLEEP(4); COMMIT;`,
  );
  // The row is held once a read that does not wait is refused.
  const held = () => {
    try {
      sql(`SELECT id FROM products WHERE id='${productId(product.id)}' FOR SHARE NOWAIT;`);
      return false;
    } catch {
      return true;
    }
  };
  await expect.poll(held).toBe(true);
  const started = Date.now();
  const refused = await call(buyer.request, '/orders', 'POST', {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'PAY_AT_STORE',
  });
  await finished;
  expect([refused.status(), (await refused.json()).code]).toEqual([409, 'OUT_OF_STOCK']);
  expect(Date.now() - started).toBeGreaterThan(1500);
  expect(sql(`SELECT COUNT(*) FROM order_items WHERE product_id='${productId(product.id)}';`)).toBe('0');
  expect(sql(`SELECT quantity FROM inventory WHERE product_id='${productId(product.id)}';`)).toBe('5');
});
