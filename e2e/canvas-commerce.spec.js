import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, canvas, login, call, prepareMember, seedGardenPhoto } from './business-helpers.js';

// Issue #113: the garden belongs to the signed-in buyer (canvas#64), so the fixture is made through the real Canvas API
// with that session. Canvas shows the 3D garden only after the garden's photo is confirmed (Canvas issue #15).
async function fixture(page) {
  prepareMember(await login(page, 'test.user@example.com'), 'USER');
  const created = await call(
    page.request,
    '/gardens',
    'POST',
    { name: 'ECリスト統合-' + randomUUID().slice(0, 8) },
    canvas,
  );
  expect(created.status()).toBe(201);
  const garden = await seedGardenPhoto(page, await created.json());
  const object = {
    id: randomUUID(),
    assetId: 'bench_wood',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
  const response = await call(page.request, `/gardens/${garden.id}`, 'PUT', { ...garden, objects: [object] }, canvas);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

/** @param {import('@playwright/test').Page} page */
async function dropListLine(page) {
  const target = page.getByTestId('garden-canvas').locator('canvas');
  const bounds = await target.boundingBox();
  await page.getByTestId('shopping-line-bench_wood').dragTo(target, {
    sourcePosition: { x: 20, y: 20 },
    targetPosition: { x: bounds.width * 0.6, y: bounds.height * 0.5 },
  });
}

test('garden list reflects edits and stays independent of existing EC cart quantities', async ({ page }) => {
  const garden = await fixture(page);
  try {
    const cart = await call(page.request, '/cart').then((r) => r.json());
    expect(
      (await call(page.request, '/cart/items/rosemary', 'PUT', { quantity: 2, revision: cart.revision })).ok(),
    ).toBeTruthy();
    await page.goto(`${canvas}/gardens/${garden.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    const line = page.getByTestId('shopping-line-bench_wood');
    await expect(line.getByTestId('placement-count')).toHaveAttribute('aria-label', '庭に設置した数 1');
    await expect(page.getByRole('tab', { name: /カート内容/ })).toHaveCount(0);
    await expect(page.locator('#commerce-list').getByRole('spinbutton')).toHaveCount(0);
    // Placing one more from the list counts it in the list, not in the EC cart.
    await dropListLine(page);
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 2 / 2');
    await expect(line.getByTestId('placement-count')).toHaveAttribute('aria-label', '庭に設置した数 2');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    const unchanged = await call(page.request, '/cart').then((r) => r.json());
    expect(unchanged.items).toHaveLength(1);
    expect(unchanged.items[0].quantity).toBe(2);
    expect(unchanged.items[0].product.id).toBe('rosemary');
    // Removing a placed object lowers the count again.
    await page.getByRole('tab', { name: '商品一覧', exact: true }).click();
    await page.getByTestId('object-row-1').click();
    // The side panel keeps its own keys; the editor's Delete key works once the focus leaves the panel.
    await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    await expect(line.getByTestId('placement-count')).toHaveAttribute('aria-label', '庭に設置した数 1');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await mkdir('artifacts/e2e', { recursive: true });
    await page.screenshot({ path: 'artifacts/e2e/canvas-shopping-independent.png' });
    const saved = await call(page.request, `/gardens/${garden.id}`, 'GET', undefined, canvas).then((r) => r.json());
    expect(saved.objects).toHaveLength(1);
    expect((await call(page.request, '/cart').then((r) => r.json())).items).toEqual(unchanged.items);
    await writeFile('artifacts/e2e/canvas-shopping-independent.json', JSON.stringify(saved, null, 2));
  } finally {
    await call(page.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
  }
});

test('EC outage does not prevent list placement, editing or automatic garden saving', async ({ page }) => {
  const garden = await fixture(page);
  try {
    await page.goto(`${canvas}/gardens/${garden.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    // Explicit fault injection once the editor is open: the browser's requests to the EC commerce API (catalogue,
    // references, shopping lists) are cut off. The EC sign-in endpoints (/api/auth/*: session and CSRF token) stay
    // reachable, because the Canvas session is the EC session (canvas#64) and saving needs its CSRF token.
    await page.route(`${ec}/api/**`, (route) =>
      route.request().url().startsWith(`${ec}/api/auth/`) ? route.continue() : route.abort('failed'),
    );
    await page.getByRole('tab', { name: /買い物リスト/ }).click();
    await dropListLine(page);
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 2 / 2');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    expect(
      (await call(page.request, `/gardens/${garden.id}`, 'GET', undefined, canvas).then((r) => r.json())).objects,
    ).toHaveLength(2);
    await page.unroute(`${ec}/api/**`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 2 / 2');
  } finally {
    await call(page.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
  }
});
