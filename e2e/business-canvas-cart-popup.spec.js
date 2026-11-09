import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, canvas, login, call } from './business-helpers.js';

const evidence = 'artifacts/business/canvas-cart-popup';

/** Confirmed photo covering the whole garden: Canvas places items only in gardens with a photo (Canvas issue #15). */
async function seedPhoto(page, garden) {
  await page.goto(`${ec}/`);
  const dataUrl = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 600;
    image.height = 400;
    const drawing = image.getContext('2d');
    drawing.fillStyle = '#b8ccb2';
    drawing.fillRect(0, 0, 600, 400);
    return image.toDataURL('image/png');
  });
  const corners = [
    { x: 0.1, y: 0.9 },
    { x: 0.9, y: 0.9 },
    { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.1 },
  ];
  const photo = { dataUrl, imageWidth: 600, imageHeight: 400, corners, boundary: corners };
  const saved = await call(page.request, `/gardens/${garden.id}`, 'PUT', { ...garden, photo }, canvas);
  expect(saved.status(), await saved.text()).toBe(200);
  return saved.json();
}

// Issue #88: Canvas "リストを確認" opens the cart with the "add from garden" dialog instead of a garden-only list screen.
test('Canvas list button opens the cart dialog for that garden and the added item persists', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await login(page, 'test.user@example.com');
  const beforeCart = await call(page.request, '/cart').then((r) => r.json());
  const products = await call(page.request, `/products?storeId=${beforeCart.storeId}`).then((r) => r.json());
  const inCart = new Set(beforeCart.items.map((item) => item.product.id));
  const product = products.find((p) => p.active && p.stock > 2 && !inCart.has(p.id));
  expect(product, 'an active product that is not in the cart').toBeTruthy();
  const name = `Canvas連携 ${randomUUID().slice(0, 8)}`;
  const created = await call(page.request, '/gardens', 'POST', { name }, canvas);
  expect(created.status()).toBe(201);
  const garden = await created.json();
  // A second garden makes sure the dialog picks the garden Canvas came from, not the first one listed.
  const other = await call(page.request, '/gardens', 'POST', { name: `${name} 別` }, canvas).then((r) => r.json());
  try {
    await seedPhoto(page, garden);
    expect((await call(page.request, `/shopping-lists/${garden.id}/items/${product.id}`, 'PUT')).status()).toBe(200);

    await page.goto(`${canvas}/gardens/${garden.id}`);
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    await expect(page.getByTestId('unplaced-ec-item')).toBeVisible();
    await page.screenshot({ path: `${evidence}/canvas-shopping-tab.png` });
    await page.getByRole('button', { name: 'リストを確認', exact: true }).click();

    await expect(page).toHaveURL(`${ec}/cart?garden=${garden.id}`);
    const dialog = page.getByRole('dialog', { name: '庭に設置したものから追加', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: new RegExp(`^${name} \\d+種類$`) })).toHaveAttribute('aria-pressed', 'true');
    const line = dialog.getByTestId(`garden-item-product:${product.id}`);
    await expect(line).toContainText(product.name);
    await expect(page.getByRole('heading', { name: /の買い物リスト$/ })).toHaveCount(0);
    await line.getByRole('checkbox').check();
    await page.screenshot({ path: `${evidence}/cart-dialog-from-canvas.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `${evidence}/cart-dialog-from-canvas-mobile.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog.getByRole('button', { name: '1点をカートに追加', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // Closing the dialog drops the query, so a reload shows the cart without reopening it.
    await expect(page).toHaveURL(`${ec}/cart`);
    const cartLine = page
      .locator('.cart-line')
      .filter({ has: page.locator(`a[href*="productId=${encodeURIComponent(product.id)}"]`) });
    await expect(cartLine).toHaveCount(1);
    await page.reload();
    await expect(cartLine).toHaveCount(1);
    await expect(dialog).toHaveCount(0);
    await cartLine.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/cart-after-reload.png` });
    const afterCart = await call(page.request, '/cart').then((r) => r.json());
    expect(afterCart.items.find((item) => item.product.id === product.id)?.quantity).toBe(1);
    await writeFile(`${evidence}/cart-after-reload.json`, JSON.stringify(afterCart, null, 2));
    await writeFile(
      `${evidence}/garden-after-reload.json`,
      JSON.stringify(await call(page.request, `/gardens/${garden.id}`, 'GET', undefined, canvas).then((r) => r.json()), null, 2),
    );

    // The removed garden-only screens lead to the same dialog.
    await page.goto(`${ec}/cart/gardens/${garden.id}`);
    await expect(page).toHaveURL(`${ec}/cart?garden=${garden.id}`);
    await expect(dialog.getByRole('button', { name: new RegExp(`^${name} \\d+種類$`) })).toHaveAttribute('aria-pressed', 'true');
    await expect(line).toContainText('カートに入っています');
    await page.screenshot({ path: `${evidence}/old-detail-url.png` });
    await page.goto(`${ec}/cart#garden-shopping-lists`);
    await expect(page).toHaveURL(`${ec}/cart?garden=`);
    await expect(dialog).toBeVisible();
    await expect(page.locator('#garden-shopping-lists')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(page).toHaveURL(`${ec}/cart`);
  } finally {
    const current = await call(page.request, '/cart').then((r) => r.json());
    if (current.items.some((item) => item.product.id === product.id))
      await call(page.request, `/cart/items/${product.id}`, 'PUT', { quantity: 0, revision: current.revision });
    for (const id of [garden.id, other.id]) await call(page.request, `/gardens/${id}`, 'DELETE', undefined, canvas);
  }
});

test('a guest who opens the dialog link is asked to log in and returns to the dialog', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.goto(`${ec}/cart?garden=`);
  const notice = page.locator('.garden-login-notice');
  await expect(notice).toContainText('ログインしてください');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/guest-login-notice.png` });
  await notice.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(`${ec}/account/login?returnTo=${encodeURIComponent(`${ec}/cart?garden=`)}`);
});
