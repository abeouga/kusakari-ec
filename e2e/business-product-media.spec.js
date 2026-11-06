import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember } from './business-helpers.js';
import { addImages } from './product-images.js';

test.use({ trace: 'off' });

// Moved from the product-input configuration: the seller signs in through Cognito first. Images are added on
// their own wizard step (issue #46).
test('product images persist after editing and removed guidance is unavailable', async ({ page }) => {
  test.setTimeout(180000);
  const dir = 'artifacts/business/product-media';
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  await page.goto(`${ec}/seller/products/new`);
  const form = page.locator('.product-form');
  const name = `商品画像検証用植物 ${Date.now()}`;
  await form.getByLabel('商品名', { exact: true }).fill(name);
  await form.getByLabel('商品説明', { exact: true }).fill('画像選択と商品編集の検証。');
  await expect(form.locator('[name="imageUrl"],[name="images"],[name="care"],[name="minTemperatureC"]')).toHaveCount(0);
  await form.locator('summary').getByText('詳しい情報', { exact: true }).click();
  await expect(
    form
      .locator('details')
      .filter({ has: page.locator('summary').getByText('詳しい情報', { exact: true }) })
      .locator('input'),
  ).toHaveCount(3);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('画像');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('商品画像');
  await expect(form.locator('.wizard-heading')).toHaveText('画像');

  await addImages(form, ['frontend/public/images/plant-photo-split-leaf.png', 'frontend/public/images/olive.png']);
  const first = await form.getByRole('img', { name: '商品画像1', exact: true }).getAttribute('src');
  const second = await form.getByRole('img', { name: '商品画像2', exact: true }).getAttribute('src');
  const stored = await page.request.get(`${ec}${first}`);
  expect(stored.headers()['content-type']).toContain('image/png');
  expect(await stored.body()).toEqual(await readFile('frontend/public/images/plant-photo-split-leaf.png'));
  await form.getByRole('button', { name: '画像2をメインにする', exact: true }).click();
  await expect(form.getByRole('img', { name: '商品画像1', exact: true })).toHaveAttribute('src', second);
  await form.getByRole('button', { name: '商品画像2を削除', exact: true }).click();
  await expect(form.locator('.product-image-tile')).toHaveCount(1);
  // Failed upload must retain already selected media.
  await form
    .getByLabel('商品画像を追加', { exact: true })
    .setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a valid png image') });
  await expect(form.getByRole('alert')).toContainText('PNG');
  await expect(form.locator('.product-image-tile')).toHaveCount(1);
  await expect(form.getByRole('img', { name: '商品画像1', exact: true })).toHaveAttribute('src', second);
  await addImages(form);
  const finalImages = await form
    .locator('.product-image-tile img')
    .evaluateAll((els) => els.map((el) => el.getAttribute('src')));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await form.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/product-images-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
  // Issue #49: plants always get a garden object, so the required height is entered before 「次へ」.
  await form.getByLabel('植物の高さ', { exact: true }).fill('120');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
  await form.getByRole('button', { name: '出品する', exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  const product = await response.json();
  const stale = response.request().postDataJSON();
  expect(product.imageUrl).toBe(finalImages[0]);
  expect(product.images).toEqual(finalImages.slice(1));
  expect(product.care).toBe('');
  expect(product.minTemperatureC).toBeNull();
  await expect(page).toHaveURL(`${ec}/seller/products`);
  await page.reload();
  await expect(page.getByRole('button', { name: /Tips/ })).toHaveCount(0);
  expect((await call(page.request, `/products/${product.id}/tips`)).status()).toBe(404);
  expect((await call(page.request, `/products/${product.id}/tips`, 'PUT', { care: 'removed' })).status()).toBe(404);
  const priced = await call(page.request, `/products/${product.id}`, 'PUT', { ...stale, priceYen: 4200 });
  expect(priced.status(), await priced.text()).toBe(200);
  await page.reload();
  await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
  await expect(page.getByTestId(`manage-${product.id}`)).toContainText('4,200');
  const persisted = (await (await call(page.request, '/products?storeId=1')).json()).find((p) => p.id === product.id);
  expect(persisted.imageUrl).toBe(finalImages[0]);
  expect(persisted.images).toEqual(finalImages.slice(1));
  for (const key of ['floweringDescription', 'seasonalCare', 'styleDescription'])
    expect(persisted).not.toHaveProperty(key);

  // Editing opens the image step with the saved order.
  await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
  const tabs = form.getByRole('navigation', { name: '商品編集のタブ', exact: true });
  await tabs.getByRole('button', { name: /画像/ }).click();
  await expect(form.getByRole('img', { name: '商品画像1', exact: true })).toHaveAttribute('src', finalImages[0]);
  await expect(form.locator('.product-image-tile')).toHaveCount(finalImages.length);

  await page.goto(`${ec}/`);
  await page.getByLabel('植物を検索', { exact: true }).fill(product.sku);
  await page
    .getByTestId(`product-${product.id}`)
    .getByRole('button', { name: `${name}の詳細`, exact: true })
    .click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: '商品画像2', exact: true }).click();
  await expect(detail.locator('.detail-main-image')).toHaveAttribute('src', finalImages[1]);
  await expect(detail.getByRole('region', { name: '出品者Tips' })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(detail.locator('.detail-main-image')).toHaveAttribute('src', finalImages[1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/product-images-public-${width}.png` });
  }
  await writeFile(
    `${dir}/product-media-after-reload.json`,
    JSON.stringify(
      {
        product: { id: product.id, sku: product.sku, imageUrl: product.imageUrl, images: product.images },
        persisted: { id: persisted.id, imageUrl: persisted.imageUrl, images: persisted.images },
        finalImages,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('product image API rejects unsupported files, oversized uploads and foreign origins', async ({ page }) => {
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const csrf = await page.request.get(`${ec}/api/auth/csrf`).then((r) => r.json());
  const upload = (file, extra = {}) =>
    page.request.post(`${ec}/api/product-images`, {
      headers: { [csrf.headerName]: csrf.token, ...extra },
      multipart: { file },
    });
  const file = { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') };
  expect((await upload(file)).status()).toBe(400);
  expect((await upload({ ...file, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })).status()).toBe(413);
  expect((await upload(file, { Origin: 'https://invalid.example' })).status()).toBe(403);
  expect((await page.request.get(`${ec}/api/product-images/00000000-0000-0000-0000-000000000000`)).status()).toBe(404);
});
