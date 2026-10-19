import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const live = !!process.env.KUSAKARI_EC_E2E_OPENAI_API_KEY;
const endpoint = '/api/products/plant-model-suggestions';
const input = {
  name: 'モンステラ',
  latinName: '',
  category: '観葉植物',
  description: '切れ込みのある大きな緑の葉',
  heightCm: null,
  currentProfile: null,
  imageUrl: null,
  imageDataUrl: null,
};

test('plant AI validates input and preserves form on missing credentials or disconnected API', async ({ page }) => {
  await mkdir('artifacts/e2e', { recursive: true });
  for (const invalid of [
    { ...input, heightCm: 3 },
    { ...input, extra: true },
    { ...input, imageUrl: 'http://localhost/private' },
    { ...input, imageDataUrl: 'data:image/png;base64,AAAA' },
  ])
    expect((await page.request.post(endpoint, { data: invalid })).status()).toBe(400);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/seller/products/new');
  const form = page.locator('.product-form');
  await addImages(form);
  await form.getByLabel('商品名', { exact: true }).fill(input.name);
  await form.getByLabel('商品番号', { exact: true }).fill('FAILURE-CHECK');
  await form.getByLabel('商品説明', { exact: true }).fill(input.description);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await form.getByRole('button', { name: '手動で設定', exact: true }).click();
  await form.locator('[name="modelHeight"]').fill('75');
  await form.getByLabel('商品写真をAIに送る', { exact: true }).uncheck();
  if (!live) {
    const pending = page.waitForResponse((r) => r.url().endsWith(endpoint));
    await form.getByRole('button', { name: 'AIで特徴を設定', exact: true }).click();
    const result = await pending;
    expect(result.status()).toBe(503);
    expect(result.request().postDataJSON().imageDataUrl).toBeNull();
    expect(result.request().postDataJSON().imageUrl).toBeNull();
    await expect(form.getByRole('alert')).toContainText('APIキーが未設定');
  }
  // Explicit failure injection only; no successful API response is mocked.
  await page.route(`**${endpoint}`, (route) => route.abort('failed'));
  await form.getByRole('button', { name: 'AIで特徴を設定', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('接続');
  await expect(form.getByLabel('商品名', { exact: true })).toHaveValue(input.name);
  await expect(form.locator('[name="modelHeight"]')).toHaveValue('75');
  await expect(form.getByLabel('この植物を庭に配置できるようにする', { exact: true })).toBeChecked();
  await expect(form.getByRole('button', { name: '次へ', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/e2e/plant-ai-failure-preserved.png', fullPage: true });
});

test('plant AI real Luna infers photo features, supports undo and persists a verified-height model', async ({
  page,
}) => {
  test.skip(!live, 'Set KUSAKARI_EC_E2E_OPENAI_API_KEY to opt into two paid Luna requests.');
  test.setTimeout(240000);
  await mkdir('artifacts/e2e', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/seller/products/new');
  const form = page.locator('.product-form');
  await form.getByLabel('商品名', { exact: true }).fill('モンステラ');
  await form.getByRole('combobox', { name: 'カテゴリー', exact: true }).selectOption('観葉植物');
  await form.getByLabel('商品説明', { exact: true }).fill('モンステラ。緑の切れ込み葉がある鉢植えです。');
  await form.getByLabel('商品番号', { exact: true }).fill(`AI-${randomUUID().slice(0, 8)}`);
  await addImages(form);
  const run = async () => {
    const pending = page.waitForResponse((r) => r.url().endsWith(endpoint), { timeout: 120000 });
    await form.getByRole('button', { name: 'AIで特徴を設定', exact: true }).click();
    const response = await pending;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    return body;
  };
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  const first = await run();
  await expect(form.locator('.ai-estimate:visible')).toContainText('AI推定・実寸未確認');
  await expect(form.getByLabel('この植物を庭に配置できるようにする', { exact: true })).toBeChecked();
  await expect(form.getByTitle('植物の3Dプレビュー')).toBeVisible();
  await expect(page.frameLocator('iframe[title="植物の3Dプレビュー"]').getByTestId('preview-loaded')).toHaveText(
    'loaded',
    { timeout: 30000 },
  );
  await form.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/e2e/wizard-ai-preview.png' });
  await form.getByRole('button', { name: 'AI設定を元に戻す', exact: true }).click();
  await expect(form.getByLabel('植物の高さ（cm・土際から）', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('この植物を庭に配置できるようにする', { exact: true })).not.toBeChecked();
  await form.getByRole('button', { name: '戻る', exact: true }).click();
  await form.locator('summary').getByText('サイズ', { exact: true }).click();
  await form.getByLabel('植物の高さ（cm・土際から）', { exact: true }).fill('75');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await form.getByLabel('商品写真をAIに送る', { exact: true }).uncheck();
  const second = await run();
  expect(second.profile.heightCm).toBe(75);
  expect(second.profile.seed).toBe(12345);
  await expect(form.locator('.ai-estimate:visible')).toHaveCount(0);
  const editedWidth = Math.min(1000, second.profile.widthCm + 10);
  await form.getByLabel('植物の幅（cm）', { exact: true }).fill(String(editedWidth));
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
  await expect(form.getByLabel('植物の幅（cm）', { exact: true })).toHaveValue(String(editedWidth));
  const products = await page.request.get('/api/products?storeId=1').then((r) => r.json());
  const stored = products.find((item) => item.id === product.id);
  expect(stored.plantModelProfile).toMatchObject({ ...second.profile, widthCm: editedWidth });
  await writeFile('artifacts/e2e/plant-ai-after-reload.json', JSON.stringify({ first, second, stored }, null, 2));
  await page.screenshot({ path: 'artifacts/e2e/plant-ai-after-reload.png', fullPage: true });
});
