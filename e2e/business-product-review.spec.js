import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember } from './business-helpers.js';
import { addImages } from './product-images.js';

test.use({ trace: 'off' });

const dir = 'artifacts/business/product-review';

/** Full-length capture with the viewport stretched to the document (the footer is sticky or fixed). */
async function snap(page, path) {
  const { width, height } = page.viewportSize();
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.screenshot({ path });
  await page.setViewportSize({ width, height });
}

// Issue #53: the review step shows the product like its card, with the plant's 3D preview under the image.
test('review step shows the product like its card with the 3D preview at 1440px and 390px', async ({ page }) => {
  test.setTimeout(360000);
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const saved = [];

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${ec}/seller/products/new`);
    const form = page.locator('.product-form');
    const bar = form.getByRole('navigation', { name: '出品の手順', exact: true });
    const name = `確認画面の検証 ${width}px ${Date.now()}`;
    const description = '明るい日陰で育てる観葉植物です。\n水やりは土の表面が乾いてから行います。';
    await form.getByLabel('商品名', { exact: true }).fill(name);
    await form.getByLabel('商品説明', { exact: true }).fill(description);
    await form.getByLabel('税込価格（円）', { exact: true }).fill('4800');
    await form.getByLabel('選択店舗の在庫', { exact: true }).fill('6');
    await form.locator('summary').getByText('サイズ', { exact: true }).click();
    await form.getByLabel('樹齢目安（年）', { exact: true }).fill('3');
    await form.getByLabel('鉢径（cm）', { exact: true }).fill('21');
    await form.locator('summary').getByText('詳しい情報', { exact: true }).click();
    await form.getByLabel('生産者名', { exact: true }).fill('確認画面テスト農園');
    await form.getByLabel('学名', { exact: true }).fill('Monstera deliciosa');
    await form.getByLabel('科名・属名', { exact: true }).fill('サトイモ科');
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await addImages(form, ['frontend/public/images/plant-photo-split-leaf.png', 'frontend/public/images/olive.png']);
    await form.getByRole('button', { name: '次へ', exact: true }).click();
    await form.getByLabel('植物の高さ', { exact: true }).fill('150');
    await form.getByRole('button', { name: '次へ', exact: true }).click();

    const review = form.getByRole('region', { name: '出品内容の確認' });
    await expect(bar.locator('[aria-current="step"]')).toContainText('確認');
    await expect(form.locator('.wizard-actions > span')).toHaveText('4 / 4');
    // Shown: name, price, stock, store, category, description and the entered details, with nothing folded.
    await expect(review.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(review.locator('.product-review-price')).toHaveText(/4,800\s*税込/);
    const facts = review.locator('.product-review-facts');
    await expect(facts.locator('dt')).toHaveText(['登録店舗', '在庫', 'カテゴリー']);
    await expect(facts.locator('dd').nth(0)).not.toHaveText(/^\d*$/);
    await expect(facts.locator('dd').nth(1)).toHaveText('6 点');
    await expect(facts.locator('dd').nth(2)).toHaveText('庭木');
    await expect(review.locator('.product-review-description p')).toHaveText(description);
    await expect(review.locator('.product-review-description p')).toBeVisible();
    await expect(review.locator('.latin')).toHaveText('Monstera deliciosa');
    await expect(review.locator('.latin')).toBeVisible();
    await expect(review.locator('.product-review-details dt')).toHaveText(['生産者名', '科名・属名', '樹齢目安']);
    await expect(review.locator('.product-review-details dd')).toHaveText(['確認画面テスト農園', 'サトイモ科', '3年']);
    await expect(review.locator('details')).toHaveCount(0);
    await expect(review.getByRole('list', { name: '商品画像 2枚' }).getByRole('listitem')).toHaveCount(2);
    // Not shown: the product number, sizes, the garden-object status and the edit buttons.
    for (const text of ['商品番号', '鉢径', '高さ', 'cm', '庭オブジェクト', '設定あり', '修正'])
      await expect(review).not.toContainText(text);
    await expect(review.getByRole('button')).toHaveCount(0);

    // The name and the price stand out from the description.
    const size = (locator) => locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const body = await size(review.locator('.product-review-description p'));
    expect(await size(review.getByRole('heading', { name, exact: true }))).toBeGreaterThanOrEqual(body * 1.5);
    expect(await size(review.locator('.product-review-price'))).toBeGreaterThanOrEqual(body * 1.5);

    // The same Canvas preview as the garden-object step, drawn under the product image.
    const model = review.getByTitle('出品する植物の3Dプレビュー', { exact: true });
    await expect(model).toHaveAttribute('src', /\/model-preview\?profile=.*%22heightCm%22%3A150/);
    await model.scrollIntoViewIfNeeded();
    await expect(
      page.frameLocator('iframe[title="出品する植物の3Dプレビュー"]').getByTestId('preview-loaded'),
    ).toHaveText('loaded', { timeout: 30000 });
    const photo = await review.locator('.product-review-photo').boundingBox();
    const frame = await model.boundingBox();
    const info = await review.locator('.product-review-body').boundingBox();
    expect(frame.y).toBeGreaterThanOrEqual(photo.y + photo.height);
    expect(Math.abs(frame.x - photo.x)).toBeLessThan(1);
    if (width === 1440) {
      // Two columns: image and preview on the left, the product information on the right.
      expect(info.x).toBeGreaterThanOrEqual(frame.x + frame.width);
      expect(info.y).toBeLessThan(frame.y);
    } else {
      // One column: image, preview, then the product information.
      expect(info.y).toBeGreaterThanOrEqual(frame.y + frame.height);
      expect(Math.abs(info.x - photo.x)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await snap(page, `${dir}/review-${width}.png`);

    // 「戻る」 leads back step by step with the values kept, and 「次へ」 returns to the same review.
    await form.getByRole('button', { name: '戻る', exact: true }).click();
    await expect(bar.locator('[aria-current="step"]')).toContainText('庭オブジェクト');
    await expect(form.getByLabel('植物の高さ', { exact: true })).toHaveValue('150');
    await form.getByRole('button', { name: '戻る', exact: true }).click();
    await expect(bar.locator('[aria-current="step"]')).toContainText('画像');
    await form.getByRole('button', { name: '戻る', exact: true }).click();
    await expect(bar.locator('[aria-current="step"]')).toContainText('商品情報');
    await expect(form.getByLabel('商品名', { exact: true })).toHaveValue(name);
    for (let step = 0; step < 3; step++) await form.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(bar.locator('[aria-current="step"]')).toContainText('確認');
    await expect(review.getByRole('heading', { name, exact: true })).toBeVisible();

    const posted = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await form.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(200);
    const product = await response.json();
    expect(product).toMatchObject({ name, priceYen: 4800, description, nurseryName: '確認画面テスト農園' });
    expect(product.plantModelProfile).toMatchObject({ heightCm: 150 });
    await expect(page).toHaveURL(`${ec}/seller/products`);
    saved.push(product);

    await page.reload();
    await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
    const card = page.getByTestId(`manage-${product.id}`);
    await expect(card).toContainText(name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await snap(page, `${dir}/listed-after-reload-${width}.png`);
  }

  const products = await (await call(page.request, '/products?storeId=1')).json();
  const stored = saved.map((product) => products.find((item) => item.id === product.id));
  for (const item of stored) expect(item).toMatchObject({ priceYen: 4800, plantModelProfile: { heightCm: 150 } });
  await writeFile(
    `${dir}/products.json`,
    JSON.stringify(
      stored.map(({ id, sku, name, category, priceYen, description, nurseryName, familyName, ageYears, images }) => ({
        id,
        sku,
        name,
        category,
        priceYen,
        description,
        nurseryName,
        familyName,
        ageYears,
        images,
      })),
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
