import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput } from './business-helpers.js';

test.use({ trace: 'off' });

// Issue #44: the product pages show a real heading and an arrow "戻る" button named for screen readers.
test('seller returns from product registration and product editing with the back button', async ({ page }) => {
  const dir = 'artifacts/business/product-back';
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const created = await call(page.request, '/products', 'POST', productInput());
  expect(created.status(), await created.text()).toBe(200);
  const product = await created.json();
  const heading = page.locator('.workspace-main h1');
  const back = page.getByRole('button', { name: '商品一覧へ戻る', exact: true });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${ec}/seller/products/new`);
    await expect(heading).toHaveText('商品登録');
    await expect(page.locator('.workspace-main')).not.toContainText('Kusakari');
    await expect(page.locator('.product-form')).toBeVisible();
    await expect(back).toHaveText('戻る');
    await expect(back.locator('svg.lucide-arrow-left')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(back).toBeVisible();
    await page.screenshot({ path: `${dir}/create-${width}.png`, fullPage: true });

    await back.click();
    await expect(page).toHaveURL(`${ec}/seller/products`);
    await expect(heading).toHaveText('商品管理');

    await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
    const row = page.getByTestId(`manage-${product.id}`);
    await row.getByRole('button', { name: '編集', exact: true }).click();
    await expect(page.locator('.product-form')).toBeVisible();
    await expect(back).toHaveText('戻る');
    await expect(back.locator('svg.lucide-arrow-left')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/edit-${width}.png`, fullPage: true });

    await back.click();
    await expect(page.locator('.product-form')).toHaveCount(0);
    await expect(row).toBeVisible();
    await page.reload();
    await expect(heading).toHaveText('商品管理');
    await page.screenshot({ path: `${dir}/list-after-reload-${width}.png`, fullPage: true });
  }
  const listed = await (await call(page.request, '/seller/products?storeId=1')).json();
  const saved = listed.find((item) => item.id === product.id);
  expect(saved?.sku).toBe(product.sku);
  await writeFile(`${dir}/product.json`, JSON.stringify({ id: saved.id, sku: saved.sku, name: saved.name }, null, 2));
  expect(errors).toEqual([]);
});
