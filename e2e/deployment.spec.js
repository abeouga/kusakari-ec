import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const artifacts = process.env.KUSAKARI_DEPLOY_ARTIFACTS || 'artifacts/deployment';

test('packaged single-origin EC and Canvas preserve routing, models, photos and the shared cart', async ({ page, context, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const name = `配布構成検証-${randomUUID().slice(0, 8)}`;
  const created = await request.post('/canvas/api/gardens', { data: { name, width: 10, depth: 8 } });
  expect(created.status()).toBe(201);
  const garden = await created.json();
  try {
    const catalog = await request.get('/api/products?storeId=1').then((result) => result.json());
    const product = catalog.find((item) => item.modelComposition);
    expect(product).toBeTruthy();
    garden.objects.push({ id: randomUUID(), assetId: 'plant_modular', productId: product.id,
      productName: product.name, materialCode: product.canvasMaterialCode, modelComposition: product.modelComposition,
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
    const savedResponse = await request.put(`/canvas/api/gardens/${garden.id}`, { data: garden });
    expect(savedResponse.ok()).toBeTruthy();
    const saved = await savedResponse.json();
    await page.goto('/');
    await page.getByRole('link', { name: 'Canvas', exact: true }).click();
    await expect(page).toHaveURL(/\/canvas\/$/);
    await page.locator('.garden-card-open').filter({ hasText: name }).click();
    await expect(page).toHaveURL(`/canvas/gardens/${garden.id}`);
    await expect(page.getByTestId('garden-canvas').locator('canvas')).toBeVisible();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await page.reload();
    await expect(page.getByTestId('garden-canvas').locator('canvas')).toBeVisible();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await expect(page.getByRole('region', { name: 'ECの商品一覧' }).getByText('商品を読み込んでいます…', { exact: true })).toBeHidden();
    await mkdir(artifacts, { recursive: true });
    const actual = await request.get(`/canvas/api/gardens/${garden.id}`).then((response) => response.json());
    expect(actual).toEqual(saved);
    await writeFile(join(artifacts, 'garden.json'), JSON.stringify(actual, null, 2));
    await page.screenshot({ path: join(artifacts, 'canvas-reload.png') });
    const shopping = await request.get(`/api/shopping-lists/${garden.id}`);
    expect(shopping.ok(), `Shopping response ${shopping.status()}: ${await shopping.text()}`).toBeTruthy();
    expect((await shopping.json()).gardenId).toBe(garden.id);
    expect((await request.get('/canvas/models/plant-parts/v4/catalog.json')).ok()).toBeTruthy();
    expect((await request.get('/canvas/models/not-found.glb')).status()).toBe(404);
    expect((await request.get('/canvas/api/not-found')).status()).toBe(404);
    expect((await request.get('/api/health', { headers: { Origin: 'https://untrusted.invalid' } })).status()).toBe(403);
    expect((await request.get('/canvas/api/assets', { headers: { Origin: 'https://untrusted.invalid' } })).status()).toBe(403);
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    await page.getByRole('button', { name: 'ECで買い物リストを確認', exact: true }).click();
    await expect(page.getByRole('tab', { name: '庭の買い物リスト', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: '全選択', exact: true }).click();
    const transferResponse = page.waitForResponse((response) => response.url().endsWith(`/api/cart/shopping-lists/${garden.id}/items`));
    await page.getByRole('button', { name: '選択した商品をカートに追加', exact: true }).click();
    const transferred = await transferResponse;
    expect(transferred.status(), await transferred.text()).toBe(200);
    await expect(page.getByRole('tab', { name: /^カート/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cart-line')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.cart-line')).toHaveCount(1);
    const cookies = await context.cookies();
    expect(cookies.filter((cookie) => cookie.name === 'kusakari_cart')).toHaveLength(1);
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
      const drawing = canvas.getContext('2d'); drawing.fillStyle = '#a4b592'; drawing.fillRect(0, 0, 600, 400);
      return canvas.toDataURL();
    });
    const corners = [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.1 }];
    const photoGarden = await request.put(`/canvas/api/gardens/${garden.id}`, { data: { ...saved,
      objects: [{ id: randomUUID(), assetId: 'shrub_boxwood', position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }],
      photo: { dataUrl: image, imageWidth: 600, imageHeight: 400, corners, boundary: corners } } }).then((response) => response.json());
    expect(photoGarden.photo.dataUrl).toBe(image);
    const history = { id: randomUUID(), document: photoGarden, beforeDataUrl: image, afterDataUrl: image,
      model: 'gpt-image-2.5-sunburst', quality: 'medium', generationMethod: 'full_frame_v1', inputImageCount: 2,
      referenceSummary: [{ assetId: 'shrub_boxwood', productId: 'deployment-fixture', productName: 'Storage fixture', source: 'uploaded' }] };
    expect((await request.post(`/canvas/api/gardens/${garden.id}/image-history`, { data: history })).status()).toBe(200);
    const restored = await request.get(`/canvas/api/gardens/${garden.id}/image-history/${history.id}`).then((response) => response.json());
    expect(restored.document).toEqual(photoGarden);
    expect(restored.beforeDataUrl).toBe(image);
    expect(restored.afterDataUrl).toBe(image);
    const thumb = await request.get(`/canvas/api/gardens/${garden.id}/thumbnail`);
    expect(thumb.headers()['x-thumbnail-source']).toBe('generated');
    const proxy = await request.get(`/api/shopping-lists/${garden.id}/thumbnail`);
    expect(await proxy.body()).toEqual(await thumb.body());
    expect(errors).toEqual([]);
    await page.screenshot({ path: join(artifacts, 'ec-cart-reload.png') });
  } finally {
    expect((await request.delete(`/canvas/api/gardens/${garden.id}`)).status()).toBe(204);
  }
});
