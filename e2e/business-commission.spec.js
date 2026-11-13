import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  prepareMember,
  prepareStaff,
  productInput,
  openStore,
  add,
  checkout,
} from './business-helpers.js';
import { sql } from './database.js';

const evidence = 'artifacts/business/commission';
const price = 3333;
// 3,333 x 8% = 266.64 -> 266 (rounded down, issue #130).
const commission = Math.floor((price * 800) / 10000);
const yen = (/** @type {number} */ value) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);

/** @param {string} id */
function storedCommission(id) {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(id)) throw new Error('Unexpected order id.');
  const [rate, amount] = sql(`SELECT commission_rate_bp, commission_yen FROM orders WHERE id='${id}';`).split('\t');
  return { rate: Number(rate), amount: Number(amount) };
}

/** Buy one unit of the product and return the order. */
async function buy(request, productId) {
  await add(request, productId, 1);
  return (await checkout(request)).order;
}

// Issue #130: the commission stored on each order is shown on the store's sales page and the operator's pages,
// and a closed store's sales stay readable by the owner, an ORG_ADMIN and the operator (not by its staff).
test('sales pages show the stored commission and a closed store stays readable', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [owner, buyer, admin] = await Promise.all(contexts.map((context) => context.newPage()));
  let buyerMember;
  try {
    prepareMember(await login(owner, 'test.seller@example.com'), 'SHOP_OWNER');
    buyerMember = await login(buyer, 'test.user@example.com');
    prepareMember(buyerMember, 'USER');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');

    const storeName = `手数料確認店 ${randomUUID().slice(0, 6)}`;
    const storeId = await openStore(owner.request, storeName);
    const created = await call(owner.request, '/products', 'POST', { ...productInput(), storeId, priceYen: price });
    expect(created.status(), await created.text()).toBe(200);
    const productId = (await created.json()).id;

    // Three orders: one kept, one cancelled (no commission), one stored at an older 10% rate.
    const kept = await buy(buyer.request, productId);
    const cancelled = await buy(buyer.request, productId);
    const older = await buy(buyer.request, productId);
    expect(storedCommission(kept.id)).toEqual({ rate: 800, amount: commission });
    const requested = await call(buyer.request, `/orders/${cancelled.id}/cancellation`, 'POST', { reason: '確認用' });
    expect(requested.status(), await requested.text()).toBe(200);
    const approved = await call(owner.request, `/seller/orders/${cancelled.id}/cancellation`, 'PUT', {
      approved: true,
      reason: '承知しました',
    });
    expect(approved.status(), await approved.text()).toBe(200);
    // The stored amount stays after the cancellation; the pages show it as "no commission".
    expect(storedCommission(cancelled.id)).toEqual({ rate: 800, amount: commission });
    // An order placed while the setting was 10%: the pages must show what the order stored, not today's rate.
    sql(`UPDATE orders SET commission_rate_bp=1000, commission_yen=333 WHERE id='${older.id}';`);
    const expectedTotals = { total: price * 2, commission: commission + 333, net: price * 2 - commission - 333 };

    // The owner's sales page (open store): per order and totals, again after a reload.
    await owner.goto(`${ec}/seller/sales`);
    await owner.getByLabel('管理する店舗', { exact: true }).selectOption(String(storeId));
    const report = owner.getByTestId('sales-report');
    const checkOpenReport = async () => {
      await expect(report.getByRole('heading', { name: storeName })).toBeVisible();
      await expect(owner.getByTestId('sales-counts')).toHaveText(
        '注文数：2件 / 支払い待ち：0件 / キャンセル：1件 / キャンセル申請中：0件',
      );
      await expect(owner.getByTestId('sales-totals')).toHaveText(
        `注文金額${yen(expectedTotals.total)}販売手数料${yen(expectedTotals.commission)}差引額${yen(expectedTotals.net)}`,
      );
      await expect(report.getByRole('row').filter({ hasText: kept.id })).toContainText(
        `${yen(price)}8%${yen(commission)}${yen(price - commission)}`,
      );
      await expect(report.getByRole('row').filter({ hasText: cancelled.id })).toContainText('手数料なし');
      await expect(report.getByRole('row').filter({ hasText: older.id })).toContainText(
        `${yen(price)}10%${yen(333)}${yen(price - 333)}`,
      );
    };
    await checkOpenReport();
    await owner.reload();
    await checkOpenReport();
    await owner.screenshot({ path: `${evidence}/seller-sales-reloaded.png`, fullPage: true });
    const sellerReport = await call(owner.request, `/seller/stores/${storeId}/sales`).then((r) => r.json());
    expect(sellerReport.totals).toMatchObject({
      orderCount: 2,
      cancelledCount: 1,
      totalYen: expectedTotals.total,
      commissionYen: expectedTotals.commission,
      netYen: expectedTotals.net,
    });
    await writeFile(`${evidence}/seller-sales.json`, JSON.stringify(sellerReport, null, 2));

    // The operator's order list: commission on each order card.
    await admin.goto(`${ec}/operator/orders`);
    await admin.reload();
    await expect(admin.getByTestId(`order-${kept.id}`).getByTestId('order-commission')).toHaveText(
      `販売手数料：${yen(commission)}（8%） / 差引額：${yen(price - commission)}`,
    );
    await expect(admin.getByTestId(`order-${cancelled.id}`).getByTestId('order-commission')).toHaveText(
      '販売手数料：手数料なし（キャンセル）',
    );
    const all = await call(admin.request, '/operator/orders').then((r) => r.json());
    const counted = all.filter((o) => o.sales?.counted);
    await expect(admin.getByTestId('operator-commission-total')).toContainText(
      `販売手数料：${yen(counted.reduce((sum, o) => sum + o.sales.commissionYen, 0))}`,
    );
    await admin.screenshot({ path: `${evidence}/operator-orders-reloaded.png`, fullPage: true });
    await writeFile(
      `${evidence}/operator-orders.json`,
      JSON.stringify(
        all.filter((o) => [kept.id, cancelled.id, older.id].includes(o.id)),
        null,
        2,
      ),
    );
    // Buyers do not receive the commission.
    const buyerView = await call(buyer.request, `/orders/${kept.id}`).then((r) => r.json());
    expect(buyerView.sales).toBeNull();

    // Close the store directly in the database (the closing operation is issue #79) and release its staff.
    sql(`UPDATE stores SET closing_started_at=NOW(6), closing_started_by='OWNER', closed_at=NOW(6) WHERE id=${storeId};
         DELETE FROM store_members WHERE store_id=${storeId};`);

    // The owner picks the closed store on the sales page while another store is chosen above the page.
    await owner.goto(`${ec}/seller/sales`);
    await owner.getByLabel('管理する店舗', { exact: true }).selectOption('1');
    await owner.getByLabel('表示する店舗').selectOption(String(storeId));
    await expect(report.getByRole('heading', { name: storeName })).toContainText('閉鎖済み');
    await expect(report.getByRole('note')).toContainText('読み取り専用');
    await expect(owner.getByTestId('sales-totals')).toHaveText(
      `注文金額${yen(expectedTotals.total)}販売手数料${yen(expectedTotals.commission)}差引額${yen(expectedTotals.net)}`,
    );
    await owner.reload();
    await owner.getByLabel('表示する店舗').selectOption(String(storeId));
    await expect(report.getByRole('heading', { name: storeName })).toContainText('閉鎖済み');
    await expect(report.getByRole('row').filter({ hasText: kept.id })).toContainText(yen(commission));
    await owner.screenshot({ path: `${evidence}/closed-store-owner-reloaded.png`, fullPage: true });
    const closedReport = await call(owner.request, `/seller/stores/${storeId}/sales`);
    expect(closedReport.status()).toBe(200);
    const closedJson = await closedReport.json();
    expect(closedJson.closedAt).not.toBeNull();
    expect(closedJson.totals).toEqual(sellerReport.totals);
    await writeFile(`${evidence}/closed-store-sales.json`, JSON.stringify(closedJson, null, 2));

    // The operator opens the same store's sales from the store list.
    await admin.goto(`${ec}/operator/sellers`);
    await admin
      .locator('section.workspace-card')
      .filter({ has: admin.getByRole('heading', { name: storeName }) })
      .getByRole('link', { name: '注文実績を見る' })
      .click();
    await expect(admin).toHaveURL(`${ec}/operator/stores/${storeId}/sales`);
    await admin.reload();
    await expect(admin.getByTestId('sales-report').getByRole('heading', { name: storeName })).toContainText('閉鎖済み');
    await expect(admin.getByTestId('sales-totals')).toContainText(yen(expectedTotals.commission));
    await admin.screenshot({ path: `${evidence}/closed-store-operator-reloaded.png`, fullPage: true });
    const operatorJson = await call(admin.request, `/operator/stores/${storeId}/sales`).then((r) => r.json());
    expect(operatorJson.totals).toEqual(sellerReport.totals);
    await writeFile(`${evidence}/closed-store-operator.json`, JSON.stringify(operatorJson, null, 2));

    // Staff of the organization: a MANAGER of the closed store cannot read it; an ORG_ADMIN can.
    prepareStaff(buyerMember, { 1: 'STAFF' });
    sql(`INSERT INTO store_members(store_id,member_id,organization_id,role) VALUES(${storeId},'${buyerMember.id}',1,'MANAGER');`);
    expect((await call(buyer.request, `/seller/stores/${storeId}/sales`)).status()).toBe(403);
    const managerStores = await call(buyer.request, '/seller/sales/stores').then((r) => r.json());
    expect(managerStores.map((s) => s.id)).not.toContain(storeId);
    sql(`UPDATE organization_members SET role='ORG_ADMIN' WHERE member_id='${buyerMember.id}';`);
    expect((await call(buyer.request, `/seller/stores/${storeId}/sales`)).status()).toBe(200);
    const adminStores = await call(buyer.request, '/seller/sales/stores').then((r) => r.json());
    expect(adminStores.find((s) => s.id === storeId)?.closedAt).toBeTruthy();
    // An ORG_ADMIN without a role at an open store stays on the personnel pages (decision 2-5).
    expect((await call(buyer.request, '/seller/stores/2/sales')).status()).toBe(403);
  } finally {
    if (buyerMember) prepareMember(buyerMember, 'USER');
    await Promise.all(contexts.map((context) => context.close()));
  }
});
