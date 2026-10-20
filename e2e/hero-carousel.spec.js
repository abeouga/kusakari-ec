import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { sql } from './database.js';
import { call, login } from './business-helpers.js';

const current = (page) => page.locator('.hero-slide[aria-hidden="false"]');
const hero = (page) => page.getByRole('region', { name: '公開中の商品' });

async function browse(page) {
  await page.goto('/');
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
  await page.mouse.move(0, 0);
  const response = await page.request.get('/api/products?storeId=1');
  expect(response.status()).toBe(200);
  const products = await response.json();
  expect(products.length).toBeGreaterThan(1);
  return products;
}

async function saveProducts(page, testInfo, storeId, name) {
  const response = await page.request.get(`/api/products?storeId=${storeId}`);
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
  const start = products.findIndex((product) => product.id === 'olive');
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
  await page.clock.runFor(4900);
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
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
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
  await saveProducts(page, testInfo, 1, 'public-products-reloaded');
  await page.screenshot({ path: testInfo.outputPath('desktop-reloaded.png') });
  expect(errors).toEqual([]);
});

test('hover and keyboard focus pause rotation; edge arrows replace central controls', async ({ page }, testInfo) => {
  const products = await browse(page);
  await page.clock.install();
  await hero(page).hover();
  await page.clock.runFor(15000);
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
  await page.mouse.move(0, 0);
  await page.clock.runFor(5100);
  await expect(current(page)).not.toHaveAttribute('data-product-id', 'olive');
  await hero(page).getByRole('button', { name: '前の商品', exact: true }).click();
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
  await page.mouse.move(0, 0);
  await page.clock.runFor(5100);
  await expect(current(page)).not.toHaveAttribute('data-product-id', 'olive');
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
  await browse(page);
  await page.clock.install();
  await page.clock.runFor(15000);
  await expect(current(page)).toHaveAttribute('data-product-id', 'olive');
  await hero(page).getByRole('button', { name: '次の商品', exact: true }).click();
  await page.clock.runFor(600);
  const id = await current(page).getAttribute('data-product-id');
  expect(id).not.toBe('olive');
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

test('store changes reset selection and handle one or zero public products after reload', async ({
  page,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const storeName = `Hero E2E ${suffix}`;
  const ids = [`hero-${suffix}-a`, `hero-${suffix}-b`];
  const storeId = Number(
    sql(`INSERT INTO stores(name,address,latitude,longitude,hours)
    VALUES('${storeName}','E2E fixture',35.68,139.76,'10:00-18:00'); SELECT LAST_INSERT_ID();`),
  );
  expect(storeId).toBeGreaterThan(3);
  ids.forEach((id, index) => {
    sql(`INSERT INTO products(id,sku,name,latin_name,category,description,size_label,care,price_yen,image_url,badge)
      SELECT '${id}','${id}',name,latin_name,category,description,size_label,care,price_yen,image_url,badge
      FROM products WHERE id='${index ? 'rosemary' : 'lavender'}';
      INSERT INTO inventory(store_id,product_id,quantity) VALUES(${storeId},'${id}',5);`);
  });
  let originalStore;
  try {
    await login(page, 'test.user@example.com');
    const cart = await call(page.request, '/cart').then((response) => response.json());
    originalStore = cart.storeId;
    await expect(current(page)).toBeVisible();
    await page.getByRole('button', { name: '店舗を探す', exact: true }).click();
    const card = page.locator('.store-card').filter({ hasText: storeName });
    await card.getByRole('button', { name: 'この店舗で受け取る' }).click();
    await expect(card.getByRole('button', { name: '選択中' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(current(page)).toHaveAttribute('data-product-id', ids[0]);
    await saveProducts(page, testInfo, storeId, 'two-products');
    await hero(page).getByRole('button', { name: '次の商品', exact: true }).click();
    await expect(current(page)).toHaveAttribute('data-product-id', ids[1]);
    sql(`UPDATE inventory SET publication_status='HIDDEN' WHERE store_id=${storeId} AND product_id='${ids[1]}';`);
    await page.reload();
    await expect(current(page)).toHaveAttribute('data-product-id', ids[0]);
    await expect(hero(page).getByRole('button', { name: /の商品$/, exact: false })).toHaveCount(0);
    expect(await saveProducts(page, testInfo, storeId, 'one-product-reloaded')).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('one-product-reloaded.png') });
    sql(`UPDATE inventory SET publication_status='HIDDEN' WHERE store_id=${storeId};`);
    await page.reload();
    await expect(hero(page)).toContainText('現在表示できる商品はありません。');
    await expect(hero(page).getByRole('button')).toHaveCount(0);
    expect(await saveProducts(page, testInfo, storeId, 'zero-products-reloaded')).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath('zero-products-reloaded.png') });
  } finally {
    if (originalStore) {
      const cart = await call(page.request, '/cart').then((response) => response.json());
      const restored = await call(page.request, '/cart/store', 'PUT', {
        storeId: originalStore,
        revision: cart.revision,
      });
      expect(restored.status()).toBe(200);
    }
    sql(
      `UPDATE inventory SET publication_status='HIDDEN' WHERE store_id=${storeId}; UPDATE stores SET enabled=FALSE WHERE id=${storeId};`,
    );
  }
});
