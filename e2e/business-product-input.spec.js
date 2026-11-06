import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

// Moved from the product-input configuration so the seller signs in through Cognito first.
// Issue #50: the plant height is entered only on the garden-object step (10–1500 cm).
test('product sliders preserve optional values, keyboard precision and persisted plant settings', async ({ page }) => {
  test.setTimeout(240000);
  const dir = 'artifacts/business/product-input';
  await mkdir(dir, { recursive: true });
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  await page.goto(`${ec}/seller/products/new`);
  const form = page.locator('.product-form');
  for (const name of ['ageYears', 'modelHeight', 'potDiameterCm'])
    await expect(form.locator(`input[name="${name}"]`)).toHaveValue('');
  await expect(form.locator('input[name="heightCm"]')).toHaveCount(0);
  await form.getByLabel('商品名', { exact: true }).fill('スライダー検証用植物');
  await form.getByLabel('商品説明', { exact: true }).fill('専用DBで数値入力の保存を確認します。');
  await form.getByLabel('選択店舗の在庫', { exact: true }).fill('3');
  await form.locator('summary').getByText('サイズ', { exact: true }).click();
  const info = form.getByRole('region', { name: '商品情報', exact: true });
  await expect(info.getByLabel('植物の高さ', { exact: true })).toHaveCount(0);
  await form.getByLabel('鉢径（cm）', { exact: true }).fill('25');
  await expect(form.getByRole('slider', { name: '鉢径（cm）のスライダー', exact: true })).toHaveValue('25');
  await form.getByLabel('鉢径（cm）', { exact: true }).fill('');
  const potSlider = form.getByRole('slider', { name: '鉢径（cm）のスライダー', exact: true });
  await potSlider.focus();
  await potSlider.press('Home');
  await expect(form.getByLabel('鉢径（cm）', { exact: true })).toHaveValue('1');
  await form.getByLabel('鉢径（cm）', { exact: true }).fill('');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await addImages(form);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  // Issues #49 and #52: the grouped feature inputs are shown at once, without a checkbox or a folded section.
  await form.getByRole('slider', { name: '植物の高さのスライダー', exact: true }).fill('275');
  await expect(form.locator('input[name="modelHeight"]')).toHaveValue('275');
  const branch = form.getByRole('slider', { name: '枝の数のスライダー', exact: true });
  await branch.fill('23');
  await branch.focus();
  await branch.press('ArrowRight');
  await branch.press('ArrowRight');
  await expect(form.locator('input[name="modelBranchCount"]')).toHaveValue('24');
  await form.getByLabel('植物の幅', { exact: true }).fill('140');
  await form.getByLabel('幹の太さ', { exact: true }).fill('8.3');
  await expect(form.getByRole('slider', { name: '幹の太さのスライダー', exact: true })).toHaveValue('8.3');
  await form.getByLabel('幹の太さ', { exact: true }).fill('');
  await expect(form.getByLabel('幹の太さ', { exact: true })).toHaveValue('');
  await form.getByLabel('幹の太さ', { exact: true }).fill('8.3');
  // Five density steps since plant assembly v5: index 3 is 'high'.
  await form.getByRole('slider', { name: '葉の密度', exact: true }).fill('3');
  // Issue #51: the preview follows the inputs; an out-of-range value keeps the previous preview.
  const preview = form.locator('iframe[title="植物の3Dプレビュー"]');
  await expect(preview).toHaveAttribute('src', /%22leafDensity%22%3A%22high%22/);
  const before = await preview.getAttribute('src');
  await form.locator('[name="modelHeight"]').fill('2000');
  await expect(form.getByText('10〜1500cmの範囲で入力してください。', { exact: true })).toBeVisible();
  await expect(form.getByText('入力を直すと更新します', { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(preview).toHaveAttribute('src', before);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('10〜1500');
  await form.locator('[name="modelHeight"]').fill('275');
  await expect(form.getByText('入力を直すと更新します', { exact: true })).toHaveCount(0);
  await expect(preview).toHaveAttribute('src', /%22heightCm%22%3A275/);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(
    form.getByRole('region', { name: '出品内容の確認' }).getByTitle('出品する植物の3Dプレビュー', { exact: true }),
  ).toHaveAttribute('src', /%22heightCm%22%3A275/);
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
  await form.getByRole('button', { name: '出品する', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const product = await response.json();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await page.reload();
  await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
  await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
  await form
    .locator('.wizard-steps')
    .getByRole('button', { name: /庭オブジェクト/ })
    .click();
  await expect(form.locator('input[name="modelHeight"]')).toHaveValue('275');
  await expect(form.getByLabel('幹の太さ', { exact: true })).toHaveValue('8.3');
  await expect(form.getByRole('slider', { name: '葉の密度', exact: true })).toHaveValue('3');
  await expect(form.getByLabel('鉢径（cm）', { exact: true })).toHaveValue('');
  const products = await call(page.request, '/products?storeId=1').then((r) => r.json());
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
  await writeFile(`${dir}/product-sliders-after-reload.json`, JSON.stringify(stored, null, 2));
  await page.screenshot({ path: `${dir}/product-sliders-after-reload.png`, fullPage: true });
});
