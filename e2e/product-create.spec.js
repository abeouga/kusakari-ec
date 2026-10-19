import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('product creation uses a separate page with the shared header and seller sidebar', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('artifacts/e2e', { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/seller/products');
    await expect(page.getByTestId('manage-olive')).toBeVisible();
    await expect(page.locator('.product-form')).toHaveCount(0);
    const header = await page.locator('header').innerHTML();
    const sidebar = await page.locator('.workspace-sidebar').innerHTML();
    await page.getByRole('button', { name: '新しい商品', exact: true }).click();
    await expect(page).toHaveURL(/\/seller\/products\/new$/);
    await expect(page.getByRole('heading', { name: '商品追加', exact: true })).toBeVisible();
    await expect(page.locator('.product-form')).toBeVisible();
    await expect(page.locator('.product-form-content > fieldset > legend')).toHaveText([
      '基本情報',
      '価格・在庫',
      '植物の特徴',
      '育て方・植栽条件',
      '庭オブジェクト',
      '商品画像',
    ]);
    await expect(page.locator('.manager-list')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.locator('header').innerHTML()).toBe(header);
    expect(await page.locator('.workspace-sidebar').innerHTML()).toBe(sidebar);
    await page.reload();
    await expect(page.getByLabel('商品名', { exact: true })).toBeEditable();
    await expect(page.locator('.workspace-sidebar a.is-active')).toHaveText('商品一覧・登録');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/e2e/product-create-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '商品一覧へ戻る', exact: true }).click();
    await expect(page).toHaveURL(/\/seller\/products$/);
    await expect(page.locator('.product-form')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/seller\/products\/new$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/seller\/products$/);
  }
  await page.goto('/seller/products/new');
  await page.getByLabel('この植物を庭に配置できるようにする', { exact: true }).check();
  await expect(page.locator('input[name="heightCm"]')).toHaveCount(1);
  await expect(page.locator('.plant-model-group > legend')).toHaveText(['全体の形・大きさ', '幹・枝・茎', '葉', '花']);
  await page.getByLabel('植物の高さ（cm・土際から）', { exact: true }).fill('275');
  await page.getByLabel('植物の幅（cm）', { exact: true }).fill('130');
  await page.screenshot({ path: 'artifacts/e2e/product-create-model-groups.png', fullPage: true });
  await page.getByRole('button', { name: '植物のプレビューを確認', exact: true }).click();
  const previewUrl = await page.getByTitle('植物の3Dプレビュー', { exact: true }).getAttribute('src');
  const profile = JSON.parse(new URL(previewUrl).searchParams.get('profile'));
  expect(profile.heightCm).toBe(275);
  expect(profile.widthCm).toBe(130);
  await page.getByLabel('この植物を庭に配置できるようにする', { exact: true }).uncheck();
  await expect(page.locator('input[name="heightCm"]')).toHaveValue('275');
  await page.getByLabel('商品名', { exact: true }).fill('店舗選択後も保持する入力');
  await page.getByRole('combobox', { name: '在庫を登録する店舗', exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: '商品を保存', exact: true })).toBeEnabled();
  await expect(page.getByLabel('商品名', { exact: true })).toHaveValue('店舗選択後も保持する入力');
  const cart = await page.request.get('/api/cart').then((response) => response.json());
  expect(cart.storeId).toBe(2);
  await writeFile('artifacts/e2e/product-create-cart.json', JSON.stringify(cart, null, 2));
  await page.locator('.workspace-sidebar').getByRole('link', { name: '商品一覧・登録', exact: true }).click();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await expect(page.getByRole('combobox', { name: '在庫を編集する店舗', exact: true })).toHaveValue('2');
  expect(errors).toEqual([]);
});
