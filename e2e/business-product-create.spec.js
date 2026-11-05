import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

// Moved from the product-input configuration: since Cognito became mandatory (2026-10-20) the seller page
// needs a signed-in seller, which the business configuration provides. Steps follow issues #45, #46 and #50.
test('product wizard navigation, validation, responsive screenshots and edit tabs persist through MySQL', async ({
  page,
}) => {
  test.setTimeout(300000);
  const dir = 'artifacts/business/product-create';
  await mkdir(dir, { recursive: true });
  const errors = [];
  let writes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/products') && r.method() === 'POST') writes++;
  });
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const beforeWrites = writes;
    await page.goto(`${ec}/seller/products/new`);
    const form = page.locator('.product-form');
    await expect(form.getByRole('button', { name: '次へ', exact: true })).toBeEnabled();
    await expect(form.locator('.wizard-steps li')).toHaveCount(4);
    await expect(form.locator('.wizard-steps button')).toHaveCount(0);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.locator('[name="name"]')).toBeFocused();
    await form.getByLabel('商品名', { exact: true }).fill('ウィザード検証用モンステラ');
    await form.getByLabel('商品説明', { exact: true }).fill('専用DBへの出品手順を確認します。');
    await form.getByLabel('税込価格（円）', { exact: true }).fill('3800');
    await form.getByLabel('選択店舗の在庫', { exact: true }).fill('5');
    await expect(form.locator('.product-options[open]')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/wizard-info-${width}.png` });
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
    await expect(form.locator('.wizard-heading')).toHaveText('画像');
    await addImages(form);
    await page.screenshot({ path: `${dir}/wizard-images-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
    // Issues #49 and #51: the inputs are shown at once and the preview follows the height without a button.
    await form.locator('[name="modelHeight"]').fill('275');
    await expect(page.frameLocator('iframe[title="植物の3Dプレビュー"]').getByTestId('preview-loaded')).toHaveText(
      'loaded',
      { timeout: 30000 },
    );
    await page.screenshot({ path: `${dir}/wizard-model-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.getByRole('region', { name: '出品内容の確認' })).toContainText('設定あり（幅 140 cm）');
    await form.getByRole('button', { name: '商品情報を修正', exact: true }).click();
    await expect(form.getByLabel('鉢径（cm）', { exact: true })).toHaveValue('24');
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    // Issue #50: the height entered on the garden-object step is the only height input.
    await expect(form.locator('[name="modelHeight"]')).toHaveValue('275');
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await page.screenshot({ path: `${dir}/wizard-review-${width}.png` });
    expect(writes).toBe(beforeWrites);
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await form.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const product = await response.json();
    // Issue #49: a listed plant is saved as a product that can be placed in the garden.
    expect(product.plantModelProfile).toMatchObject({ heightCm: 275, widthCm: 140 });
    await expect(page).toHaveURL(/\/seller\/products$/);
    await page.reload();
    await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
    const card = page.getByTestId(`manage-${product.id}`);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${dir}/wizard-listed-${width}.png` });
    await card.getByRole('button', { name: '編集', exact: true }).click();
    await expect(page.locator('.manager-list')).toHaveCount(0);
    await expect(form.locator('.wizard-steps button')).toHaveCount(3);
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
    const products = await call(page.request, '/products?storeId=1').then((r) => r.json());
    const stored = products.find((p) => p.id === product.id);
    expect(stored.priceYen).toBe(3900);
    expect(stored.heightCm).toBe(275);
    expect(stored.potDiameterCm).toBe(24);
    await writeFile(`${dir}/wizard-persisted-${width}.json`, JSON.stringify(stored, null, 2));
  }
  expect(errors).toEqual([]);
});
