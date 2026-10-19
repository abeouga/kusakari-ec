import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { addImages } from './product-images.js';

test('product images upload persist and seller tips are independent from listing edits', async ({ page }) => {
  test.setTimeout(120000);
  await mkdir('artifacts/e2e', { recursive: true });
  await page.goto('/seller/products/new');
  const form = page.locator('.product-form');
  await form.getByLabel('商品名', { exact: true }).fill('画像とTips検証用植物');
  await form.getByLabel('商品番号', { exact: true }).fill(`MEDIA-${randomUUID().slice(0, 8)}`);
  await form.getByLabel('商品説明', { exact: true }).fill('画像選択と出品後Tipsの検証。');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('商品画像');
  await expect(form.locator('[name="imageUrl"],[name="images"],[name="care"],[name="minTemperatureC"]')).toHaveCount(0);
  await form.locator('summary').getByText('詳しい情報', { exact: true }).click();
  await expect(
    form
      .locator('details')
      .filter({ has: page.locator('summary').getByText('詳しい情報', { exact: true }) })
      .locator('input'),
  ).toHaveCount(3);
  await addImages(form, ['frontend/public/images/plant-photo-split-leaf.png', 'frontend/public/images/olive.png']);
  const first = await form.getByRole('img', { name: '商品画像1', exact: true }).getAttribute('src');
  const second = await form.getByRole('img', { name: '商品画像2', exact: true }).getAttribute('src');
  expect((await page.request.get(first)).headers()['content-type']).toContain('image/png');
  expect(await (await page.request.get(first)).body()).toEqual(
    await readFile('frontend/public/images/plant-photo-split-leaf.png'),
  );
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
  await addImages(form);
  const finalImages = await form
    .locator('.product-image-tile img')
    .evaluateAll((els) => els.map((el) => el.getAttribute('src')));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await form.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/e2e/product-images-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await form.getByRole('button', { name: '設定せず次へ', exact: true }).click();
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
  await form.getByRole('button', { name: '出品する', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const product = await response.json();
  const stale = response.request().postDataJSON();
  expect(product.imageUrl).toBe(finalImages[0]);
  expect(product.images).toEqual(finalImages.slice(1));
  expect(product.care).toBe('');
  expect(product.minTemperatureC).toBeNull();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await page.reload();
  await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: 'Tipsを編集', exact: true }).click();
  const tips = page.locator('.tips-editor');
  await tips.getByLabel('水やり・育て方', { exact: true }).fill('土の表面が乾いたら水を与えます。');
  await tips.getByLabel('季節の育て方', { exact: true }).fill('冬は水やりを控えます。');
  await tips.getByLabel('相性のよい庭・空間', { exact: true }).fill('明るい室内に向きます。');
  await tips.locator('summary').getByText('温度・植栽条件', { exact: true }).click();
  await tips.getByLabel('耐寒温度（℃）', { exact: true }).fill('5');
  await page.screenshot({ path: 'artifacts/e2e/product-tips-editor.png', fullPage: true });
  await tips.getByRole('button', { name: 'Tipsを保存', exact: true }).click();
  await expect(tips).toHaveCount(0);
  // A stale product form must not erase newer tips.
  expect((await page.request.put(`/api/products/${product.id}`, { data: { ...stale, priceYen: 4200 } })).status()).toBe(
    200,
  );
  await page.reload();
  await page.getByTestId(`manage-${product.id}`).getByRole('button', { name: 'Tipsを編集', exact: true }).click();
  await expect(tips.getByRole('textbox', { name: '季節の育て方', exact: true })).toHaveValue('冬は水やりを控えます。');
  const persisted = await page.request.get(`/api/products/${product.id}/tips`).then((r) => r.json());
  expect(persisted.minTemperatureC).toBe(5);
  await page.goto('/');
  await page
    .getByTestId(`product-${product.id}`)
    .getByRole('button', { name: '画像とTips検証用植物の詳細', exact: true })
    .click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: '商品画像2', exact: true }).click();
  await expect(detail.locator('.detail-main-image')).toHaveAttribute('src', finalImages[1]);
  const visibleTips = detail.getByRole('region', { name: '出品者Tips' });
  await visibleTips.locator('summary').getByText('水やり・育て方', { exact: true }).click();
  await expect(visibleTips).toContainText(persisted.care);
  await page.screenshot({ path: 'artifacts/e2e/product-tips-public.png', fullPage: true });
  await writeFile(
    'artifacts/e2e/product-media-tips-after-reload.json',
    JSON.stringify({ product, persisted, finalImages }, null, 2),
  );
  expect(
    (
      await page.request.put(`/api/products/${product.id}/tips`, { data: { ...persisted, minTemperatureC: 80 } })
    ).status(),
  ).toBe(400);
  expect((await page.request.get('/api/products/nonexistent/tips')).status()).toBe(404);
});

test('product image API rejects unsupported files, oversized uploads and foreign origins', async ({ request }) => {
  const file = { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') };
  expect((await request.post('/api/product-images', { multipart: { file } })).status()).toBe(400);
  expect(
    (
      await request.post('/api/product-images', {
        multipart: { file: { ...file, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) } },
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await request.post('/api/product-images', { headers: { Origin: 'https://invalid.example' }, multipart: { file } })
    ).status(),
  ).toBe(403);
  expect((await request.get('/api/product-images/00000000-0000-0000-0000-000000000000')).status()).toBe(404);
});
