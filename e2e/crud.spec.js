import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { replenishOrder, sql } from './database.js';
import { ec, login, call, prepareMember } from './business-helpers.js';

// The product CRUD scenario moved to business-product-crud.spec.js (signed-in seller, issue #46).
// Issue #113: purchases are picked up at the product's store without shipping (#11, #70), so the buyer keeps only an
// optional pickup contact. The order keeps the contact it was placed with; the buyer may edit it and hide the order.

/** @param {import('@playwright/test').Page} page @param {string} name */
async function saveContact(page, name) {
  await page.goto(`${ec}/account/pickup-contact`);
  await page.getByLabel('受取人', { exact: true }).fill(name);
  await page.getByLabel('電話番号', { exact: true }).fill('000-0000-0000');
  await page.getByLabel('連絡先メール', { exact: true }).fill('demo@example.invalid');
  await page.getByRole('button', { name: '連絡先を保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('受取連絡先を保存しました。');
}

test('pickup contact CRUD, order snapshot edit and history hiding are persisted and isolated', async ({
  page,
  browser,
}) => {
  await mkdir('artifacts/e2e', { recursive: true });
  let order;
  let checkoutBody;
  const otherContext = await browser.newContext();
  try {
    prepareMember(await login(page, 'test.user@example.com'), 'USER');
    await saveContact(page, 'デモ受取者');
    await page.reload();
    await expect(page.getByLabel('受取人', { exact: true })).toHaveValue('デモ受取者');
    await page.getByRole('button', { name: '連絡先を消去', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('受取連絡先を消去しました。');
    await page.reload();
    await expect(page.getByLabel('受取人', { exact: true })).toHaveValue('');
    await saveContact(page, 'デモ受取者');

    await page.goto(`${ec}/`);
    await page.getByRole('button', { name: 'ローズマリーをカートに追加', exact: true }).click();
    await expect(page.getByRole('link', { name: 'カートを開く（1点）' })).toBeVisible();
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await expect(page.locator('.grand-total')).toContainText('1,480');
    await page.reload();
    await expect(page.locator('.grand-total')).toContainText('1,480');
    await page.screenshot({ path: 'artifacts/e2e/crud-cart-after-reload.png', fullPage: true });
    await page.getByRole('button', { name: '注文内容を確認する', exact: true }).click();
    await expect(page.locator('.checkout-contact')).toContainText('デモ受取者');
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '注文を確定する', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    checkoutBody = response.request().postDataJSON();
    [order] = (await response.json()).orders;
    // Store pickup only: the total is the item price without a shipping fee.
    expect(order.totalYen).toBe(1480);
    expect(order.items.reduce((sum, line) => sum + line.lineTotalYen, 0)).toBe(1480);
    expect(order).not.toHaveProperty('shippingFeeYen');
    expect(order.details.recipientName).toBe('デモ受取者');
    await expect(page.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();

    await page.goto(`${ec}/purchases`);
    const card = page.getByTestId(`order-${order.id}`);
    await card.getByRole('button').first().click();
    await card.getByText('受取連絡先を編集', { exact: true }).click();
    await card.getByLabel('受取人氏名', { exact: true }).fill('変更後デモ受取者');
    const edited = page.waitForResponse(
      (r) => r.url().endsWith(`/api/orders/${order.id}`) && r.request().method() === 'PUT',
    );
    await card.getByRole('button', { name: '連絡先を保存', exact: true }).click();
    expect((await edited).status()).toBe(200);
    const updated = (await call(page.request, '/orders').then((r) => r.json())).find((o) => o.id === order.id);
    expect(updated.details.recipientName).toBe('変更後デモ受取者');

    // Another member cannot read, edit or hide this order.
    const other = await otherContext.newPage();
    prepareMember(await login(other, 'test.admin@example.com'), 'ADMIN');
    const details = {
      recipientName: updated.details.recipientName,
      recipientPhone: updated.details.recipientPhone,
      contactEmail: updated.details.contactEmail,
    };
    expect((await call(other.request, `/orders/${order.id}`, 'PUT', details)).status()).toBe(404);
    expect((await call(other.request, `/orders/${order.id}`, 'DELETE')).status()).toBe(404);

    // Changing the account's contact afterwards does not rewrite the placed order.
    const contact = {
      recipientName: '別のアカウント受取者',
      recipientPhone: '03-0000-0000',
      contactEmail: 'pickup@example.com',
    };
    expect(
      (
        await call(page.request, '/account/pickup-contact', 'PUT', { ...contact, contactEmail: 'not-an-email' })
      ).status(),
    ).toBe(400);
    expect((await call(page.request, '/account/pickup-contact', 'PUT', contact)).status()).toBe(200);
    const unchanged = await call(page.request, '/orders').then((r) => r.json());
    expect(unchanged.find((o) => o.id === order.id).details.recipientName).toBe('変更後デモ受取者');
    await page.reload();
    await card.getByRole('button').first().click();
    await card.getByText('受取連絡先を編集', { exact: true }).click();
    await expect(card.getByLabel('受取人氏名', { exact: true })).toHaveValue('変更後デモ受取者');
    await writeFile('artifacts/e2e/crud-order-after-reload.json', JSON.stringify(unchanged, null, 2));
    await page.screenshot({ path: 'artifacts/e2e/crud-order-after-reload.png', fullPage: true });

    await card.getByText('購入履歴を非表示にする', { exact: true }).click();
    await card.getByRole('button', { name: '非表示を確定', exact: true }).click();
    await expect(page.getByTestId(`order-${order.id}`)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId(`order-${order.id}`)).toHaveCount(0);
    expect((await call(page.request, '/orders').then((r) => r.json())).some((o) => o.id === order.id)).toBe(false);
    // Hiding is not deleting: the same checkout key still returns the stored order, and the row remains.
    const replay = await call(page.request, '/orders', 'POST', checkoutBody);
    expect(replay.status()).toBe(200);
    expect((await replay.json()).orders[0].id).toBe(order.id);
    expect(sql(`SELECT COUNT(*) FROM orders WHERE id='${order.id}';`)).toBe('1');
  } finally {
    await otherContext.close();
    if (order) replenishOrder(order, 1);
  }
});

test('mobile detail and pickup contact form fit the screen and survive reload', async ({ page }) => {
  await mkdir('artifacts/e2e', { recursive: true });
  prepareMember(await login(page, 'test.user@example.com'), 'USER');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ec}/`);
  await expect(page.getByTestId('product-olive')).toBeVisible();
  await page.getByRole('button', { name: 'オリーブの詳細', exact: true }).click();
  await expect(page.locator('.detail-main-image')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/crud-detail-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'ローズマリーをカートに追加', exact: true }).click();
  await expect(page.getByRole('link', { name: 'カートを開く（1点）' })).toBeVisible();
  await saveContact(page, 'モバイルデモ受取者');
  await page.reload();
  await expect(page.getByLabel('受取人', { exact: true })).toHaveValue('モバイルデモ受取者');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/crud-contact-mobile.png', fullPage: true });
  await page.goto(`${ec}/cart`);
  await expect(page.locator('.grand-total')).toContainText('1,480');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/crud-cart-mobile.png', fullPage: true });
  const cart = await call(page.request, '/cart').then((response) => response.json());
  await writeFile('artifacts/e2e/crud-cart-mobile.json', JSON.stringify(cart, null, 2));
  expect(cart.items.map((item) => [item.product.id, item.quantity])).toEqual([['rosemary', 1]]);
});
