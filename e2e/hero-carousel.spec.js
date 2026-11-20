import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const current = (page) => page.locator('.hero-slide[aria-hidden="false"]');
const hero = (page) => page.getByRole('region', { name: '公開中の商品' });

// The carousel starts at the first public product. Store 1's olive used to be pinned first; V7 marked it deleted.
async function browse(page) {
  await page.goto('/');
  // The carousel shows every store's public products in the catalog order (issue #119).
  const response = await page.request.get('/api/products');
  expect(response.status()).toBe(200);
  const products = await response.json();
  expect(products.length).toBeGreaterThan(1);
  await expect(current(page)).toHaveAttribute('data-product-id', products[0].id);
  await page.mouse.move(0, 0);
  return products;
}

async function saveProducts(page, testInfo, storeId, name) {
  const response = await page.request.get(storeId ? `/api/products?storeId=${storeId}` : '/api/products');
  expect(response.status()).toBe(200);
  const products = await response.json();
  await writeFile(testInfo.outputPath(`${name}.json`), JSON.stringify(products, null, 2));
  return products;
}

test('all public products advance every five seconds, loop and open the matching detail', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const products = await browse(page);
  const start = 0;
  const first = products[start].id;
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await page.clock.runFor(4900);
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await page.clock.runFor(200);
  for (let step = 1; step <= products.length; step++) {
    const product = products[(start + step) % products.length];
    await expect(current(page)).toHaveAttribute('data-product-id', product.id);
    await expect(current(page).locator('img')).toHaveAttribute('src', product.imageUrl);
    await expect(current(page).locator('strong')).toHaveText(product.name);
    await expect(current(page).locator('em')).toHaveText(product.latinName);
    if (step < products.length) await page.clock.runFor(5000);
  }
  await hero(page).getByRole('button', { name: '次の商品', exact: true }).click();
  const next = products[(start + 1) % products.length];
  await expect(current(page)).toHaveAttribute('data-product-id', next.id);
  await page.clock.runFor(600);
  await current(page).getByRole('button').click();
  await expect(page.getByRole('dialog')).toContainText(next.sku);
  await expect(page.getByRole('dialog').getByRole('heading', { name: next.name, exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(10000);
  await expect(current(page)).toHaveAttribute('data-product-id', next.id);
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).click();
  await hero(page).getByRole('button', { name: '前の商品', exact: true }).click();
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await saveProducts(page, testInfo, null, 'public-products-reloaded');
  await page.screenshot({ path: testInfo.outputPath('desktop-reloaded.png') });
  expect(errors).toEqual([]);
});

test('hover and keyboard focus pause rotation; edge arrows replace central controls', async ({ page }, testInfo) => {
  const products = await browse(page);
  const first = products[0].id;
  // The first product list can take seconds; start from a paused clock so the carousel has not moved on its own.
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await hero(page).hover();
  await page.clock.runFor(15000);
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await page.mouse.move(0, 0);
  await page.clock.runFor(5100);
  await expect(current(page)).not.toHaveAttribute('data-product-id', first);
  await hero(page).getByRole('button', { name: '前の商品', exact: true }).click();
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await page.mouse.move(0, 0);
  await page.clock.runFor(5100);
  await expect(current(page)).not.toHaveAttribute('data-product-id', first);
  await hero(page).getByRole('button', { name: '前の商品', exact: true }).focus();
  await page.keyboard.press('Tab');
  const selected = await current(page).getAttribute('data-product-id');
  await page.clock.runFor(15000);
  await expect(current(page)).toHaveAttribute('data-product-id', selected);
  await expect(hero(page).getByRole('button', { name: /自動送り/ })).toHaveCount(0);
  const bounds = await hero(page).boundingBox();
  const previous = await hero(page).getByRole('button', { name: '前の商品', exact: true }).boundingBox();
  const next = await hero(page).getByRole('button', { name: '次の商品', exact: true }).boundingBox();
  expect(previous.x - bounds.x).toBeLessThan(10);
  expect(bounds.x + bounds.width - next.x - next.width).toBeLessThan(10);
  expect(products.length).toBeGreaterThan(1);
  await page.screenshot({ path: testInfo.outputPath('edge-arrows.png') });
});

test('mobile layout and reduced motion keep product details operable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const first = (await browse(page))[0].id;
  await page.clock.install();
  await page.clock.runFor(15000);
  await expect(current(page)).toHaveAttribute('data-product-id', first);
  await hero(page).getByRole('button', { name: '次の商品', exact: true }).click();
  await page.clock.runFor(600);
  const id = await current(page).getAttribute('data-product-id');
  expect(id).not.toBe(first);
  const bounds = await hero(page).boundingBox();
  for (const button of await hero(page).getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  await current(page).getByRole('button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
