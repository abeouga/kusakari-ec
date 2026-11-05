import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput } from './business-helpers.js';
import { addImages } from './product-images.js';

test.use({ trace: 'off' });

const assigned = /^KS-\d{8}-[2-9A-HJ-NP-Z]{6}$/;
const external = (url) => {
  const { hostname } = new URL(url);
  return !['127.0.0.1', 'localhost'].includes(hostname) && !/^fonts\.(googleapis|gstatic)\.com$/.test(hostname);
};

// Issues #45, #46, #50: progress bar, category/store dialogs, server-assigned number, image step, one height.
test('product wizard registers through the progress bar, dialogs and image step at 1440px and 390px', async ({
  page,
}) => {
  test.setTimeout(360000);
  const dir = 'artifacts/business/product-wizard';
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // An administrator manages every enabled store, so the map shows several pins.
  prepareMember(await login(page, 'test.admin@example.com'), 'ADMIN');
  const stores = await (await call(page.request, '/stores')).json();
  for (const store of stores) {
    expect(Number.isFinite(store.latitude), store.name).toBe(true);
    expect(Number.isFinite(store.longitude), store.name).toBe(true);
  }
  const categories = await (await call(page.request, '/categories')).json();
  const category = categories.find((name) => name !== '庭木');
  const home = stores.find((store) => store.id === 1);
  // Seed stores 2 and 3 have their own coordinates, so their pins are not covered by other pins.
  const pinned = stores.find((store) => store.id === 3) ?? stores.find((store) => store.id === 2);
  expect(category && home && pinned).toBeTruthy();
  const saved = [];

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${ec}/seller/products/new`);
    await page.reload();
    const form = page.locator('.product-form');
    const bar = form.getByRole('navigation', { name: '出品の手順', exact: true });
    await expect(bar.getByRole('listitem')).toHaveCount(4);
    await expect(bar.getByRole('button')).toHaveCount(0);
    for (const [index, label] of ['商品情報', '画像', '庭オブジェクト', '確認'].entries())
      await expect(bar.getByRole('listitem').nth(index)).toContainText(label);
    await expect(bar.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(bar.locator('[aria-current="step"]')).toContainText('商品情報');

    // #46: no product-number input; #50: no height input on the first step.
    const info = form.getByRole('region', { name: '商品情報', exact: true });
    await expect(form.locator('input[name="sku"]')).toHaveCount(0);
    await expect(info.getByText('商品番号', { exact: true })).toHaveCount(0);
    await expect(info.getByLabel('植物の高さ（cm・土際から）', { exact: true })).toHaveCount(0);
    await expect(info.locator('input[type="file"]')).toHaveCount(0);
    const name = `ウィザード確認 ${width}px ${Date.now()}`;
    await info.getByLabel('商品名', { exact: true }).fill(name);
    await info.getByLabel('商品説明', { exact: true }).fill('バー形式の手順とダイアログ選択を確認します。');
    await info.getByLabel('税込価格（円）', { exact: true }).fill('2400');
    await info.getByLabel('選択店舗の在庫', { exact: true }).fill('3');

    // Category dialog with the keyboard only: Enter opens, Esc closes, Tab + Enter chooses.
    const categoryButton = info.getByRole('button', { name: 'カテゴリーを選ぶ', exact: true });
    await categoryButton.focus();
    await page.keyboard.press('Enter');
    const categoryDialog = page.getByRole('dialog', { name: 'カテゴリーを選ぶ', exact: true });
    const filter = categoryDialog.getByLabel('カテゴリー名で絞り込み');
    await expect(filter).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(categoryDialog).toHaveCount(0);
    await expect(categoryButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(filter).toBeFocused();
    await page.keyboard.type(category);
    const options = categoryDialog.getByRole('list', { name: 'カテゴリー一覧' }).getByRole('button');
    for (const text of await options.allInnerTexts()) expect(text).toContain(category);
    const categoryBox = await categoryDialog.boundingBox();
    expect(categoryBox.x).toBeGreaterThanOrEqual(0);
    expect(categoryBox.x + categoryBox.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/category-dialog-${width}.png` });
    await page.keyboard.press('Tab');
    await expect(options.filter({ hasText: category }).first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(categoryDialog).toHaveCount(0);
    await expect(categoryButton).toBeFocused();
    await expect(info.locator('.picker-field').filter({ has: categoryButton })).toContainText(category);

    // Store dialog: the in-page map mock loads nothing from outside, and pins and the list both choose.
    const outside = [];
    const watch = (request) => external(request.url()) && outside.push(request.url());
    page.on('request', watch);
    const storeButton = info.getByRole('button', { name: '在庫を登録する店舗を選ぶ', exact: true });
    await storeButton.click();
    const storeDialog = page.getByRole('dialog', { name: '在庫を登録する店舗を選ぶ', exact: true });
    await expect(storeDialog.getByRole('button', { name: /^地図のピン：/ })).toHaveCount(stores.length);
    await expect(storeDialog.locator('iframe, img')).toHaveCount(0);
    const box = await storeDialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/store-dialog-${width}.png` });
    await storeDialog.getByRole('button', { name: `地図のピン：${pinned.name}`, exact: true }).click();
    await expect(storeDialog).toHaveCount(0);
    await expect(storeButton).toBeFocused();
    await expect(info.locator('.picker-field').filter({ has: storeButton })).toContainText(pinned.name);
    await page.keyboard.press('Enter');
    await expect(storeDialog.getByRole('button', { name: `地図のピン：${pinned.name}`, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(storeDialog).toHaveCount(0);
    await expect(storeButton).toBeFocused();
    await storeButton.click();
    await storeDialog
      .getByRole('list', { name: '店舗一覧' })
      .getByRole('listitem')
      .filter({ has: page.getByText(home.name, { exact: true }) })
      .getByRole('button')
      .click();
    await expect(storeDialog).toHaveCount(0);
    await expect(info.locator('.picker-field').filter({ has: storeButton })).toContainText(home.name);
    page.off('request', watch);
    expect(outside).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/info-${width}.png`, fullPage: true });

    // #46: images are their own step; the bar follows 「次へ」.
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(bar.locator('[aria-current="step"]')).toContainText('画像');
    await expect(bar.locator('li[data-state="done"]')).toHaveCount(1);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('商品画像を1枚以上追加してください。');
    await addImages(form, ['frontend/public/images/plant-photo-split-leaf.png', 'frontend/public/images/olive.png']);
    const main = await form.getByRole('img', { name: '商品画像1', exact: true }).boundingBox();
    const second = await form.getByRole('img', { name: '商品画像2', exact: true }).boundingBox();
    expect(main.width).toBeGreaterThan(second.width);
    expect(main.height).toBeGreaterThan(second.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/images-${width}.png`, fullPage: true });

    // #50: the only height field is on the garden-object step and its range error appears once.
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(bar.locator('[aria-current="step"]')).toContainText('庭オブジェクト');
    await expect(bar.locator('li[data-state="done"]')).toHaveCount(2);
    await expect(form.getByLabel('植物の高さ（cm・土際から）', { exact: true })).toHaveCount(1);
    const garden = form.getByRole('region', { name: '庭オブジェクト', exact: true });
    // Not configured yet: only the height and the AI / manual choices are shown.
    await expect(garden.getByRole('button', { name: '手動で設定', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/garden-${width}.png`, fullPage: true });
    await garden.getByLabel('植物の高さ（cm・土際から）', { exact: true }).fill('5');
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveCount(1);
    await expect(form.getByRole('alert')).toHaveText('植物の高さは10〜1500cmの整数にしてください。');
    await expect(bar.locator('[aria-current="step"]')).toContainText('庭オブジェクト');
    await garden.getByLabel('植物の高さ（cm・土際から）', { exact: true }).fill('180');
    await form.getByRole('button', { name: '設定せず次へ', exact: true }).click();

    const review = form.getByRole('region', { name: '出品内容の確認' });
    await expect(bar.locator('[aria-current="step"]')).toContainText('確認');
    await expect(review).toContainText('保存時に自動で決まります');
    await expect(review).toContainText('180 cm');
    await expect(review).toContainText(category);
    await expect(review).toContainText(home.name);
    await expect(review).toContainText('画像：2枚');
    await page.screenshot({ path: `${dir}/review-${width}.png`, fullPage: true });

    const posted = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await form.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(200);
    expect(response.request().postDataJSON().sku).toBe('');
    const product = await response.json();
    expect(product.sku).toMatch(assigned);
    expect(product.heightCm).toBe(180);
    expect(product.category).toBe(category);
    await expect(page).toHaveURL(`${ec}/seller/products`);
    await expect(page.getByRole('status').filter({ hasText: product.sku })).toBeVisible();
    saved.push(product);

    // Editing keeps the bar as tabs; the number is shown but cannot be changed.
    await page.reload();
    await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
    await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
    const tabs = form.getByRole('navigation', { name: '商品編集のタブ', exact: true });
    await expect(tabs.getByRole('button')).toHaveCount(3);
    await expect(tabs.getByRole('button', { name: /商品情報/ })).toHaveAttribute('aria-current', 'step');
    await expect(form.locator('input[name="sku"]')).toHaveCount(0);
    await expect(form.getByLabel('商品番号', { exact: true })).toHaveText(product.sku);
    await tabs.getByRole('button', { name: /画像/ }).click();
    await expect(tabs.getByRole('button', { name: /画像/ })).toHaveAttribute('aria-current', 'step');
    await expect(form.locator('.product-image-tile')).toHaveCount(2);
    await tabs.getByRole('button', { name: /庭オブジェクト/ }).click();
    await expect(form.getByLabel('植物の高さ（cm・土際から）', { exact: true })).toHaveValue('180');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/edit-after-reload-${width}.png`, fullPage: true });
  }

  // #50: the product page shows the height entered on the garden-object step.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ec}/`);
  await page.getByLabel('植物を検索', { exact: true }).fill(saved[0].sku);
  await page.getByRole('button', { name: `${saved[0].name}の詳細`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('高さ 約180cm');

  const products = await (await call(page.request, `/products?storeId=${home.id}`)).json();
  const stored = saved.map((product) => products.find((item) => item.id === product.id));
  for (const item of stored) {
    expect(item.sku).toMatch(assigned);
    expect(item.heightCm).toBe(180);
    expect(item.images).toHaveLength(1);
  }
  await writeFile(
    `${dir}/products.json`,
    JSON.stringify(
      stored.map(({ id, sku, name, category: c, heightCm, imageUrl, images, plantModelProfile }) => ({
        id,
        sku,
        name,
        category: c,
        heightCm,
        imageUrl,
        images,
        plantModelProfile,
      })),
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

// Review fix for #46: in the footer 「商品管理」 dialog, Esc in the category dialog closes only that dialog.
test('Esc in the category dialog keeps the product manager dialog open while editing', async ({ page }) => {
  test.setTimeout(180000);
  const dir = 'artifacts/business/product-wizard';
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const input = productInput();
  const created = await call(page.request, '/products', 'POST', input);
  expect(created.status(), await created.text()).toBe(200);
  const product = await created.json();

  await page.goto(`${ec}/`);
  await page.reload();
  await page.locator('.site-footer').getByRole('button', { name: '商品管理', exact: true }).click();
  const manager = page.getByRole('dialog', { name: '商品管理', exact: true });
  await expect(manager).toBeVisible();
  await manager.getByPlaceholder('商品名・商品番号').fill(product.sku);
  await manager.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
  const form = manager.locator('.product-form');
  await expect(form.getByLabel('商品番号', { exact: true })).toHaveText(product.sku);
  await form.getByLabel('商品名', { exact: true }).fill(`${input.name} 編集中`);

  const categoryButton = form.getByRole('button', { name: 'カテゴリーを選ぶ', exact: true });
  await categoryButton.focus();
  await page.keyboard.press('Enter');
  const categoryDialog = page.getByRole('dialog', { name: 'カテゴリーを選ぶ', exact: true });
  await expect(categoryDialog.getByLabel('カテゴリー名で絞り込み')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(categoryDialog).toHaveCount(0);
  await expect(manager).toBeVisible();
  await expect(categoryButton).toBeFocused();
  await expect(form.getByLabel('商品名', { exact: true })).toHaveValue(`${input.name} 編集中`);
  await page.screenshot({ path: `${dir}/manager-after-esc.png` });

  // A second Esc closes the manager itself, and nothing was saved by the first one.
  await page.keyboard.press('Escape');
  await expect(manager).toHaveCount(0);
  const products = await (await call(page.request, '/products?storeId=1')).json();
  const stored = products.find((item) => item.id === product.id);
  expect(stored.name).toBe(input.name);
  await writeFile(
    `${dir}/manager-esc.json`,
    JSON.stringify({ id: stored.id, sku: stored.sku, name: stored.name }, null, 2),
  );
  expect(errors).toEqual([]);
});
