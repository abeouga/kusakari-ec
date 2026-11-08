import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput } from './business-helpers.js';
import { addImages } from './product-images.js';

test.use({ trace: 'off' });

const dir = 'artifacts/business/plant-step';
const preview = (page) => page.frameLocator('iframe[title="植物の3Dプレビュー"]').getByTestId('preview-loaded');
/**
 * The seller looks at the preview, then it has drawn the model. Below 700px the preview is not sticky, and Chromium
 * does not draw a cross-origin frame that is scrolled out of view, so the preview is brought into view first.
 */
async function expectPreviewDrawn(page) {
  await page.locator('.plant-preview-surface').scrollIntoViewIfNeeded();
  await expect(preview(page)).toHaveText('loaded', { timeout: 30000 });
}
/** URL-encoded `"key":value` inside the Canvas preview URL. */
const param = (key, value) => new RegExp(encodeURIComponent(`"${key}":${JSON.stringify(value)}`));

/** Full-length capture with the viewport stretched to the document (the footer is sticky). */
async function snap(page, path) {
  const { width, height } = page.viewportSize();
  // The pointer left on the last clicked button would capture its hover colour instead of the resting screen.
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.screenshot({ path });
  await page.setViewportSize({ width, height });
}

async function openGardenTab(page, sku) {
  await page.goto(`${ec}/seller/products`);
  await page.reload();
  await page.getByPlaceholder('商品名・商品番号').fill(sku);
  await page.locator('[data-testid^="manage-"]').getByRole('button', { name: '編集', exact: true }).first().click();
  const form = page.locator('.product-form');
  await form
    .getByRole('navigation', { name: '商品編集のタブ', exact: true })
    .getByRole('button', { name: /庭オブジェクト/ })
    .click();
  return form;
}

// Issues #48, #49, #51, #52: overlay AI button, required garden object, automatic preview and grouped inputs.
test('garden step previews automatically, guides required input and saves grouped features', async ({ page }) => {
  test.setTimeout(420000);
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const loads = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'document' && r.url().includes('/model-preview')) loads.push(r.url());
  });
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const saved = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${ec}/seller/products/new`);
    const form = page.locator('.product-form');
    await form.getByLabel('商品名', { exact: true }).fill(`庭オブジェクト確認 ${width}px ${Date.now()}`);
    await form.getByLabel('商品説明', { exact: true }).fill('庭オブジェクトの自動プレビューを確認します。');
    // A new product needs at least one in stock (issue #72).
    await form.getByLabel('選択店舗の在庫', { exact: true }).fill('1');
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await addImages(form);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    const garden = form.getByRole('region', { name: '庭オブジェクト', exact: true });
    await expect(garden.getByRole('group', { name: 'サイズ', exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: '植物のプレビューを確認', exact: true })).toHaveCount(0);
    await expect(form.getByText(/プレビューを確認してください/)).toHaveCount(0);
    await expect(form.getByRole('button', { name: '設定せず次へ', exact: true })).toHaveCount(0);
    await expect(garden.locator('.plant-preview-surface').getByRole('button', { name: 'AIで生成' })).toBeVisible();

    // #49: 「次へ」 with the required height empty shows the error and moves to the input.
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveText('植物の高さを入力してください。');
    await expect(garden.getByLabel('植物の高さ', { exact: true })).toBeFocused();
    await snap(page, `${dir}/garden-required-${width}.png`);

    // #51: the preview follows the height without a button.
    const before = loads.length;
    await garden.getByLabel('植物の高さ', { exact: true }).fill('180');
    await expectPreviewDrawn(page);
    expect(loads.length).toBe(before + 1);

    // Moving a slider step by step reloads the preview once, after the input settles.
    const branch = garden.getByRole('slider', { name: '枝の数のスライダー', exact: true });
    await branch.focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(120);
    }
    await expect(garden.locator('input[name="modelBranchCount"]')).toHaveValue('20');
    const frame = form.locator('iframe[title="植物の3Dプレビュー"]');
    await expect(frame).toHaveAttribute('src', param('branchCount', 20));
    await page.waitForTimeout(800);
    expect(loads.length).toBe(before + 2);
    expect(loads.at(-1)).toMatch(param('branchCount', 20));

    // An invalid value keeps the previous preview and shows the error at the input.
    const width5000 = loads.length;
    await garden.getByLabel('植物の幅', { exact: true }).fill('5000');
    await expect(garden.getByText('10〜1000cmの範囲で入力してください。', { exact: true })).toBeVisible();
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(loads.length).toBe(width5000);
    await expect(frame).toHaveAttribute('src', param('widthCm', 140));
    await snap(page, `${dir}/garden-invalid-${width}.png`);
    await garden.getByLabel('植物の幅', { exact: true }).fill('160');
    await expect(frame).toHaveAttribute('src', param('widthCm', 160));
    // A value off the 0.1 cm step also names its field.
    await garden.getByLabel('幹の太さ', { exact: true }).fill('8.25');
    await expect(garden.getByText('0.1cm単位で入力してください。', { exact: true })).toBeVisible();
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toBeVisible();
    await garden.getByLabel('幹の太さ', { exact: true }).fill('8');
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toHaveCount(0);

    // #52: automatic / manual switch, and named flower swatches.
    const stem = garden.getByRole('group', { name: '枝・茎', exact: true });
    await stem.locator('summary').click();
    const curve = stem.getByRole('radiogroup', { name: '幹・茎の曲がりの設定方法', exact: true });
    await expect(curve.getByRole('radio', { name: '自動', exact: true })).toBeChecked();
    await curve.getByRole('radio', { name: '手動', exact: true }).check();
    await expect(stem.getByLabel('幹・茎の曲がり', { exact: true })).toHaveValue('30');
    await stem.getByLabel('幹・茎の曲がり', { exact: true }).fill('45');
    // A percent with decimals stays as typed with its message instead of being rounded behind the seller's back.
    await stem.getByLabel('幹・茎の曲がり', { exact: true }).fill('45.5');
    await expect(stem.getByText('整数で入力してください。', { exact: true })).toBeVisible();
    await expect(stem.getByLabel('幹・茎の曲がり', { exact: true })).toHaveValue('45.5');
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toBeVisible();
    await stem.getByLabel('幹・茎の曲がり', { exact: true }).fill('45');
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toHaveCount(0);
    const flower = garden.getByRole('group', { name: '花', exact: true });
    const flowerSwitch = flower.getByRole('switch', { name: '花を付ける' });
    await flowerSwitch.check();
    // An empty required input in a group that is then hidden no longer holds the preview.
    await flower.getByLabel('花の大きさ', { exact: true }).fill('');
    await expect(flower.getByText('入力してください。', { exact: true })).toBeVisible();
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toBeVisible();
    await flowerSwitch.uncheck();
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toHaveCount(0);
    await flowerSwitch.check();
    await expect(garden.getByText('入力を直すと更新します', { exact: true })).toBeVisible();
    await flower.getByLabel('花の大きさ', { exact: true }).fill('12');
    // Every swatch shows its colour name (390px touch screens cannot hover).
    await expect(flower.locator('.flower-swatch-name')).toHaveText([
      'ピンク',
      '赤',
      'オレンジ',
      '黄',
      '白',
      '薄紫',
      '紫',
      '青紫',
      'その他',
    ]);
    await flower.getByRole('radio', { name: '紫', exact: true }).check();
    await expect(flower.getByRole('group', { name: /花の色/ })).toContainText('紫');
    await expect(frame).toHaveAttribute('src', param('flowerColor', '#8e6fc1'));
    await expectPreviewDrawn(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await snap(page, `${dir}/garden-${width}.png`);

    await form.getByRole('button', { name: '次へ', exact: true }).click();
    // #53: the review shows the garden object as its 3D preview instead of its sizes.
    await expect(
      form.getByRole('region', { name: '出品内容の確認' }).getByTitle('出品する植物の3Dプレビュー', { exact: true }),
    ).toHaveAttribute('src', param('widthCm', 160));
    const posted = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await form.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(200);
    const product = await response.json();
    const expected = {
      heightCm: 180,
      widthCm: 160,
      branchCount: 20,
      stemCurve: 0.45,
      trunkThicknessCm: 8,
      flowerEnabled: true,
      flowerSizeCm: 12,
      flowerColor: '#8e6fc1',
    };
    expect(product.plantModelProfile).toMatchObject(expected);
    saved.push(product);

    // The edit form shows the saved values as they are.
    const edit = await openGardenTab(page, product.sku);
    await expect(edit.getByLabel('植物の高さ', { exact: true })).toHaveValue('180');
    await expect(edit.getByLabel('植物の幅', { exact: true })).toHaveValue('160');
    await expect(edit.locator('input[name="modelBranchCount"]')).toHaveValue('20');
    await expect(edit.getByRole('radio', { name: '紫', exact: true })).toBeChecked();
    const editStem = edit.getByRole('group', { name: '枝・茎', exact: true });
    await expect(editStem.locator('summary')).toContainText('手動 1項目');
    await editStem.locator('summary').click();
    await expect(editStem.getByLabel('幹・茎の曲がり', { exact: true })).toHaveValue('45');
    await expectPreviewDrawn(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await snap(page, `${dir}/edit-after-reload-${width}.png`);
  }
  const products = await (await call(page.request, '/products?storeId=1')).json();
  const stored = saved.map((product) => products.find((item) => item.id === product.id));
  await writeFile(
    `${dir}/products.json`,
    JSON.stringify(
      stored.map(({ id, sku, category, heightCm, plantModelProfile }) => ({
        id,
        sku,
        category,
        heightCm,
        plantModelProfile,
      })),
      null,
      2,
    ),
  );
  for (const item of stored) expect(item.plantModelProfile).toMatchObject({ widthCm: 160, flowerColor: '#8e6fc1' });
  expect(errors).toEqual([]);
});

// #49 / #52: editing never rewrites saved garden data, including colours outside the swatches and products
// saved without a garden object.
test('editing keeps every saved plant value and products without a garden object', async ({ page }) => {
  test.setTimeout(300000);
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const base = productInput();
  const profile = {
    ...base.plantModelProfile,
    plantType: 'shrub',
    leafColor: '#335522',
    leafDensity: 'dense',
    flowerEnabled: true,
    flowerShape: 'cluster',
    flowerColor: '#123abc',
    stemCount: 4,
    stemCurve: 0.25,
    twigLength: 1.2,
    leafArrangement: 'opposite',
  };
  const created = await call(page.request, '/products', 'POST', { ...base, plantModelProfile: profile });
  expect(created.status(), await created.text()).toBe(200);
  const product = await created.json();
  const legacyInput = productInput();
  const legacyCreated = await call(page.request, '/products', 'POST', { ...legacyInput, plantModelProfile: null });
  expect(legacyCreated.status(), await legacyCreated.text()).toBe(200);
  const legacy = await legacyCreated.json();
  const read = async (id) => (await (await call(page.request, '/products?storeId=1')).json()).find((p) => p.id === id);
  const original = (await read(product.id)).plantModelProfile;

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const form = await openGardenTab(page, product.sku);
    await expect(form.getByLabel('植物の高さ', { exact: true })).toHaveValue('250');
    await expect(form.locator('select[name="modelPlantType"]')).toHaveValue('shrub');
    await expect(form.getByRole('switch', { name: '花を付ける' })).toBeChecked();
    await expect(form.locator('select[name="modelFlowerShape"]')).toHaveValue('cluster');
    await expect(form.getByRole('group', { name: /花の色/ })).toContainText('その他（#123abc）');
    await expect(form.getByRole('slider', { name: '葉の密度', exact: true })).toHaveValue('4');
    const stem = form.getByRole('group', { name: '枝・茎', exact: true });
    await expect(stem.locator('summary')).toContainText('手動 3項目');
    await stem.locator('summary').click();
    await expect(stem.getByLabel('幹・茎の本数', { exact: true })).toHaveValue('4');
    await expect(stem.getByLabel('幹・茎の曲がり', { exact: true })).toHaveValue('25');
    await expect(stem.getByLabel('小枝の長さ', { exact: true })).toHaveValue('120');
    const leaf = form.getByRole('group', { name: '葉', exact: true });
    await leaf.locator('summary').click();
    await expect(leaf.locator('select[name="modelLeafArrangement"]')).toHaveValue('opposite');
    await expectPreviewDrawn(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await snap(page, `${dir}/edit-existing-${width}.png`);
    const updated = page.waitForResponse((r) => r.url().includes(`/api/products/${product.id}`));
    await form.getByRole('button', { name: '変更を保存', exact: true }).click();
    expect((await updated).status()).toBe(200);
    expect((await read(product.id)).plantModelProfile).toEqual(original);
  }

  // A product saved without a garden object stays without one when another field is edited.
  await page.setViewportSize({ width: 1440, height: 900 });
  const form = await openGardenTab(page, legacy.sku);
  await expect(form.getByText('この商品は庭オブジェクトが未設定です。', { exact: false })).toBeVisible();
  await form
    .getByRole('navigation', { name: '商品編集のタブ', exact: true })
    .getByRole('button', { name: /商品情報/ })
    .click();
  await form.getByLabel('税込価格（円）', { exact: true }).fill('2100');
  const updated = page.waitForResponse((r) => r.url().includes(`/api/products/${legacy.id}`));
  await form.getByRole('button', { name: '変更を保存', exact: true }).click();
  expect((await updated).status()).toBe(200);
  const kept = await read(legacy.id);
  expect(kept.priceYen).toBe(2100);
  expect(kept.plantModelProfile).toBeNull();
  await writeFile(
    `${dir}/edit-existing.json`,
    JSON.stringify(
      { edited: { id: product.id, plantModelProfile: original }, legacy: { id: kept.id, plantModelProfile: null } },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

// #49: a product in a non-plant category (鉢・庭材) has only its height, no plant model, AI or preview.
test('non-plant category keeps only the product height and saves no plant model', async ({ page }) => {
  test.setTimeout(300000);
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const category = '鉢・庭材';
  expect(await (await call(page.request, '/categories')).json()).toContain(category);
  const read = async (id) => (await (await call(page.request, '/products?storeId=1')).json()).find((p) => p.id === id);
  const saved = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${ec}/seller/products/new`);
    const form = page.locator('.product-form');
    await form.getByLabel('商品名', { exact: true }).fill(`庭材の確認 ${width}px ${Date.now()}`);
    await form.getByLabel('商品説明', { exact: true }).fill('植物以外のカテゴリーの出品を確認します。');
    // A new product needs at least one in stock (issue #72).
    await form.getByLabel('選択店舗の在庫', { exact: true }).fill('1');
    await form.getByRole('button', { name: 'カテゴリーを選ぶ', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'カテゴリーを選ぶ', exact: true });
    await dialog.getByLabel('カテゴリー名で絞り込み').fill(category);
    await dialog
      .getByRole('list', { name: 'カテゴリー一覧' })
      .getByRole('button', { name: category, exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await addImages(form);
    await form.getByRole('button', { name: '次へ', exact: true }).click();

    const garden = form.getByRole('region', { name: '庭オブジェクト', exact: true });
    await expect(garden.getByLabel('商品の高さ', { exact: true })).toBeVisible();
    await expect(garden.getByLabel('商品の高さ', { exact: true })).toHaveValue('');
    await expect(garden.getByRole('group', { name: 'サイズ', exact: true })).toHaveCount(0);
    await expect(garden.getByLabel('植物の高さ', { exact: true })).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'AIで生成' })).toHaveCount(0);
    await expect(form.locator('iframe.plant-model-preview')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await snap(page, `${dir}/garden-non-plant-${width}.png`);

    // The height is optional here: 「次へ」 goes to the review with it empty.
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveCount(0);
    const review = form.getByRole('region', { name: '出品内容の確認' });
    // #53: no plant model and no size on the review of a non-plant product.
    await expect(review).toContainText(category);
    await expect(review.getByTitle('出品する植物の3Dプレビュー', { exact: true })).toHaveCount(0);
    await expect(review).not.toContainText('高さ');
    const posted = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await form.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(200);
    const product = await response.json();
    expect(product.category).toBe(category);
    expect(product.plantModelProfile).toBeNull();
    expect((await read(product.id)).plantModelProfile).toBeNull();

    // Editing the saved product, including its height, keeps it without a plant model.
    const edit = await openGardenTab(page, product.sku);
    await expect(edit.getByRole('group', { name: 'サイズ', exact: true })).toHaveCount(0);
    await edit.getByLabel('商品の高さ', { exact: true }).fill('30');
    const updated = page.waitForResponse((r) => r.url().includes(`/api/products/${product.id}`));
    await edit.getByRole('button', { name: '変更を保存', exact: true }).click();
    expect((await updated).status()).toBe(200);
    const stored = await read(product.id);
    expect(stored.heightCm).toBe(30);
    expect(stored.plantModelProfile).toBeNull();
    saved.push(stored);

    const reopened = await openGardenTab(page, product.sku);
    await expect(reopened.getByLabel('商品の高さ', { exact: true })).toHaveValue('30');
    await expect(reopened.locator('iframe.plant-model-preview')).toHaveCount(0);
    await snap(page, `${dir}/garden-non-plant-after-reload-${width}.png`);
  }
  await writeFile(
    `${dir}/non-plant.json`,
    JSON.stringify(
      saved.map(({ id, sku, category: c, heightCm, plantModelProfile }) => ({
        id,
        sku,
        category: c,
        heightCm,
        plantModelProfile,
      })),
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
