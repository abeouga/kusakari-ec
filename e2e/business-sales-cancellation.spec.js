import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add, checkout } from './business-helpers.js';

test.use({ trace: 'off' });

/** The counts the sales page should show, computed from the real sales API (issue #130). */
async function expected(request) {
  const report = await call(request, '/seller/stores/1/sales').then((r) => r.json());
  const t = report.totals;
  return {
    report,
    text: `注文数：${t.orderCount}件 / 支払い待ち：${t.pendingPaymentCount}件 / キャンセル：${t.cancelledCount}件 / キャンセル申請中：${t.cancellationPendingCount}件`,
  };
}

// Issue #14: a buyer's cancellation request must show up in the seller's sales page.
test('seller sales page counts pending and approved cancellations', async ({ browser }) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  const dir = 'artifacts/business/sales-cancellation';
  await mkdir(dir, { recursive: true });
  try {
    prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    const created = await call(seller.request, '/products', 'POST', productInput());
    expect(created.status(), await created.text()).toBe(200);
    await add(buyer.request, (await created.json()).id, 1);
    const { order } = await checkout(buyer.request);
    const requested = await call(buyer.request, `/orders/${order.id}/cancellation`, 'POST', {
      reason: '受取に行けないため',
    });
    expect(requested.status(), await requested.text()).toBe(200);

    await seller.goto(`${ec}/seller/sales`);
    const card = seller.getByTestId('sales-report');
    const counts = seller.getByTestId('sales-counts');
    const pending = await expected(seller.request);
    await expect(counts).toHaveText(pending.text);
    expect(pending.text).not.toContain('キャンセル申請中：0件');
    await expect(card.getByRole('row').filter({ hasText: order.id })).toContainText('注文受付（キャンセル申請中）');

    const approved = await call(seller.request, `/seller/orders/${order.id}/cancellation`, 'PUT', {
      approved: true,
      reason: '承知しました',
    });
    expect(approved.status(), await approved.text()).toBe(200);
    await seller.reload();
    const after = await expected(seller.request);
    await expect(counts).toHaveText(after.text);
    await expect(card.getByRole('row').filter({ hasText: order.id })).toContainText('キャンセル');
    await expect(card.getByRole('row').filter({ hasText: order.id })).toContainText('手数料なし');
    await seller.screenshot({ path: `${dir}/reloaded.png`, fullPage: true });
    await writeFile(
      `${dir}/seller-order.json`,
      JSON.stringify(
        after.report.orders.find((o) => o.orderId === order.id),
        null,
        2,
      ),
    );
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});
