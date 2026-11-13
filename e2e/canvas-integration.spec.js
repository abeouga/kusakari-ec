import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, canvas, login, call, prepareMember, seedGardenPhoto } from './business-helpers.js';

// Issue #113: Canvas and the cart are for a signed-in buyer (canvas#64, #108); the garden is saved by the real Canvas API.
test('EC to Canvas to project shopping list to selected purchase and persisted cart', async ({ page }) => {
  let id;
  try {
    prepareMember(await login(page, 'test.user@example.com'), 'USER');
    await page.goto(`${ec}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /Canvasでお気に入りの植物を探す/ }).click();
    await expect(page).toHaveURL(`${canvas}/`);
    // Canvas creates a garden from the list's first card; its name is edited later in the editor.
    await page.getByRole('button', { name: '新しい庭をつくる', exact: true }).click();
    await page.waitForURL(/\/gardens\//, { waitUntil: 'domcontentloaded' });
    id = new URL(page.url()).pathname.split('/').at(-1);
    // Canvas places items only after the garden photo is confirmed (Canvas issue #15). Uploading and calibrating the
    // photo is covered by Canvas's own E2E, so the confirmed photo is saved through the real Canvas API here.
    await seedGardenPhoto(
      page,
      await call(page.request, `/gardens/${id}`, 'GET', undefined, canvas).then((r) => r.json()),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await page.getByRole('tab', { name: '商品一覧', exact: true }).click();
    await page.getByLabel('商品を検索', { exact: true }).fill('ベンチ');
    const target = page.getByTestId('garden-canvas').locator('canvas');
    const bounds = await target.boundingBox();
    await page.getByTestId('browse-canvas-bench').dragTo(target, {
      sourcePosition: { x: 30, y: 30 },
      targetPosition: { x: bounds.width * 0.5, y: bounds.height * 0.5 },
    });
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    await page.getByRole('button', { name: 'リストを確認', exact: true }).click();
    // Issue #88: Canvas opens the cart's "add from garden" dialog for this garden.
    await expect(page).toHaveURL(`${ec}/cart?garden=${id}`);
    const dialog = page.getByRole('dialog', { name: '庭に設置したものから追加', exact: true });
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await dialog.getByRole('button', { name: 'すべて選択', exact: true }).click();
    await dialog.getByRole('button', { name: '1点をカートに追加', exact: true }).click();
    await expect(page).toHaveURL(`${ec}/cart`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.cart-line')).toHaveCount(1);
    const cart = await call(page.request, '/cart').then((r) => r.json());
    expect(cart.items[0].product.id).toBe('canvas-bench');
    expect(cart.items[0].quantity).toBe(1);
    // The pickup store is the product's store (store 2 for the Canvas sample products).
    expect(cart.items[0].storeId).toBe(2);
    await mkdir('artifacts/e2e', { recursive: true });
    await page.screenshot({ path: 'artifacts/e2e/canvas-shopping-journey.png', fullPage: true });
    await writeFile('artifacts/e2e/canvas-shopping-cart.json', JSON.stringify(cart, null, 2));
  } finally {
    if (id) await call(page.request, `/gardens/${id}`, 'DELETE', undefined, canvas);
  }
});
