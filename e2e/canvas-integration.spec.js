import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

test('EC to Canvas to project shopping list to selected purchase and persisted cart', async ({ page, request }) => {
  let id;
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /Canvasでお気に入りの植物を探す/ }).click();
    await expect(page).toHaveURL('http://127.0.0.1:15173/');
    await page.getByLabel('庭の名前', { exact: true }).fill('庭別購入の統合-' + randomUUID().slice(0, 8));
    await page.getByRole('button', { name: '庭を作成', exact: true }).click();
    await page.waitForURL(/\/gardens\//, { waitUntil: 'domcontentloaded' });
    id = new URL(page.url()).pathname.split('/').at(-1);
    await page.getByLabel('商品を検索', { exact: true }).fill('ベンチ');
    await page.getByTestId('browse-canvas-bench').getByRole('button', { name: '庭に配置', exact: true }).click();
    await page.getByTestId('garden-canvas').locator('canvas').click({ position: { x: 350, y: 340 } });
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    await page.getByRole('button', { name: 'ECで買い物リストを確認', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:15286/cart/gardens/' + id);
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await page.getByRole('button', { name: '全選択', exact: true }).click();
    await page.getByRole('button', { name: '選択した商品をカートに追加', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:15286/cart');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: '庭の買い物リスト', exact: true }).click();
    await expect(page.getByTestId('garden-list-' + id)).toContainText('必要数 1点');
    const cart = await page.request.get('/api/cart').then(r => r.json());
    expect(cart.items[0].product.id).toBe('canvas-bench');
    expect(cart.items[0].quantity).toBe(1);
    await mkdir('artifacts/e2e', { recursive: true });
    await page.screenshot({ path: 'artifacts/e2e/canvas-shopping-journey.png', fullPage: true });
    await writeFile('artifacts/e2e/canvas-shopping-cart.json', JSON.stringify(cart, null, 2));
  } finally { if (id) await request.delete('http://127.0.0.1:18081/api/gardens/' + id); }
});
