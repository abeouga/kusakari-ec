import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

test('product sliders preserve optional values, keyboard precision and persisted plant settings', async ({ page }) => {
  await mkdir('artifacts/e2e', { recursive: true });
  await page.goto('/seller/products/new');
  const form = page.locator('.product-form');
  for (const name of ['ageYears', 'heightCm', 'potDiameterCm'])
    await expect(form.locator(`input[name="${name}"]`)).toHaveValue('');
  await addImages(form);
  await form.getByLabel('商品名', { exact: true }).fill('スライダー検証用植物');
  await form.getByLabel('商品番号', { exact: true }).fill(`RANGE-${randomUUID().slice(0, 8)}`);
  await form.getByLabel('商品説明', { exact: true }).fill('専用DBで数値入力の保存を確認します。');
  await form.getByLabel('選択店舗の在庫', { exact: true }).fill('3');
  await form.locator('summary').getByText('サイズ', { exact: true }).click();
  await form.getByRole('slider', { name: '植物の高さ（cm・土際から）のスライダー', exact: true }).fill('275');
  await expect(form.locator('input[name="heightCm"]')).toHaveValue('275');
  await form.getByLabel('鉢径（cm）', { exact: true }).fill('25');
  await expect(form.getByRole('slider', { name: '鉢径（cm）のスライダー', exact: true })).toHaveValue('25');
  await form.getByLabel('鉢径（cm）', { exact: true }).fill('');
  const potSlider = form.getByRole('slider', { name: '鉢径（cm）のスライダー', exact: true });
  await potSlider.focus();
  await potSlider.press('Home');
  await expect(form.getByLabel('鉢径（cm）', { exact: true })).toHaveValue('1');
  await form.getByLabel('鉢径（cm）', { exact: true }).fill('');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await form.getByLabel('この植物を庭に配置できるようにする', { exact: true }).check();
  await form.locator('summary').getByText('詳細を調整', { exact: true }).click();
  const branch = form.getByRole('slider', { name: '枝の数のスライダー', exact: true });
  await branch.fill('23');
  await branch.focus();
  await branch.press('ArrowRight');
  await branch.press('ArrowRight');
  await expect(form.locator('input[name="modelBranchCount"]')).toHaveValue('24');
  await form.getByLabel('植物の幅（cm）', { exact: true }).fill('140');
  await form.getByLabel('幹の太さ（cm）', { exact: true }).fill('8.3');
  await expect(form.getByRole('slider', { name: '幹の太さ（cm）のスライダー', exact: true })).toHaveValue('8.3');
  await form.getByLabel('幹の太さ（cm）', { exact: true }).fill('');
  await expect(form.getByLabel('幹の太さ（cm）', { exact: true })).toHaveValue('');
  await form.getByLabel('幹の太さ（cm）', { exact: true }).fill('8.3');
  await form.getByRole('slider', { name: '葉の密度', exact: true }).fill('2');
  await form.locator('[name="modelHeight"]').fill('2000');
  await form.getByRole('button', { name: '植物のプレビューを確認', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('10〜1500');
  await form.locator('[name="modelHeight"]').fill('275');
  await form.getByRole('button', { name: '植物のプレビューを確認', exact: true }).click();
  await expect(form.getByTitle('植物の3Dプレビュー')).toBeVisible();
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
  await form.getByRole('button', { name: '出品する', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const product = await response.json();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await page.reload();
  await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
  await form
    .locator('.wizard-steps')
    .getByRole('button', { name: /庭オブジェクト/ })
    .click();
  await form.locator('summary').getByText('詳細を調整', { exact: true }).click();
  await expect(form.getByLabel('幹の太さ（cm）', { exact: true })).toHaveValue('8.3');
  await expect(form.getByRole('slider', { name: '葉の密度', exact: true })).toHaveValue('2');
  await expect(form.getByLabel('鉢径（cm）', { exact: true })).toHaveValue('');
  const products = await page.request.get('/api/products?storeId=1').then((r) => r.json());
  const stored = products.find((item) => item.id === product.id);
  expect(stored.heightCm).toBe(275);
  expect(stored.potDiameterCm).toBeNull();
  expect(stored.ageYears).toBeNull();
  expect(stored.minTemperatureC).toBeNull();
  expect(stored.careLevel).toBe(1);
  expect(stored.plantModelProfile).toMatchObject({
    heightCm: 275,
    branchCount: 24,
    trunkThicknessCm: 8.3,
    leafDensity: 'high',
  });
  await writeFile('artifacts/e2e/product-sliders-after-reload.json', JSON.stringify(stored, null, 2));
  await page.screenshot({ path: 'artifacts/e2e/product-sliders-after-reload.png', fullPage: true });
});
