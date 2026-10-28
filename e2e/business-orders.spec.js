import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add, checkout } from './business-helpers.js';

test.use({ trace: 'off' });

test('header order history opens account order cards with thumbnails and a cancellation form', async ({ browser }) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  try {
    prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    const input = productInput();
    const created = await call(seller.request, '/products', 'POST', input);
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();
    await add(buyer.request, product.id, 2);
    const { order } = await checkout(buyer.request);

    await buyer.goto(ec);
    await buyer.locator('.kusakari-site-header').getByRole('link', { name: '注文履歴', exact: true }).click();
    await expect(buyer).toHaveURL(`${ec}/purchases`);
    await expect(buyer.locator('.workspace-main h1')).toHaveText('注文履歴');
    const sidebar = buyer.locator('.workspace-sidebar');
    await expect(sidebar.getByRole('link', { name: '注文履歴', exact: true })).toHaveClass('is-active');
    await expect(sidebar.getByRole('link', { name: '注文状況', exact: true })).toHaveCount(0);

    // Links from older header packages still land on the account page.
    await buyer.goto(`${ec}/?panel=orders`);
    await expect(buyer).toHaveURL(`${ec}/purchases`);

    const card = buyer.getByTestId(`order-${order.id}`);
    const head = card.locator('.order-card-head');
    await expect(head).toContainText(input.name);
    await expect(head).toContainText('注文受付');
    await expect(head.locator('img.order-thumb')).toHaveAttribute('src', input.imageUrl);
    await expect(card.getByRole('list', { name: '注文した商品' })).toHaveCount(0);
    await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    const line = card.getByRole('list', { name: '注文した商品' }).getByRole('listitem');
    await expect(line).toContainText(input.name);
    await expect(line).toContainText('× 2');
    await expect(line.getByRole('img', { name: input.name })).toBeVisible();

    await card.getByText('注文のキャンセルを申請', { exact: true }).click();
    const form = card.getByRole('form', { name: 'キャンセル申請' });
    const submit = form.getByRole('button', { name: 'キャンセルを申請', exact: true });
    await expect(submit).toBeDisabled();
    await form.getByRole('radio', { name: 'その他', exact: true }).check();
    await form.getByLabel('申請後は取り消せないことを確認しました').check();
    await submit.click();
    // The detail field becomes required for "その他"; nothing is sent until it is filled.
    await expect(card.locator('.order-cancel-note')).toHaveCount(0);
    await form.getByLabel(/詳細/).fill('受取日を変更したいため');
    await submit.click();
    await expect(buyer.getByRole('status')).toContainText('キャンセル申請を送信しました。');
    await expect(head).toContainText('キャンセル申請中');

    await buyer.reload();
    await head.click();
    await expect(card.locator('.order-cancel-note')).toContainText('キャンセルを申請中です');
    await expect(card.getByText('注文のキャンセルを申請', { exact: true })).toHaveCount(0);
    const pending = await call(buyer.request, `/orders/${order.id}`).then((r) => r.json());
    expect(pending.cancellationStatus).toBe('PENDING');
    expect(pending.cancellationReason).toBe('その他：受取日を変更したいため');
    expect(pending.items[0].imageUrl).toBe(input.imageUrl);
    await mkdir('artifacts/business', { recursive: true });
    await buyer.screenshot({ path: 'artifacts/business/order-history-pending.png', fullPage: true });

    const approved = await call(seller.request, `/seller/orders/${order.id}/cancellation`, 'PUT', {
      approved: true,
      reason: '承知しました',
    });
    expect(approved.status(), await approved.text()).toBe(200);
    await buyer.reload();
    await buyer.getByRole('group', { name: '注文状態で絞り込む' }).getByRole('button', { name: 'キャンセル' }).click();
    await expect(head).toContainText('キャンセル');
    await head.click();
    await expect(card).toContainText('店舗からの回答：承知しました');
    await expect(card.getByText('注文のキャンセルを申請', { exact: true })).toHaveCount(0);

    await buyer.setViewportSize({ width: 390, height: 900 });
    await buyer.reload();
    await head.click();
    expect(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await buyer.screenshot({ path: 'artifacts/business/order-history-390.png', fullPage: true });
    const persisted = await call(buyer.request, `/orders/${order.id}`).then((r) => r.json());
    expect(persisted.status).toBe('CANCELLED');
    await writeFile('artifacts/business/order-history.json', JSON.stringify(persisted, null, 2));
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});
