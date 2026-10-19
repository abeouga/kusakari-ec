import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const canvas = 'http://127.0.0.1:15173';
const api = 'http://127.0.0.1:18081/api';
const ec = 'http://127.0.0.1:15286';
async function fixture(request) {
  const garden = await request.post(api + '/gardens', { data: { name: 'ECリスト統合-' + randomUUID().slice(0, 8) } }).then(r => r.json());
  const object = { id: randomUUID(), assetId: 'bench_wood', position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  const response = await request.put(api + '/gardens/' + garden.id, { data: { ...garden, objects: [object] } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
test('garden list reflects edits and stays independent of existing EC cart quantities', async ({ page, request }) => {
  const garden = await fixture(request);
  try {
    const cart = await page.request.get(ec + '/api/cart').then(r => r.json());
    expect((await page.request.put(ec + '/api/cart/items/rosemary', { data: { quantity: 2, revision: cart.revision } })).ok()).toBeTruthy();
    await page.goto(canvas + '/gardens/' + garden.id, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    await expect(page.getByTestId('needed-quantity')).toHaveText('必要数 1点');
    await expect(page.getByRole('tab', { name: /カート内容/ })).toHaveCount(0);
    await expect(page.locator('#commerce-list').getByRole('spinbutton')).toHaveCount(0);
    await page.getByTestId('object-details-toggle').click();
    await page.getByRole('button', { name: '複製', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('needed-quantity')).toHaveText('必要数 2点');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    const unchanged = await page.request.get(ec + '/api/cart').then(r => r.json());
    expect(unchanged.items[0].quantity).toBe(2);
    expect(unchanged.items[0].product.id).toBe('rosemary');
    await page.getByTestId('object-details-toggle').click();
    await page.getByRole('button', { name: '削除', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('needed-quantity')).toHaveText('必要数 1点');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await mkdir('artifacts/e2e', { recursive: true });
    await page.screenshot({ path: 'artifacts/e2e/canvas-shopping-independent.png' });
    const saved = await request.get(api + '/gardens/' + garden.id).then(r => r.json());
    await writeFile('artifacts/e2e/canvas-shopping-independent.json', JSON.stringify(saved, null, 2));
  } finally { await request.delete(api + '/gardens/' + garden.id); }
});
test('EC outage does not prevent list placement, editing or automatic garden saving', async ({ page, request }) => {
  const garden = await fixture(request);
  try {
    await page.route(ec + '/api/**', route => route.abort('failed'));
    await page.goto(canvas + '/gardens/' + garden.id, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    const target = page.getByTestId('garden-canvas').locator('canvas');
    const bounds = await target.boundingBox();
    await page.getByTestId('shopping-line-bench_wood').dragTo(target, {
      sourcePosition: { x: 20, y: 20 }, targetPosition: { x: bounds.width * 0.6, y: bounds.height * 0.5 },
    });
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 2 / 2');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    expect((await request.get(api + '/gardens/' + garden.id).then(r => r.json())).objects).toHaveLength(2);
    await page.unroute(ec + '/api/**');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 2 / 2');
  } finally { await request.delete(api + '/gardens/' + garden.id); }
});
