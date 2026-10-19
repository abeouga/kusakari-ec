import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('product wizard navigation, validation, responsive screenshots and edit tabs persist through MySQL', async ({
  page,
}) => {
  test.setTimeout(120000);
  await mkdir('artifacts/e2e', { recursive: true });
  const errors = [];
  let writes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/products') && r.method() === 'POST') writes++;
  });
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const beforeWrites = writes;
    await page.goto('/seller/products/new');
    const form = page.locator('.product-form');
    await expect(form.getByRole('button', { name: '次へ', exact: true })).toBeEnabled();
    await expect(form.locator('.wizard-steps button')).toHaveCount(3);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.locator('[name="name"]')).toBeFocused();
    await form.getByLabel('商品名', { exact: true }).fill('ウィザード検証用モンステラ');
    await form.getByLabel('商品番号', { exact: true }).fill(`WIZ-${randomUUID().slice(0, 8)}`);
    await form.getByLabel('商品説明', { exact: true }).fill('専用DBへの出品手順を確認します。');
    await addImages(form);
    await form.getByLabel('税込価格（円）', { exact: true }).fill('3800');
    await form.getByLabel('選択店舗の在庫', { exact: true }).fill('5');
    await expect(form.locator('.product-options[open]')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/e2e/wizard-info-${width}.png` });
    const footer = await form.locator('.wizard-footer').boundingBox();
    expect(footer.y + footer.height).toBeLessThanOrEqual(901);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.locator('summary').getByText('サイズ', { exact: true }).click();
    await form.getByLabel('鉢径（cm）', { exact: true }).fill('301');
    await form.locator('summary').getByText('サイズ', { exact: true }).click();
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.getByLabel('鉢径（cm）', { exact: true })).toBeFocused();
    await form.getByLabel('鉢径（cm）', { exact: true }).fill('24');
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
    await form.getByRole('button', { name: '手動で設定', exact: true }).click();
    await form.locator('[name="modelHeight"]').fill('275');
    await form.getByRole('button', { name: '植物のプレビューを確認', exact: true }).click();
    await expect(form.getByTitle('植物の3Dプレビュー')).toBeVisible();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `artifacts/e2e/wizard-model-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.getByRole('button', { name: '設定せず次へ', exact: true }).click();
    await expect(form.getByRole('region', { name: '出品内容の確認' })).toContainText('設定なし');
    await form.getByRole('button', { name: '商品情報を修正', exact: true }).click();
    await expect(form.getByLabel('鉢径（cm）', { exact: true })).toHaveValue('24');
    await expect(form.locator('[name="heightCm"]')).toHaveValue('275');
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await form.getByRole('button', { name: '設定せず次へ', exact: true }).click();
    await page.screenshot({ path: `artifacts/e2e/wizard-review-${width}.png` });
    expect(writes).toBe(beforeWrites);
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await form.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const product = await response.json();
    expect(product.plantModelProfile).toBeNull();
    await expect(page).toHaveURL(/\/seller\/products$/);
    await page.reload();
    const card = page.getByTestId(`manage-${product.id}`);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/e2e/wizard-listed-${width}.png` });
    await card.getByRole('button', { name: '編集', exact: true }).click();
    await expect(page.locator('.manager-list')).toHaveCount(0);
    await expect(form.locator('.wizard-steps button')).toHaveCount(2);
    await form.getByLabel('税込価格（円）', { exact: true }).fill('3900');
    await form
      .locator('.wizard-steps')
      .getByRole('button', { name: /庭オブジェクト/ })
      .click();
    await form
      .locator('.wizard-steps')
      .getByRole('button', { name: /商品情報/ })
      .click();
    await expect(form.getByLabel('税込価格（円）', { exact: true })).toHaveValue('3900');
    const updated = page.waitForResponse(
      (r) => r.url().includes(`/api/products/${product.id}`) && r.request().method() === 'PUT',
    );
    await form.getByRole('button', { name: '変更を保存', exact: true }).click();
    expect((await updated).ok()).toBe(true);
    await expect(page.getByTestId(`manage-${product.id}`)).toContainText('3,900');
    await page.reload();
    const products = await page.request.get('/api/products?storeId=1').then((r) => r.json());
    const stored = products.find((p) => p.id === product.id);
    expect(stored.priceYen).toBe(3900);
    expect(stored.heightCm).toBe(275);
    expect(stored.potDiameterCm).toBe(24);
    await writeFile(`artifacts/e2e/wizard-persisted-${width}.json`, JSON.stringify(stored, null, 2));
  }
  expect(errors).toEqual([]);
});
