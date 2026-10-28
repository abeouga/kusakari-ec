import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, canvas, login, call, add, prepareMember, productInput } from './business-helpers.js';

const evidence = 'artifacts/shopping-picker';

test('product picker saves to one owned garden, remains after reload and transfers to cart', async ({
  page,
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  await login(page, 'test.user@example.com');
  const products = await call(page.request, '/products?storeId=1').then((r) => r.json());
  const beforeCart = await call(page.request, '/cart').then((r) => r.json());
  const product = products.find(
    (p) => p.active && p.stock > (beforeCart.items.find((i) => i.product.id === p.id)?.quantity ?? 0) + 1,
  );
  expect(product).toBeTruthy();
  const gardens = [];
  const other = await browser.newContext();
  try {
    for (const suffix of ['A', 'B']) {
      const response = await call(
        page.request,
        '/gardens',
        'POST',
        { name: `追加先検証 ${suffix} ${randomUUID().slice(0, 8)}` },
        canvas,
      );
      expect(response.status()).toBe(201);
      gardens.push(await response.json());
    }
    const [a, b] = gardens;
    await page.goto(ec);
    const card = page.getByTestId(`product-${product.id}`);
    const open = card.getByRole('button', { name: `${product.name}を買い物リストに追加`, exact: true });
    const cartButton = card.getByRole('button', { name: `${product.name}をカートに追加`, exact: true });
    await expect(open).toBeVisible();
    const listBounds = await open.boundingBox();
    const cartBounds = await cartButton.boundingBox();
    expect(listBounds.x + listBounds.width).toBeLessThanOrEqual(cartBounds.x);
    await open.click();
    const dialog = page.getByRole('dialog', { name: '買い物リストに追加', exact: true });
    const choose = dialog.getByRole('button', { name: `${a.name}の買い物リストに追加`, exact: true });
    await expect(choose).toBeVisible();
    await expect(dialog.getByRole('button', { name: `${b.name}の買い物リストに追加`, exact: true })).toBeVisible();
    const image = choose.getByRole('img');
    await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0)).toBeTruthy();
    await page.screenshot({ path: `${evidence}/picker-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(choose).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    await page.screenshot({ path: `${evidence}/picker-mobile.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await choose.click();
    await expect(choose).toContainText('追加済み');
    await expect(dialog.getByRole('status')).toContainText(`${a.name}に保存しました`);
    expect(await call(page.request, '/cart').then((r) => r.json())).toEqual(beforeCart);
    expect(
      (await call(page.request, `/gardens/${a.id}`, 'GET', undefined, canvas).then((r) => r.json())).objects,
    ).toHaveLength(0);
    const detail = await call(page.request, `/shopping-lists/${a.id}`).then((r) => r.json());
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].products[0].id).toBe(product.id);
    expect(detail.items[0].quantity).toBe(1);
    expect((await call(page.request, `/shopping-lists/${b.id}`).then((r) => r.json())).items).toHaveLength(0);
    const repeated = await Promise.all(
      [1, 2].map(() => call(page.request, `/shopping-lists/${a.id}/items/${product.id}`, 'PUT')),
    );
    for (const response of repeated) {
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.items[0].quantity).toBe(1);
      expect(result.listRevision).toBe(detail.listRevision);
    }
    // Another authenticated owner cannot read or write this garden's list.
    const otherPage = await other.newPage();
    await login(otherPage, 'test.seller@example.com');
    expect((await call(otherPage.request, `/shopping-lists/${a.id}`)).status()).toBe(404);
    expect((await call(otherPage.request, `/shopping-lists/${a.id}/items/${product.id}`, 'PUT')).status()).toBe(404);
    const foreignLists = await call(otherPage.request, '/shopping-lists').then((r) => r.json());
    expect(foreignLists.some((list) => list.gardenId === a.id)).toBeFalsy();
    await page.goto(`${ec}/cart/gardens/${a.id}`);
    await page.reload();
    const line = page.getByTestId(`ec-shopping-line-product:${product.id}`);
    await expect(line).toContainText(product.name);
    await expect(line).toContainText('必要数 1点');
    await page.screenshot({ path: `${evidence}/list-reloaded.png` });
    const stale = await call(page.request, `/cart/shopping-lists/${a.id}/items`, 'POST', {
      gardenRevision: detail.revision,
      listRevision: 0,
      cartRevision: beforeCart.revision,
      items: [{ key: detail.items[0].key, productId: product.id }],
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).code).toBe('SHOPPING_LIST_CHANGED');
    await line.getByRole('checkbox').check();
    await page.getByRole('button', { name: '選択した商品をカートに追加', exact: true }).click();
    await expect(page).toHaveURL(`${ec}/cart`);
    const afterCart = await call(page.request, '/cart').then((r) => r.json());
    expect(afterCart.items.find((i) => i.product.id === product.id).quantity).toBe(
      (beforeCart.items.find((i) => i.product.id === product.id)?.quantity ?? 0) + 1,
    );
    expect((await call(page.request, `/shopping-lists/${a.id}`).then((r) => r.json())).items[0].quantity).toBe(1);
    await writeFile(`${evidence}/saved-list.json`, JSON.stringify({ detail, afterCart }, null, 2));
  } finally {
    await other.close();
    for (const garden of gardens) await call(page.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
  }
});

test('picker creates a numbered garden project and saves the product into it', async ({ page, browser }) => {
  await mkdir(evidence, { recursive: true });
  await login(page, 'test.user@example.com');
  const products = await call(page.request, '/products?storeId=1').then((r) => r.json());
  const product = products.find((p) => p.active);
  expect(product).toBeTruthy();
  const beforeCart = await call(page.request, '/cart').then((r) => r.json());
  const before = await call(page.request, '/shopping-lists').then((r) => r.json());
  const created = [];
  const other = await browser.newContext();
  try {
    await page.goto(ec);
    await page
      .getByTestId(`product-${product.id}`)
      .getByRole('button', { name: `${product.name}を買い物リストに追加`, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: '買い物リストに追加', exact: true });
    const create = dialog.getByRole('button', {
      name: '新しい庭プロジェクトを作成して買い物リストに追加',
      exact: true,
    });
    await expect(create).toBeVisible();
    await page.screenshot({ path: `${evidence}/create-card.png` });
    await create.dblclick();
    await expect(dialog.getByRole('status')).toContainText('に保存しました');
    const after = await call(page.request, '/shopping-lists').then((r) => r.json());
    const added = after.filter((list) => !before.some((old) => old.gardenId === list.gardenId));
    created.push(...added);
    expect(added).toHaveLength(1);
    const numbers = before.map((l) => /^買い物リスト(\d+)$/.exec(l.name)).filter(Boolean).map((m) => Number(m[1]));
    expect(added[0].name).toBe(`買い物リスト${Math.max(0, ...numbers) + 1}`);
    await page.screenshot({ path: `${evidence}/create-done.png` });
    const garden = await call(page.request, `/gardens/${added[0].gardenId}`, 'GET', undefined, canvas).then((r) =>
      r.json(),
    );
    expect(garden.objects).toHaveLength(0);
    const detail = await call(page.request, `/shopping-lists/${added[0].gardenId}`).then((r) => r.json());
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].products[0].id).toBe(product.id);
    expect(detail.items[0].quantity).toBe(1);
    expect(await call(page.request, '/cart').then((r) => r.json())).toEqual(beforeCart);
    await page.goto(`${ec}/cart/gardens/${added[0].gardenId}`);
    await expect(page.getByTestId(`ec-shopping-line-product:${product.id}`)).toContainText(product.name);
    const otherPage = await other.newPage();
    await login(otherPage, 'test.seller@example.com');
    expect((await call(otherPage.request, `/shopping-lists/${added[0].gardenId}`)).status()).toBe(404);
    await writeFile(`${evidence}/created-garden.json`, JSON.stringify({ garden, detail }, null, 2));
  } finally {
    await other.close();
    for (const list of created) await call(page.request, `/gardens/${list.gardenId}`, 'DELETE', undefined, canvas);
  }
});

test('a product saved from EC appears in the Canvas list and placing it does not count it twice', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await login(page, 'test.user@example.com');
  const products = await call(page.request, '/products?storeId=1').then((r) => r.json());
  const product = products.find(
    (p) =>
      p.active &&
      [1, 2, 3, 4].includes(p.modelComposition?.version) &&
      p.modelComposition.catalogVersion === p.modelComposition.version,
  );
  expect(product, 'an active product with a Canvas plant model').toBeTruthy();
  const created = await call(
    page.request,
    '/gardens',
    'POST',
    { name: `EC追加の配置 ${randomUUID().slice(0, 8)}` },
    canvas,
  );
  expect(created.status()).toBe(201);
  const garden = await created.json();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    expect((await call(page.request, `/shopping-lists/${garden.id}/items/${product.id}`, 'PUT')).status()).toBe(200);
    await page.goto(`${canvas}/gardens/${garden.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await page.getByRole('tab', { name: '買い物リスト（1）', exact: true }).click();
    const line = page.getByTestId(`shopping-line-${product.id}`);
    await expect(line).toContainText(product.name);
    await expect(line.getByTestId('needed-quantity')).toHaveText('必要数 1点');
    await expect(line.getByTestId('unplaced-ec-item')).toBeVisible();
    const target = page.getByTestId('garden-canvas').locator('canvas');
    const drop = async (x) => {
      const bounds = await target.boundingBox();
      await line.dragTo(target, {
        sourcePosition: { x: 35, y: 35 },
        targetPosition: { x: bounds.width * x, y: bounds.height * 0.5 },
      });
    };
    // Placement needs the Canvas product model, which loads with the EC catalog.
    await expect(line.getByRole('button', { name: '庭に配置', exact: true })).toBeEnabled();
    await drop(0.5);
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await expect(line.getByTestId('needed-quantity')).toHaveText('必要数 1点');
    await expect(line.getByTestId('unplaced-ec-item')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '買い物リスト（1）', exact: true })).toBeVisible();
    const one = await call(page.request, `/shopping-lists/${garden.id}`).then((r) => r.json());
    expect(one.items.map((item) => [item.key, item.quantity])).toEqual([[`product:${product.id}`, 1]]);
    await drop(0.65);
    await expect(line.getByTestId('needed-quantity')).toHaveText('必要数 2点');
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await expect
      .poll(() =>
        call(page.request, `/shopping-lists/${garden.id}`)
          .then((r) => r.json())
          .then((d) => d.items[0].quantity),
      )
      .toBe(2);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await page.getByRole('tab', { name: '買い物リスト（2）', exact: true }).click();
    await expect(line.getByTestId('needed-quantity')).toHaveText('必要数 2点');
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 2 / 2');
    await expect.poll(() => line.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBeTruthy();
    await page.screenshot({ path: `${evidence}/canvas-ec-item-reloaded.png` });
    const saved = await call(page.request, `/gardens/${garden.id}`, 'GET', undefined, canvas).then((r) => r.json());
    expect(saved.objects.filter((o) => o.productId === product.id)).toHaveLength(2);
    await writeFile(
      `${evidence}/canvas-ec-item.json`,
      JSON.stringify(
        {
          garden: saved,
          savedItems: await call(page.request, `/shopping-lists/${garden.id}/saved-items`).then((r) => r.json()),
          detail: await call(page.request, `/shopping-lists/${garden.id}`).then((r) => r.json()),
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  } finally {
    await call(page.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
  }
});

test('unavailable list shows an error with retry; signed-out users must log in', async ({ page, request }) => {
  expect((await request.get(`${ec}/api/shopping-lists`)).status()).toBe(401);
  await login(page, 'test.user@example.com');
  await page.goto(ec);
  await page.route('**/api/shopping-lists', (route) => route.abort());
  await page
    .locator('.product-card')
    .first()
    .getByRole('button', { name: /を買い物リストに追加$/ })
    .click();
  const dialog = page.getByRole('dialog', { name: '買い物リストに追加', exact: true });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '再取得', exact: true })).toBeVisible();
  await page.unroute('**/api/shopping-lists');
  await dialog.getByRole('button', { name: '再取得', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('EC-B24/B25 cart counts, stock with the cart, select-all reasons and retry after a lost transfer', async ({
  page,
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  const products = [];
  let garden;
  try {
    prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
    for (const stock of [2, 5]) {
      const created = await call(seller.request, '/products', 'POST', { ...productInput(), stock });
      expect(created.status(), await created.text()).toBe(200);
      products.push(await created.json());
    }
    const [scarce, plenty] = products;
    await login(page, 'test.user@example.com');
    const cart = await call(page.request, '/cart').then((r) => r.json());
    if (cart.storeId !== 1)
      expect((await call(page.request, '/cart/store', 'PUT', { storeId: 1, revision: cart.revision })).status()).toBe(200);
    const created = await call(page.request, '/gardens', 'POST', { name: `在庫判定 ${randomUUID().slice(0, 8)}` }, canvas);
    expect(created.status()).toBe(201);
    garden = await created.json();
    for (const product of products)
      expect((await call(page.request, `/shopping-lists/${garden.id}/items/${product.id}`, 'PUT')).status()).toBe(200);
    await add(page.request, scarce.id, 1);

    // EC-B24: "カートにn点" only for products in the cart; stock is short when stock < cart + list quantity.
    await page.goto(`${ec}/cart/gardens/${garden.id}`);
    const scarceLine = page.getByTestId(`ec-shopping-line-product:${scarce.id}`);
    const plentyLine = page.getByTestId(`ec-shopping-line-product:${plenty.id}`);
    await expect(scarceLine).toContainText('店舗在庫 2点・カートに1点');
    await expect(scarceLine).not.toContainText('在庫不足');
    await expect(plentyLine).toContainText('店舗在庫 5点');
    await expect(plentyLine).not.toContainText('カートに');
    await add(page.request, scarce.id, 2);
    await page.reload();
    await expect(scarceLine).toContainText('カートに2点');
    await expect(scarceLine).toContainText('在庫不足');
    await expect(scarceLine.getByRole('checkbox')).toBeDisabled();

    // EC-B25: select-all says which products it left out and why.
    await page.getByRole('button', { name: '全選択', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '追加できないため選択していません' })).toContainText(
      `${scarce.name}（在庫不足）`,
    );
    await expect(plentyLine.getByRole('checkbox')).toBeChecked();
    await expect(scarceLine.getByRole('checkbox')).not.toBeChecked();

    // 4a (fault injection): a lost request keeps the selection and can be retried.
    await page.route('**/api/cart/shopping-lists/**', (route) => route.abort());
    await page.getByRole('button', { name: '選択した商品をカートに追加', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'カートに追加されていません' })).toBeVisible();
    await expect(plentyLine.getByRole('checkbox')).toBeChecked();
    const unchanged = await call(page.request, '/cart').then((r) => r.json());
    expect(unchanged.items.some((item) => item.product.id === plenty.id)).toBe(false);
    await page.unroute('**/api/cart/shopping-lists/**');
    await page.getByRole('button', { name: '再実行', exact: true }).click();
    await expect(page).toHaveURL(`${ec}/cart`);
    const after = await call(page.request, '/cart').then((r) => r.json());
    expect(after.items.find((item) => item.product.id === plenty.id)?.quantity).toBe(1);
    expect(after.items.find((item) => item.product.id === scarce.id)?.quantity).toBe(2);
    await page.goto(`${ec}/cart/gardens/${garden.id}`);
    await page.reload();
    await expect(plentyLine).toContainText('カートに1点');
    await page.screenshot({ path: `${evidence}/stock-and-retry-reloaded.png` });
    await writeFile(
      `${evidence}/stock-and-retry.json`,
      JSON.stringify(
        { cart: after, list: await call(page.request, `/shopping-lists/${garden.id}`).then((r) => r.json()) },
        null,
        2,
      ),
    );
  } finally {
    // Only this test's products leave the shared buyer's cart and the catalogue.
    for (const product of products) {
      const current = await call(page.request, '/cart').then((r) => r.json());
      if (current.items.some((item) => item.product.id === product.id))
        await call(page.request, `/cart/items/${product.id}`, 'PUT', { quantity: 0, revision: current.revision });
    }
    if (products.length)
      await call(seller.request, '/seller/products/status', 'PATCH', {
        storeId: 1,
        productIds: products.map((p) => p.id),
        status: 'HIDDEN',
      });
    if (garden) await call(page.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
    await sellerContext.close();
  }
});
