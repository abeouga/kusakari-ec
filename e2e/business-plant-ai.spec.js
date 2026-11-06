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
  // A new product needs at least one in stock (issue #72).
  await form.getByLabel('選択店舗の在庫', { exact: true }).fill('1');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('画像');
  await addImages(form);
  const main = await form.getByRole('img', { name: '商品画像1', exact: true }).getAttribute('src');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
  // Issue #48: no AI panel above the inputs; the AI button sits on the preview and always sends the main image.
  await form.locator('[name="modelHeight"]').fill('75');
  await expect(form.getByText('商品写真をAIに送る')).toHaveCount(0);
  await expect(form.getByText(/送信する写真/)).toHaveCount(0);
  await expect(form.getByText(/商品名・説明・写真から/)).toHaveCount(0);
  const surface = form.locator('.plant-preview-surface');
  const ai = surface.getByRole('button', { name: 'AIで生成', exact: true });
  await expect(ai).toBeVisible();
  await expect(ai).toContainText('AIで生成');
  if (!live) {
    // The main image registered on the 画像 step is read back from the real image API and sent as data.
    const withPhoto = page.waitForResponse((r) => r.url().endsWith(endpoint));
    await ai.click();
    const photo = await withPhoto;
    expect(photo.status()).toBe(503);
    const sent = photo.request().postDataJSON();
    expect(sent.imageUrl).toBeNull();
    expect(sent.imageDataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    const original = await page.request.get(`${ec}${main}`).then((r) => r.body());
    expect(Buffer.from(sent.imageDataUrl.split(',')[1], 'base64').equals(original)).toBe(true);
    expect(sent.heightCm).toBe(75);
    await expect(form.getByRole('alert')).toContainText('APIキーが未設定');
  }
  // Explicit failure injection only; no successful API response is mocked. The request is held for a moment
  // before the connection is cut, so the in-progress state of the preview can be checked.
  let release = () => {};
  const held = new Promise((resolve) => (release = resolve));
  await page.route(`**${endpoint}`, async (route) => {
    await held;
    await route.abort('failed');
  });
  await ai.click();
  await expect(surface.getByRole('status')).toContainText('AIが特徴を推定しています');
  await expect(ai).toBeDisabled();
  await expect(ai).toContainText('推定中');
  await page.screenshot({ path: `${dir}/plant-ai-busy-1440.png` });
  release();
  await expect(form.getByRole('alert')).toContainText('接続');
  await expect(ai).toBeEnabled();
  await expect(form.getByLabel('商品名', { exact: true })).toHaveValue(input.name);
  await expect(form.locator('[name="modelHeight"]')).toHaveValue('75');
  await expect(form.getByRole('group', { name: 'サイズ', exact: true })).toBeVisible();
  await expect(form.getByRole('button', { name: '次へ', exact: true })).toBeEnabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(form.locator('[name="modelHeight"]')).toHaveValue('75');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The button stays inside the lower right corner of the preview at every width.
    const area = await surface.boundingBox();
    const button = await ai.boundingBox();
    expect(button.x).toBeGreaterThanOrEqual(area.x);
    expect(button.y).toBeGreaterThanOrEqual(area.y);
    expect(button.x + button.width).toBeLessThanOrEqual(area.x + area.width);
    expect(button.y + button.height).toBeLessThanOrEqual(area.y + area.height);
    expect(button.x + button.width / 2).toBeGreaterThan(area.x + area.width / 2);
    expect(button.y + button.height / 2).toBeGreaterThan(area.y + area.height / 2);
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
  // A new product needs at least one in stock (issue #72).
  await form.getByLabel('選択店舗の在庫', { exact: true }).fill('1');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await addImages(form);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
  const run = async () => {
    const pending = page.waitForResponse((r) => r.url().endsWith(endpoint), { timeout: 120000 });
    await form.getByRole('button', { name: 'AIで生成', exact: true }).click();
    const response = await pending;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    return { body, sent: response.request().postDataJSON() };
  };
  const { body: first, sent } = await run();
  expect(sent.imageDataUrl).toMatch(/^data:image\/png;base64,/);
  await expect(form.locator('.ai-estimate:visible')).toContainText('AI推定・実寸未確認');
  await expect(form.getByTitle('植物の3Dプレビュー')).toBeVisible();
  await expect(page.frameLocator('iframe[title="植物の3Dプレビュー"]').getByTestId('preview-loaded')).toHaveText(
    'loaded',
    { timeout: 30000 },
  );
  await form.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/wizard-ai-preview.png` });
  await form.getByRole('button', { name: 'AI設定を元に戻す', exact: true }).click();
  await expect(form.getByLabel('植物の高さ', { exact: true })).toHaveValue('');
  // #50: the measured height is entered on the same step.
  await form.getByLabel('植物の高さ', { exact: true }).fill('75');
  const { body: second, sent: secondSent } = await run();
  expect(secondSent.imageDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(second.profile.heightCm).toBe(75);
  expect(second.profile.seed).toBe(12345);
  await expect(form.locator('.ai-estimate:visible')).toHaveCount(0);
  const editedWidth = Math.min(1000, second.profile.widthCm + 10);
  await form.getByLabel('植物の幅', { exact: true }).fill(String(editedWidth));
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
  await expect(form.getByLabel('植物の幅', { exact: true })).toHaveValue(String(editedWidth));
  const products = await (await call(page.request, '/products?storeId=1')).json();
  const stored = products.find((item) => item.id === product.id);
  expect(stored.plantModelProfile).toMatchObject({ ...second.profile, widthCm: editedWidth });
  await writeFile(
    `${dir}/plant-ai-after-reload.json`,
    JSON.stringify({ first, second, stored: { id: stored.id, plantModelProfile: stored.plantModelProfile } }, null, 2),
  );
  await page.screenshot({ path: `${dir}/plant-ai-after-reload.png`, fullPage: true });
});
