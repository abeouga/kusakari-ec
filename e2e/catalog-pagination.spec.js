import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { sql, removeScarceProduct } from './database.js';

function fixtures() {
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  const ids = Array.from({ length: 25 }, (_, index) => `${prefix}-${String(index).padStart(2, '0')}`);
  sql(
    ids
      .map(
        (id, index) => `
    INSERT INTO products(id,sku,name,latin_name,category,description,size_label,care,price_yen,image_url,badge)
    SELECT '${id}','${id}','${id}',latin_name,'${index % 2 ? 'ハーブ' : '庭木'}',description,size_label,care,
      ${1000 + index * 100},image_url,badge FROM products WHERE id='olive';
    INSERT INTO inventory(store_id,product_id,quantity) VALUES(1,'${id}',20);
  `,
      )
      .join('\n'),
  );
  return { prefix, ids };
}

for (const width of [1440, 390, 320]) {
  test(`catalog pagination keeps scroll position and filtering works at ${width}px`, async ({ page }) => {
    const { prefix, ids } = fixtures();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const cards = page.locator('#catalog-product-grid .product-card');
    const pagination = page.getByRole('navigation', { name: '商品一覧のページ' });
    const next = pagination.getByRole('button', { name: '次のページ', exact: true });
    const previous = pagination.getByRole('button', { name: '前のページ', exact: true });
    const current = pagination.locator('[aria-current="page"]');

    // Use a real pointer/keyboard action and compare coordinates after browser layout settles.
    async function switchPage(button, pageNumber, keyboard = false) {
      await pagination.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      expect(before.y).toBeGreaterThan(0);
      if (keyboard) {
        await button.focus();
        await button.press('Enter');
      } else {
        await button.click();
      }
      await expect(current).toHaveText(String(pageNumber));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
      expect(after.x).toBe(before.x);
      await expect(page).toHaveURL('http://127.0.0.1:15186/');
    }

    try {
      await page.goto('/');
      await page.getByLabel('植物を検索').fill(prefix);
      await page.getByLabel('商品の並び順').selectOption('price-asc');
      await expect(cards).toHaveCount(12);
      await expect(cards.first()).toHaveAttribute('data-testid', `product-${ids[0]}`);
      await expect(previous).toBeDisabled();
      await switchPage(next, 2);
      await expect(cards).toHaveCount(12);
      await expect(cards.first()).toHaveAttribute('data-testid', `product-${ids[12]}`);
      await switchPage(next, 3, true);
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toHaveAttribute('data-testid', `product-${ids[24]}`);
      await expect(next).toBeDisabled();
      await expect(page.locator('.catalog-page-summary')).toContainText('25–25件 / 全25件');
      await switchPage(previous, 2);
      await switchPage(pagination.getByRole('button', { name: '1ページ目', exact: true }), 1);
      await switchPage(pagination.getByRole('button', { name: '3ページ目', exact: true }), 3);
      await page.getByLabel('商品の並び順').selectOption('price-desc');
      await expect(current).toHaveText('1');
      await expect(cards.first()).toHaveAttribute('data-testid', `product-${ids[24]}`);
      await switchPage(next, 2);
      await page.getByRole('button', { name: 'ハーブ', exact: true }).click();
      await expect(cards).toHaveCount(12);
      await expect(pagination).toHaveCount(0);
      await page.getByRole('button', { name: 'すべて', exact: true }).click();
      await switchPage(next, 2);
      await page.getByLabel('価格上限', { exact: true }).fill('2200');
      await expect(current).toHaveText('1');
      await expect(page.locator('.catalog-page-summary')).toContainText('全13件');
      await page.getByLabel('植物を検索').fill(ids[0]);
      await expect(cards).toHaveCount(1);
      await expect(pagination).toHaveCount(0);
      await page.getByLabel('植物を検索').fill(`${prefix}-missing`);
      await expect(cards).toHaveCount(0);
      await expect(page.locator('.catalog-page-summary')).toContainText('0–0件 / 全0件');

      await page.reload();
      await page.getByLabel('植物を検索').fill(prefix);
      await page.getByLabel('商品の並び順').selectOption('price-asc');
      await expect(cards).toHaveCount(12);
      await switchPage(next, 2);
      await cards
        .first()
        .getByRole('button', { name: `${ids[12]}の詳細`, exact: true })
        .click();
      await expect(page.getByRole('dialog')).toContainText(ids[12]);
      await page.getByRole('button', { name: '閉じる', exact: true }).click();
      await expect(current).toHaveText('2');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await mkdir('artifacts/catalog-pagination', { recursive: true });
      await cards.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/catalog-pagination/products-${width}.png` });
      await pagination.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/catalog-pagination/pagination-${width}.png` });
      const response = await page.request.get('/api/products?storeId=1');
      expect(response.ok()).toBe(true);
      const products = (await response.json()).filter((product) => ids.includes(product.id));
      expect(products).toHaveLength(25);
      await writeFile(`artifacts/catalog-pagination/api-${width}.json`, JSON.stringify(products, null, 2));
      expect(errors).toEqual([]);
    } finally {
      for (const id of ids) removeScarceProduct(id);
    }
  });
}
