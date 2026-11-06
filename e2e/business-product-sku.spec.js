import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput } from './business-helpers.js';
import { addImages } from './product-images.js';

test.use({ trace: 'off' });

const assigned = /^KS-\d{8}-[2-9A-HJ-NP-Z]{6}$/;

// Issue #25: the server assigns a unique product number. Issue #46: the wizard has no number input at all
// and shows the number read-only while editing.
test('product number is assigned on registration and kept on edit', async ({ page }) => {
  const dir = 'artifacts/business/product-sku';
  await mkdir(dir, { recursive: true });
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  await page.goto(`${ec}/seller/products/new`);
  const form = page.locator('.product-form');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await form.getByLabel('商品名', { exact: true }).fill('商品番号自動設定の確認');
  await expect(form.locator('input[name="sku"]')).toHaveCount(0);
  await expect(form.getByText('商品番号', { exact: true })).toHaveCount(0);
  await form.getByLabel('商品説明', { exact: true }).fill('商品番号を入力せずに登録します。');
  await form.getByLabel('税込価格（円）', { exact: true }).fill('1200');
  await form.getByLabel('選択店舗の在庫', { exact: true }).fill('3');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('画像');
  await addImages(form);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
  await form.getByRole('button', { name: '設定せず次へ', exact: true }).click();
  const review = form.getByRole('region', { name: '出品内容の確認' });
  await expect(review).toContainText('保存時に自動で決まります');

  const saved = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
  await form.getByRole('button', { name: '出品する', exact: true }).click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  const product = await response.json();
  expect(response.request().postDataJSON().sku).toBe('');
  expect(product.sku).toMatch(assigned);
  await expect(page.getByRole('status').filter({ hasText: product.sku })).toBeVisible();

  await page.goto(`${ec}/seller/products`);
  await page.reload();
  await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
  const card = page.getByTestId(`manage-${product.id}`);
  await expect(card).toContainText(product.sku);
  await card.getByRole('button', { name: '編集', exact: true }).click();
  await expect(form.getByLabel('商品番号', { exact: true })).toHaveText(product.sku);
  await expect(form.locator('input[name="sku"]')).toHaveCount(0);
  await expect(form.getByText('商品番号は変更できません。', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${dir}/edit-after-reload.png`, fullPage: true });

  // Two blank creates get different numbers, and an API update that leaves the number blank keeps it.
  const input = { ...productInput(), sku: '' };
  const second = await call(page.request, '/products', 'POST', input);
  expect(second.status(), await second.text()).toBe(200);
  const created = await second.json();
  expect(created.sku).toMatch(assigned);
  expect(created.sku).not.toBe(product.sku);
  const kept = await call(page.request, `/products/${created.id}`, 'PUT', { ...input, expectedStock: input.stock });
  expect(kept.status(), await kept.text()).toBe(200);
  expect((await kept.json()).sku).toBe(created.sku);
  // The number cannot be changed through the API either, and another product's number is never reused.
  const changed = await call(page.request, `/products/${created.id}`, 'PUT', {
    ...input,
    sku: `CHANGED-${created.id.slice(0, 8)}`,
    expectedStock: input.stock,
  });
  expect(changed.status()).toBe(409);
  const refusal = await changed.json();
  expect(refusal.code).toBe('SKU_IMMUTABLE');
  expect(JSON.stringify(refusal)).not.toContain('CHANGED-');
  const taken = await call(page.request, `/products/${created.id}`, 'PUT', {
    ...input,
    sku: product.sku,
    expectedStock: input.stock,
  });
  expect(taken.status()).toBe(409);
  const duplicate = await call(page.request, '/products', 'POST', { ...input, sku: product.sku });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).code).toBe('SKU_EXISTS');
  const products = await (await call(page.request, '/products?storeId=1')).json();
  const stored = products.find((item) => item.id === created.id);
  expect(stored.sku).toBe(created.sku);
  await writeFile(
    `${dir}/products.json`,
    JSON.stringify({ first: product.sku, second: stored.sku, refusal: refusal.code }, null, 2),
  );
});
