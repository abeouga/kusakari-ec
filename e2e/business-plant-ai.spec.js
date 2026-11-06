import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

// Moved from the product-input configuration: the seller signs in through Cognito first. The main image is
// registered on the 画像 step and the AI estimate on the 庭オブジェクト step uses it (issue #46).
const live = !!process.env.KUSAKARI_EC_E2E_OPENAI_API_KEY;
const endpoint = '/api/products/plant-model-suggestions';
const dir = 'artifacts/business/plant-ai';
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

/** Category, chosen in the dialog with the keyboard. */
async function chooseCategory(page, form, category) {
  await form.getByRole('button', { name: 'カテゴリーを選ぶ', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'カテゴリーを選ぶ', exact: true });
  await dialog.getByLabel('カテゴリー名で絞り込み').fill(category);
  await dialog
    .getByRole('list', { name: 'カテゴリー一覧' })
    .getByRole('button', { name: category, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}

test('plant AI validates input and preserves form on missing credentials or disconnected API', async ({ page }) => {
  test.setTimeout(180000);
  await mkdir(dir, { recursive: true });
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  for (const invalid of [
    { ...input, heightCm: 3 },
    { ...input, extra: true },
    { ...input, imageUrl: 'http://localhost/private' },
    { ...input, imageDataUrl: 'data:image/png;base64,AAAA' },
  ])
    expect((await call(page.request, '/products/plant-model-suggestions', 'POST', invalid)).status()).toBe(400);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ec}/seller/products/new`);
  const form = page.locator('.product-form');
  await form.getByLabel('商品名', { exact: true }).fill(input.name);
  await form.getByLabel('商品説明', { exact: true }).fill(input.description);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('画像');
  await addImages(form);
  const main = await form.getByRole('img', { name: '商品画像1', exact: true }).getAttribute('src');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
  await form.getByRole('button', { name: '手動で設定', exact: true }).click();
  await form.locator('[name="modelHeight"]').fill('75');
  await expect(form.getByLabel('商品写真をAIに送る', { exact: true })).toBeChecked();
  await expect(form.getByText('送信する写真：商品のメイン画像')).toBeVisible();
  if (!live) {
    // The main image registered on the 画像 step is read back from the real image API and sent as data.
    const withPhoto = page.waitForResponse((r) => r.url().endsWith(endpoint));
    await form.getByRole('button', { name: 'AIで特徴を設定', exact: true }).click();
    const photo = await withPhoto;
    expect(photo.status()).toBe(503);
    const sent = photo.request().postDataJSON();
    expect(sent.imageUrl).toBeNull();
    expect(sent.imageDataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    const original = await page.request.get(`${ec}${main}`).then((r) => r.body());
    expect(Buffer.from(sent.imageDataUrl.split(',')[1], 'base64').equals(original)).toBe(true);
    expect(sent.heightCm).toBe(75);
    await expect(form.getByRole('alert')).toContainText('APIキーが未設定');

    await form.getByLabel('商品写真をAIに送る', { exact: true }).uncheck();
    const pending = page.waitForResponse((r) => r.url().endsWith(endpoint));
    await form.getByRole('button', { name: 'AIで特徴を設定', exact: true }).click();
    const result = await pending;
    expect(result.status()).toBe(503);
    expect(result.request().postDataJSON().imageDataUrl).toBeNull();
    expect(result.request().postDataJSON().imageUrl).toBeNull();
    await expect(form.getByRole('alert')).toContainText('APIキーが未設定');
  } else await form.getByLabel('商品写真をAIに送る', { exact: true }).uncheck();
  // Explicit failure injection only; no successful API response is mocked.
  await page.route(`**${endpoint}`, (route) => route.abort('failed'));
  await form.getByRole('button', { name: 'AIで特徴を設定', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('接続');
  await expect(form.getByLabel('商品名', { exact: true })).toHaveValue(input.name);
  await expect(form.locator('[name="modelHeight"]')).toHaveValue('75');
  await expect(form.getByLabel('この植物を庭に配置できるようにする', { exact: true })).toBeChecked();
  await expect(form.getByRole('button', { name: '次へ', exact: true })).toBeEnabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(form.locator('[name="modelHeight"]')).toHaveValue('75');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The sticky step footer covers part of a full-page capture, so the alert is centred in the viewport.
    await form.getByRole('alert').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({ path: `${dir}/plant-ai-failure-preserved-${width}.png` });
  }
  await page.unroute(`**${endpoint}`);
});

test('plant AI real Luna infers photo features, supports undo and persists a verified-height model', async ({
  page,
}) => {
  test.skip(!live, 'Set KUSAKARI_EC_E2E_OPENAI_API_KEY to opt into two paid Luna requests.');
  test.setTimeout(300000);
  await mkdir(dir, { recursive: true });
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ec}/seller/products/new`);
  const form = page.locator('.product-form');
  await form.getByLabel('商品名', { exact: true }).fill('モンステラ');
  await chooseCategory(page, form, '観葉植物');
  await form.getByLabel('商品説明', { exact: true }).fill('モンステラ。緑の切れ込み葉がある鉢植えです。');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await addImages(form);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
  const run = async () => {
    const pending = page.waitForResponse((r) => r.url().endsWith(endpoint), { timeout: 120000 });
    await form.getByRole('button', { name: 'AIで特徴を設定', exact: true }).click();
    const response = await pending;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    return { body, sent: response.request().postDataJSON() };
  };
  const { body: first, sent } = await run();
  expect(sent.imageDataUrl).toMatch(/^data:image\/png;base64,/);
  await expect(form.locator('.ai-estimate:visible')).toContainText('AI推定・実寸未確認');
  await expect(form.getByLabel('この植物を庭に配置できるようにする', { exact: true })).toBeChecked();
  await expect(form.getByTitle('植物の3Dプレビュー')).toBeVisible();
  await expect(page.frameLocator('iframe[title="植物の3Dプレビュー"]').getByTestId('preview-loaded')).toHaveText(
    'loaded',
    { timeout: 30000 },
  );
  await form.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/wizard-ai-preview.png` });
  await form.getByRole('button', { name: 'AI設定を元に戻す', exact: true }).click();
  await expect(form.getByLabel('植物の高さ（cm・土際から）', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('この植物を庭に配置できるようにする', { exact: true })).not.toBeChecked();
  // #50: the measured height is entered on the same step.
  await form.getByLabel('植物の高さ（cm・土際から）', { exact: true }).fill('75');
  await form.getByLabel('商品写真をAIに送る', { exact: true }).uncheck();
  const { body: second } = await run();
  expect(second.profile.heightCm).toBe(75);
  expect(second.profile.seed).toBe(12345);
  await expect(form.locator('.ai-estimate:visible')).toHaveCount(0);
  const editedWidth = Math.min(1000, second.profile.widthCm + 10);
  await form.getByLabel('植物の幅（cm）', { exact: true }).fill(String(editedWidth));
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
  await form.getByRole('button', { name: '出品する', exact: true }).click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  const product = await response.json();
  expect(product.heightCm).toBe(75);
  await expect(page).toHaveURL(`${ec}/seller/products`);
  await page.reload();
  await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
  await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
  await form
    .getByRole('navigation', { name: '商品編集のタブ', exact: true })
    .getByRole('button', { name: /庭オブジェクト/ })
    .click();
  await expect(form.getByLabel('植物の幅（cm）', { exact: true })).toHaveValue(String(editedWidth));
  const products = await (await call(page.request, '/products?storeId=1')).json();
  const stored = products.find((item) => item.id === product.id);
  expect(stored.plantModelProfile).toMatchObject({ ...second.profile, widthCm: editedWidth });
  await writeFile(
    `${dir}/plant-ai-after-reload.json`,
    JSON.stringify({ first, second, stored: { id: stored.id, plantModelProfile: stored.plantModelProfile } }, null, 2),
  );
  await page.screenshot({ path: `${dir}/plant-ai-after-reload.png`, fullPage: true });
});
