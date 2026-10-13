import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('EC to Canvas, quantity, save, product matching, real cart and independent garden copy', async ({
  page,
  request,
}) => {
  const name = `Integration ${Date.now()}`;
  const gardenIds = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/');
    await page.getByRole('link', { name: /Canvasでお気に入りの植物を探す/ }).click();
    await expect(page).toHaveURL('http://127.0.0.1:15173/');
    await page.getByLabel('庭の名前').fill(name);
    await page.getByRole('button', { name: '庭を作成', exact: true }).click();
    await page.waitForURL(/\/gardens\//);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    gardenIds.push(id);
    await page.getByRole('button', { name: '上から見る' }).click();
    await page.getByTestId('asset-tree_oak').click();
    const bounds = await page.locator('[data-testid="garden-canvas"] canvas').boundingBox();
    expect(bounds).toBeTruthy();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await page.getByRole('button', { name: '数量・施工範囲' }).click();
    await page.getByLabel('木の配置個数').fill('2');
    await expect(page.getByLabel('木の配置個数')).toHaveValue('2');
    await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 2 / 2');
    await page.getByRole('button', { name: '植物候補を相談' }).click();
    await page.getByRole('combobox', { name: '日照', exact: true }).selectOption('半日陰');
    await page.getByRole('button', { name: '候補を確認', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('アオキ・ヤブラン');
    await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    await page.getByRole('button', { name: '完成イメージを確認' }).click();
    await expect(page.getByAltText('現在の庭の完成イメージ')).toBeVisible();
    await page.screenshot({ path: 'artifacts/e2e/canvas-completion-image.png', fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    await page.getByRole('button', { name: '配置したものから商品を探す', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '変更を保存して進みますか？' })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page).toHaveURL(/\/gardens\//);
    await page.getByRole('button', { name: '配置したものから商品を探す', exact: true }).click();
    await page.route(`**/api/gardens/${id}`, async (route) => {
      if (route.request().method() === 'PUT')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '保存失敗の確認' }),
        });
      else await route.continue();
    });
    await page.getByRole('button', { name: '保存して進む', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('保存できませんでした');
    await expect(page).toHaveURL(/15173\/gardens\//);
    await page.unroute(`**/api/gardens/${id}`);
    await page.getByRole('button', { name: '保存して進む', exact: true }).click();
    await page.waitForURL(/15186\/materials#/);
    await expect(page.locator('.material-candidate')).toHaveCount(1);
    await page.getByRole('button', { name: 'カートに追加', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('カートを更新');
    await page.reload();
    const cart = await (await page.request.get('/api/cart')).json();
    expect(cart.items.find((item) => item.product.id === 'canvas-oak').quantity).toBe(2);
    await mkdir('artifacts/e2e', { recursive: true });
    await writeFile('artifacts/e2e/canvas-integration-cart.json', JSON.stringify(cart, null, 2));
    await page.screenshot({ path: 'artifacts/e2e/canvas-to-ec.png', fullPage: true });
    const original = await (await request.get(`http://127.0.0.1:18080/api/gardens/${id}`)).json();
    expect(original.objects).toHaveLength(2);
    await page.goto('http://127.0.0.1:15173/');
    const card = page.locator('.garden-card').filter({ hasText: name });
    await card.getByRole('button', { name: 'この庭を複製' }).click();
    await expect(page.locator('.garden-card').filter({ hasText: `${name}（複製）` })).toHaveCount(1);
    const list = await (await request.get('http://127.0.0.1:18080/api/gardens')).json();
    const copy = list.find((entry) => entry.name === `${name}（複製）`);
    gardenIds.push(copy.id);
    const copied = await (await request.get(`http://127.0.0.1:18080/api/gardens/${copy.id}`)).json();
    expect(copied.objects).toHaveLength(2);
    expect(copied.objects[0].id).not.toBe(original.objects[0].id);
    expect((await (await request.get(`http://127.0.0.1:18080/api/gardens/${id}`)).json()).objects).toEqual(
      original.objects,
    );
    await writeFile('artifacts/e2e/canvas-integration-gardens.json', JSON.stringify({ original, copied }, null, 2));
    expect(errors).toEqual([]);
  } finally {
    for (const id of gardenIds) await request.delete(`http://127.0.0.1:18080/api/gardens/${id}`);
  }
});
