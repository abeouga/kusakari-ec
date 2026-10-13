import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const canvas = 'http://127.0.0.1:15173';
const gardenApi = 'http://127.0.0.1:18080/api/gardens';
async function createGarden(request, count = 1) {
  const response = await request.post(gardenApi, { data: { name: `Commerce ${Date.now()}`, width: 10, depth: 8 } });
  expect(response.ok()).toBeTruthy();
  const garden = await response.json();
  garden.objects = Array.from({ length: count }, (_, i) => ({ id: crypto.randomUUID(), assetId: 'tree_oak',
    position: { x: (i % 8) - 3, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }));
  expect((await request.put(`${gardenApi}/${garden.id}`, { data: garden })).ok()).toBeTruthy();
  return garden;
}
async function details(page) {
  if (!await page.locator('.object-details').evaluate((node) => node.open)) await page.getByTestId('object-details-toggle').click();
}
async function cart(page) { return (await page.request.get('http://127.0.0.1:15186/api/cart')).json(); }

test('Canvas commerce: shared real cart, overlay editing, save, navigation and responsive layout', async ({ page, request }) => {
  const garden = await createGarden(request);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const quotes = [];
  page.on('request', (req) => { if (req.method() === 'POST' && req.url().endsWith('/materials/quote')) quotes.push(req.postDataJSON()); });
  try {
    // Establish the EC cookie before entering Canvas, including a pre-existing cart line.
    const previous = await cart(page);
    expect((await page.request.put('/api/cart/items/canvas-bench', { data: { quantity: 1, revision: previous.revision } })).ok()).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${canvas}/gardens/${garden.id}`);
    const candidate = page.getByTestId('candidate-canvas-oak');
    await expect(candidate).toBeVisible();
    await expect(page.locator('.bag-count')).toHaveText('1');
    await page.getByTestId('object-row-0').click();
    await expect(page.getByTestId('object-toolbar')).toBeVisible();
    await expect(page.getByTestId('position-x')).not.toBeVisible();
    await details(page);
    await page.getByTestId('position-x').fill('1.4');
    await page.getByTestId('rotation-y').fill('35');
    await page.getByTestId('uniform-scale').fill('1.2');
    await page.getByRole('button', { name: '角度を0度に戻す' }).click();
    await expect(page.getByTestId('rotation-y')).toHaveValue('0');
    await page.getByTestId('rotation-y').fill('35');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('object-details-toggle')).toBeFocused();
    await expect(page.getByTestId('position-x')).not.toBeVisible();
    await page.getByTestId('tool-scale').click();
    await expect(page.getByTestId('tool-scale')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('tool-move').click();
    expect(quotes).toHaveLength(1);
    await candidate.getByRole('button', { name: 'カートに追加' }).click();
    await expect(page.locator('.bag-count')).toHaveText('2');
    await details(page);
    await page.getByRole('button', { name: '複製', exact: true }).click();
    await expect(candidate).toContainText('2点・');
    expect((await cart(page)).itemCount).toBe(2); // Placing objects never adds to cart.
    await details(page);
    await page.locator('.object-actions').getByRole('button', { name: '削除' }).click();
    await expect(page.getByTestId('object-row-1')).toHaveCount(0);
    await page.getByTestId('object-row-0').click();
    await page.getByRole('button', { name: '商品・カートパネルを隠す', exact: true }).click();
    await expect(page.locator('#properties-panel')).toHaveCount(0);
    await expect(page.getByTestId('tool-rotate')).toBeVisible();
    await page.getByRole('button', { name: '商品・カートパネルを表示', exact: true }).click();
    await page.getByRole('tab', { name: /^カート内容/ }).click();
    const line = page.getByTestId('cart-line-canvas-oak');
    await line.getByRole('spinbutton').fill('3');
    await line.getByRole('button', { name: '更新', exact: true }).click();
    await expect(page.locator('.bag-count')).toHaveText('4');
    await line.getByRole('button', { name: '削除', exact: true }).click();
    await expect(page.locator('.bag-count')).toHaveText('1');
    await page.getByRole('tab', { name: '商品候補', exact: true }).click();
    await candidate.getByRole('button', { name: 'カートに追加' }).click();
    await expect(page.locator('.bag-count')).toHaveText('2');
    await page.getByRole('link', { name: /^ECでカートを確認/ }).click();
    await expect(page.getByRole('dialog', { name: '変更を保存せずに戻りますか？' })).toBeVisible();
    await page.getByRole('button', { name: '編集を続ける' }).click();
    await page.getByTestId('save-garden').click();
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await page.reload();
    await expect(candidate).toBeVisible();
    await expect(page.locator('.bag-count')).toHaveText('2');
    await page.getByTestId('object-row-0').click();
    await details(page);
    await expect(page.getByTestId('rotation-y')).toHaveValue('35');
    await mkdir('artifacts/e2e', { recursive: true });
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const toolbar = await page.getByTestId('object-toolbar').boundingBox();
      const surface = await page.getByTestId('garden-canvas').boundingBox();
      expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(surface.x + surface.width);
      await page.screenshot({ path: `artifacts/e2e/commerce-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('tab', { name: /^カート内容/ }).click();
    await page.screenshot({ path: 'artifacts/e2e/commerce-cart.png', fullPage: true });
    await page.getByRole('button', { name: '注文手続きへ' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:15186/cart');
    const savedCart = await cart(page);
    expect(savedCart.items.find((item) => item.product.id === 'canvas-oak').quantity).toBe(1);
    expect(savedCart.items.find((item) => item.product.id === 'canvas-bench').quantity).toBe(1);
    const savedGarden = await (await request.get(`${gardenApi}/${garden.id}`)).json();
    expect(savedGarden.objects[0].rotation.y).toBeCloseTo(35 * Math.PI / 180);
    await writeFile('artifacts/e2e/commerce-roundtrip.json', JSON.stringify({ cart: savedCart, garden: savedGarden }, null, 2));
    expect(errors).toEqual([]);
  } finally { await request.delete(`${gardenApi}/${garden.id}`); }
});

test('Canvas commerce: conflict, network failure, quantity limits and origin rejection', async ({ page, request }) => {
  const garden = await createGarden(request);
  try {
    await page.goto(`${canvas}/gardens/${garden.id}`);
    const candidate = page.getByTestId('candidate-canvas-oak');
    await expect(candidate).toBeVisible();
    const before = await cart(page);
    await page.request.put('/api/cart/items/canvas-oak', { data: { quantity: 2, revision: before.revision } });
    await candidate.getByRole('button', { name: 'カートに追加' }).click();
    await expect(page.getByRole('alert')).toContainText('最新のカート');
    await expect(page.locator('.bag-count')).toHaveText('2');
    expect((await cart(page)).items[0].quantity).toBe(2);
    await candidate.getByRole('button', { name: 'カートに追加' }).click();
    await expect(page.locator('.bag-count')).toHaveText('3');
    await page.route('**/api/materials/quote', (route) => route.abort());
    await details(page);
    await page.getByRole('button', { name: '複製', exact: true }).click();
    await expect(page.getByRole('button', { name: '商品候補を再取得' })).toBeVisible();
    await expect(page.getByTestId('object-toolbar')).toBeVisible();
    await page.unroute('**/api/materials/quote');
    await page.getByRole('button', { name: '商品候補を再取得' }).click();
    await expect(candidate).toContainText('2点・');
    await page.route('**/api/cart', (route) => route.abort());
    await page.getByRole('tab', { name: /^カート内容/ }).click();
    await expect(page.getByRole('button', { name: 'カートを再取得' })).toBeVisible();
    await page.unroute('**/api/cart');
    await page.getByRole('button', { name: 'カートを再取得' }).click();
    await expect(page.getByRole('button', { name: 'カートを再取得' })).toHaveCount(0);
    await page.getByTestId('cart-line-canvas-oak').getByRole('spinbutton').fill('100');
    await expect(page.getByTestId('cart-line-canvas-oak').getByRole('button', { name: '更新' })).toBeDisabled();
    await page.getByRole('tab', { name: '商品候補', exact: true }).click();
    const largeGarden = await (await request.get(`${gardenApi}/${garden.id}`)).json();
    largeGarden.objects = Array.from({ length: 100 }, () => ({ ...largeGarden.objects[0], id: crypto.randomUUID() }));
    expect((await request.put(`${gardenApi}/${garden.id}`, { data: largeGarden })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.locator('.commerce-material')).toContainText('99点まで');
    const forbidden = await request.get('/api/cart', { headers: { Origin: 'https://untrusted.example' } });
    expect(forbidden.status()).toBe(403);
    expect(forbidden.headers()['access-control-allow-origin']).toBeUndefined();
    const preflight = await request.fetch('/api/cart/items/canvas-oak', { method: 'OPTIONS', headers: { Origin: canvas, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()['access-control-allow-origin']).toBe(canvas);
    expect(preflight.headers()['access-control-allow-credentials']).toBe('true');
  } finally { await request.delete(`${gardenApi}/${garden.id}`); }
});


test('Canvas commerce: empty state, placement and photo detail editing remain independent of cart', async ({ page, request }) => {
  const garden = await createGarden(request, 0);
  try {
    await page.goto(`${canvas}/gardens/${garden.id}`);
    await expect(page.getByText('庭に素材を配置すると、対応する商品候補を表示します。')).toBeVisible();
    await expect(page.getByTestId('object-toolbar')).toBeVisible();
    await expect(page.getByTestId('tool-move')).toHaveCount(0);
    await page.getByRole('tab', { name: /^カート内容/ }).click();
    await expect(page.getByText('カートは空です。商品候補から追加してください。')).toBeVisible();
    await page.getByRole('tab', { name: '商品候補', exact: true }).click();
    await page.getByRole('button', { name: '上から見る' }).click();
    await page.getByTestId('asset-bench_wood').click();
    const surface = await page.locator('[data-testid="garden-canvas"] canvas').boundingBox();
    await page.mouse.click(surface.x + surface.width / 2, surface.y + surface.height / 2);
    await expect(page.getByTestId('candidate-canvas-bench')).toBeVisible();
    await page.getByTestId('tool-rotate').click();
    await details(page);
    await page.getByTestId('rotation-y').fill('20');
    await expect(page.getByTestId('object-row-1')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('save-garden').click();
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    const document = await (await request.get(`${gardenApi}/${garden.id}`)).json();
    const dataUrl = await page.evaluate(() => {
      const image = window.document.createElement('canvas');
      image.width = 800; image.height = 600;
      const context = image.getContext('2d');
      context.fillStyle = '#708e91'; context.fillRect(0, 0, 800, 600);
      return image.toDataURL();
    });
    const corners = [{x:.1,y:.85},{x:.9,y:.85},{x:.8,y:.2},{x:.2,y:.2}];
    document.photo = { dataUrl, imageWidth: 800, imageHeight: 600, corners, boundary: corners };
    expect((await request.put(`${gardenApi}/${garden.id}`, { data: document })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.locator('.photo-stage')).toBeVisible();
    await expect(page.locator('.photo-guidance')).toHaveCount(0);
    await page.getByTestId('object-row-0').click();
    await expect(page.getByTestId('tool-rotate')).toHaveCount(0);
    await details(page);
    await page.getByTestId('rotation-y').fill('65');
    await page.getByTestId('uniform-scale').fill('1.1');
    await page.getByTestId('save-garden').click();
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await page.reload();
    await page.getByTestId('object-row-0').click();
    await details(page);
    await expect(page.getByTestId('rotation-y')).toHaveValue('65');
    await expect(page.getByTestId('uniform-scale')).toHaveValue('1.1');
    expect((await cart(page)).items).toHaveLength(0);
    await page.screenshot({ path: 'artifacts/e2e/commerce-photo.png', fullPage: true });
    await writeFile('artifacts/e2e/commerce-photo.json', JSON.stringify(await (await request.get(`${gardenApi}/${garden.id}`)).json(), null, 2));
  } finally { await request.delete(`${gardenApi}/${garden.id}`); }
});


test('Canvas commerce: real stock shortage preserves cart and shows the reason', async ({ page, request }) => {
  const garden = await createGarden(request, 0);
  let product;
  try {
    await page.goto(`${canvas}/gardens/${garden.id}`);
    await expect(page.getByRole('tab', { name: /^カート内容/ })).toContainText('0');
    const current = await cart(page);
    const created = await request.post('/api/products', { data: {
      storeId: current.storeId, sku: `stock-${Date.now()}`, name: 'E2E stock limit', stock: 1,
      latinName: '', category: '庭木', description: '専用E2E在庫検証', sizeLabel: '', care: '', priceYen: 100,
      imageUrl: '/images/olive.png', badge: '', nurseryName: '', nurseryAddress: '', sunlight: '未設定',
      useCase: '', careLevel: 1, minTemperatureC: null, heatTolerant: false, droughtTolerant: false,
      ageYears: null, heightCm: null, potDiameterCm: null, familyName: '', floweringDescription: '',
      seasonalCare: '', styleDescription: '', images: [],
    } });
    expect(created.ok(), await created.text()).toBeTruthy();
    product = await created.json();
    expect((await page.request.put(`http://127.0.0.1:15186/api/cart/items/${product.id}`, { data: { quantity: 1, revision: current.revision } })).ok()).toBeTruthy();
    await page.getByRole('tab', { name: /^カート内容/ }).click();
    const line = page.getByTestId(`cart-line-${product.id}`);
    await expect(line).toBeVisible();
    await line.getByRole('spinbutton').fill('2');
    await line.getByRole('button', { name: '更新', exact: true }).click();
    await expect(page.locator('.commerce-panel [role="alert"]')).toContainText('在庫');
    expect((await cart(page)).items.find((item) => item.product.id === product.id).quantity).toBe(1);
    await line.getByRole('button', { name: '削除', exact: true }).click();
    await expect(line).toHaveCount(0);
    await page.reload();
    expect((await cart(page)).items).toHaveLength(0);
    await page.screenshot({ path: 'artifacts/e2e/commerce-stock-reloaded.png', fullPage: true });
  } finally {
    if (product) await request.delete(`/api/products/${product.id}`);
    await request.delete(`${gardenApi}/${garden.id}`);
  }
});
