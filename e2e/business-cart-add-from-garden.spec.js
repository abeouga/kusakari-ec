import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, canvas, login, call } from './business-helpers.js';

const evidence = 'artifacts/business/cart-add-from-garden';

// Issue #64: the cart has no "cart / garden list" segments; the dashed card opens a dialog that adds garden items to the cart.
test('cart adds a garden item through the dashed card dialog and keeps it after reload', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await login(page, 'test.user@example.com');
  const beforeCart = await call(page.request, '/cart').then((r) => r.json());
  const products = await call(page.request, `/products?storeId=${beforeCart.storeId}`).then((r) => r.json());
  const inCart = new Set(beforeCart.items.map((item) => item.product.id));
  const [product, other] = products.filter((p) => p.active && p.stock > 2 && !inCart.has(p.id));
  expect(other, 'two active products that are not in the cart').toBeTruthy();
  const created = await call(
    page.request,
    '/gardens',
    'POST',
    { name: `カート追加 ${randomUUID().slice(0, 8)}` },
    canvas,
  );
  expect(created.status()).toBe(201);
  const garden = await created.json();
  try {
    for (const item of [product, other])
      expect((await call(page.request, `/shopping-lists/${garden.id}/items/${item.id}`, 'PUT')).status()).toBe(200);
    await page.goto(`${ec}/cart`);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await page.getByRole('button', { name: /庭に設置したものから追加/ }).click();
    const dialog = page.getByRole('dialog', { name: '庭に設置したものから追加', exact: true });
    await dialog.getByRole('button', { name: new RegExp(garden.name) }).click();
    await expect(dialog.getByRole('button', { name: new RegExp(garden.name) })).toHaveAttribute('aria-pressed', 'true');
    const line = dialog.getByTestId(`garden-item-product:${product.id}`);
    await expect(line).toContainText(product.name);
    await expect(line).toContainText('必要数 1点');
    await expect(dialog.getByText(/点を選択中/)).toHaveCount(0);
    await expect(dialog.getByText(/に配置した商品/)).toHaveCount(0);
    await line.getByRole('checkbox').check();
    const add = dialog.getByRole('button', { name: '1点をカートに追加', exact: true });
    await expect(add.locator('svg')).toHaveCount(1);
    // PR #66 review: "すべて選択" sits on the left, and the footer buttons share the item cards' corner radius.
    const selectAll = await dialog.getByRole('button', { name: 'すべて選択', exact: true }).boundingBox();
    expect(Math.abs(selectAll.x - (await line.boundingBox()).x)).toBeLessThanOrEqual(2);
    const radius = (locator) => locator.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    const cardRadius = await radius(line);
    expect(await radius(add)).toBe(cardRadius);
    expect(await radius(dialog.getByRole('button', { name: 'キャンセル', exact: true }))).toBe(cardRadius);
    await page.screenshot({ path: `${evidence}/dialog-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    await page.screenshot({ path: `${evidence}/dialog-mobile.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await add.click();
    await expect(dialog).toHaveCount(0);
    // Product names are not unique in the E2E database, so the line is found by its product ID.
    const cartLine = page
      .locator('.cart-line')
      .filter({ has: page.locator(`a[href*="productId=${encodeURIComponent(product.id)}"]`) });
    await expect(cartLine).toHaveCount(1);
    await page.reload();
    await expect(cartLine).toHaveCount(1);
    // PR #66 review: the dashed card has only its label and is as tall as the cart line right above it.
    const card = page.getByRole('button', { name: '庭に設置したものから追加', exact: true });
    await expect(card).toHaveText('庭に設置したものから追加');
    const heights = async () => [
      (await card.boundingBox()).height,
      (await page.locator('.cart-line').last().boundingBox()).height,
    ];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const [cardHeight, lineHeight] = await heights();
      expect(
        Math.abs(cardHeight - lineHeight),
        `width ${width}: card ${cardHeight} / line ${lineHeight}`,
      ).toBeLessThanOrEqual(1);
    }
    await card.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({ path: `${evidence}/cart-after-reload.png` });
    await page.getByRole('button', { name: /庭に設置したものから追加/ }).click();
    await dialog.getByRole('button', { name: new RegExp(garden.name) }).click();
    // Items already in the cart are shown but cannot be chosen again from the dialog.
    await expect(line).toContainText('カートに入っています');
    await expect(line.getByRole('checkbox')).toBeDisabled();
    await expect(dialog.getByTestId(`garden-item-product:${other.id}`).getByRole('checkbox')).toBeEnabled();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const afterCart = await call(page.request, '/cart').then((r) => r.json());
    expect(afterCart.items.find((item) => item.product.id === product.id)?.quantity).toBe(1);
    expect(afterCart.items.some((item) => item.product.id === other.id)).toBeFalsy();
    await writeFile(`${evidence}/cart-after-reload.json`, JSON.stringify(afterCart, null, 2));
  } finally {
    await call(page.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
  }
});
