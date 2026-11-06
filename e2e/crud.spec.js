import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { replenishOrder, sql } from './database.js';

// The product CRUD scenario moved to business-product-crud.spec.js (signed-in seller, issue #46).

async function fillDelivery(page, name) {
  await page.getByRole('combobox', { name: '受取方法', exact: true }).selectOption('DELIVERY');
  await page.getByLabel('受取者名', { exact: true }).fill(name);
  await page.getByLabel('電話番号', { exact: true }).fill('000-0000-0000');
  await page.getByLabel('メールアドレス', { exact: true }).fill('demo@example.invalid');
  await page.getByLabel('郵便番号', { exact: true }).fill('000-0000');
  await page.getByLabel('住所', { exact: true }).fill('デモ県デモ市 サンプル住所');
  await page.getByLabel('建物名・部屋番号', { exact: true }).fill('デモ棟 101');
  await page.getByLabel('受取・配送希望日', { exact: true }).fill('2026-12-10');
  await page.getByRole('combobox', { name: '希望時間帯', exact: true }).selectOption('14-16');
  await page.getByRole('button', { name: '入力情報を保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('受取・配送情報を保存');
}

test('delivery CRUD, order snapshot edit and history deletion are persisted and isolated', async ({
  page,
  playwright,
}) => {
  await mkdir('artifacts/e2e', { recursive: true });
  let order;
  let checkoutBody;
  try {
    await page.goto('/');
    await expect(page.getByTestId('product-rosemary')).toBeVisible();
    await page.getByRole('button', { name: 'ローズマリーをカートに追加', exact: true }).click();
    await expect(page.getByRole('link', { name: 'カートを開く（1点）' })).toBeVisible();
    await page.getByRole('link', { name: /カートを開く/ }).click();
    await fillDelivery(page, 'デモ受取者');
    await expect(page.locator('.grand-total')).toContainText('2,280');
    await page.reload();
    await expect(page.locator('.grand-total')).toContainText('2,280');
    await expect(page.getByLabel('受取者名', { exact: true })).toHaveValue('デモ受取者');
    await page.screenshot({ path: 'artifacts/e2e/crud-cart-after-reload.png', fullPage: true });
    await page.getByRole('button', { name: '入力情報を削除', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '受取方法', exact: true })).toHaveValue('PICKUP');
    await expect(page.getByLabel('受取者名', { exact: true })).toHaveValue('');
    await fillDelivery(page, 'デモ受取者');
    await page.getByRole('button', { name: '注文内容を確認する', exact: true }).click();
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '注文を確定する', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    checkoutBody = response.request().postDataJSON();
    order = await response.json();
    expect(order.totalYen).toBe(2280);
    expect(order.subtotalYen).toBe(1480);
    expect(order.shippingFeeYen).toBe(800);
    await expect(page.getByRole('heading', { name: '注文を保存しました' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '注文履歴', exact: true }).first().click();
    await page.getByRole('button', { name: '注文情報を編集', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '受取方法', exact: true })).toBeDisabled();
    await page.getByLabel('受取者名', { exact: true }).fill('変更後デモ受取者');
    await page.getByRole('button', { name: '入力情報を保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('変更後デモ受取者');
    await expect(page.getByRole('button', { name: '編集を閉じる' })).toHaveCount(0);
    const history = await page.request.get('/api/orders');
    const updated = (await history.json())[0];
    const other = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      expect((await other.put(`/api/orders/${order.id}`, { data: updated.details })).status()).toBe(404);
      expect((await other.delete(`/api/orders/${order.id}`)).status()).toBe(404);
    } finally {
      await other.dispose();
    }
    const contact = {
      recipientName: '別のアカウント受取者',
      recipientPhone: '03-0000-0000',
      contactEmail: 'pickup@example.com',
    };
    expect(
      (
        await page.request.put('/api/account/pickup-contact', { data: { ...contact, contactEmail: 'not-an-email' } })
      ).status(),
    ).toBe(400);
    expect((await page.request.put('/api/account/pickup-contact', { data: contact })).status()).toBe(200);
    const unchanged = await page.request.get('/api/orders').then((r) => r.json());
    expect(unchanged[0].details.recipientName).toBe('変更後デモ受取者');
    await page.reload();
    await page.getByRole('button', { name: '注文履歴', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('変更後デモ受取者');
    await writeFile('artifacts/e2e/crud-order-after-reload.json', JSON.stringify(unchanged, null, 2));
    await page.screenshot({ path: 'artifacts/e2e/crud-order-after-reload.png', fullPage: true });
    await page.getByRole('button', { name: '履歴から削除', exact: true }).click();
    await page.getByRole('button', { name: '履歴削除を確定', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('注文履歴はまだありません');
    await page.reload();
    expect(await page.request.get('/api/orders').then((r) => r.json())).toHaveLength(0);
    const replay = await page.request.post('/api/orders', { data: checkoutBody });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).id).toBe(order.id);
    expect(sql(`SELECT COUNT(*) FROM orders WHERE id='${order.id}';`)).toBe('1');
  } finally {
    if (order) replenishOrder(order, 1);
  }
});

test('mobile detail and delivery form fit the screen and survive reload', async ({ page }) => {
  await mkdir('artifacts/e2e', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('product-olive')).toBeVisible();
  await page.getByRole('button', { name: 'オリーブの詳細', exact: true }).click();
  await expect(page.locator('.detail-main-image')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/e2e/crud-detail-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'ローズマリーをカートに追加', exact: true }).click();
  await page.getByRole('link', { name: /カートを開く/ }).click();
  await fillDelivery(page, 'モバイルデモ受取者');
  await page.reload();
  await expect(page.locator('.grand-total')).toContainText('2,280');
  await expect(page.getByLabel('受取者名', { exact: true })).toHaveValue('モバイルデモ受取者');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('受取者名', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/e2e/crud-cart-mobile.png', fullPage: true });
  const cart = await page.request.get('/api/cart').then((response) => response.json());
  await writeFile('artifacts/e2e/crud-cart-mobile.json', JSON.stringify(cart, null, 2));
});
