import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, login, call } from './business-helpers.js';

const evidence = 'artifacts/business/materials-removed';

// Issue #86: the old "材料リストから探す" JSON screen is gone; the Canvas quote API stays for the Canvas backend.
test('top page and /materials no longer show the material JSON screen', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page, 'test.user@example.com');
  await page.goto(`${ec}/`);
  await expect(page.getByTestId('product-olive')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('product-olive')).toBeVisible();
  await expect(page.getByRole('button', { name: '材料リストから探す' })).toHaveCount(0);
  await expect(page.locator('.material-banner')).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/top.png`, fullPage: true });

  const items = [{ materialCode: 'plant.olive', quantity: 1, unit: 'piece' }];
  await page.goto(`${ec}/materials#${new URLSearchParams({ 'canvas-items': JSON.stringify(items) })}`);
  await page.reload();
  await expect(page.getByText('URLを確認するか、メニューからページを選んでください。')).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '商品候補を検索' })).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/materials-path.png`, fullPage: true });

  // The Canvas backend still calls this API, so only the EC screen was removed.
  const quote = await call(page.request, '/materials/quote', 'POST', { storeId: 1, items });
  expect(quote.status()).toBe(200);
  const body = await quote.json();
  expect(body[0].materialCode).toBe('plant.olive');
  expect(errors).toEqual([]);
  await writeFile(`${evidence}/api.json`, JSON.stringify({ quote: body }, null, 2));
});
