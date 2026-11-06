import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add, checkout } from './business-helpers.js';

test.use({ trace: 'off' });

/** The counts the sales page should show, computed from the real seller orders API. */
async function expected(request) {
  const orders = await call(request, '/seller/orders?storeId=1').then((r) => r.json());
  const active = orders.filter((o) => o.status !== 'CANCELLED');
  return {
    orders,
    text: `注文数：${active.length}件 / キャンセル：${orders.length - active.length}件 / キャンセル申請中：${
      active.filter((o) => o.cancellationStatus === 'PENDING').length
    }件`,
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
    const card = seller.locator('.workspace-main section.workspace-card');
    const pending = await expected(seller.request);
    await expect(card.locator('p').first()).toHaveText(pending.text);
    expect(pending.text).not.toContain('キャンセル申請中：0件');
    await expect(card.getByText(`${order.id} / 注文受付（キャンセル申請中）`, { exact: false })).toBeVisible();

    const approved = await call(seller.request, `/seller/orders/${order.id}/cancellation`, 'PUT', {
      approved: true,
      reason: '承知しました',
    });
    expect(approved.status(), await approved.text()).toBe(200);
    await seller.reload();
    const after = await expected(seller.request);
    await expect(card.locator('p').first()).toHaveText(after.text);
    await expect(card.getByText(`${order.id} / キャンセル /`, { exact: false })).toBeVisible();
    await seller.screenshot({ path: `${dir}/reloaded.png`, fullPage: true });
    await writeFile(
      `${dir}/seller-order.json`,
      JSON.stringify(
        after.orders.find((o) => o.id === order.id),
        null,
        2,
      ),
    );
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});
