import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { ec, canvas, login, call, seedGardenPhoto } from './business-helpers.js';

// This explicit acceptance run preserves its order and garden in the development DB.
// If rerun after purchase, verify the recorded order; never submit a second purchase.
// Issue #113 (DB v3): the olive is the sample product 'olive' of store 1. Before the run, test.user must be a buyer
// (USER) and test.seller a staff member of store 1 in the development DB (scripts/set-member-role.ps1
// -Role SHOP_STAFF -StoreId 1); fixtures cannot change that DB.
test('existing olive: seller publication, buyer placement and one retained pickup order', async ({ browser }) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  const evidence = 'artifacts/acceptance/purchase.json';
  try {
    await mkdir('artifacts/acceptance', { recursive: true });
    await login(seller, 'test.seller@example.com');
    await login(buyer, 'test.user@example.com');
    const products = await call(buyer.request, '/products?storeId=1').then((r) => r.json());
    const product = products.find((p) => p.id === 'olive');
    expect(product.name).toBe('オリーブ');
    await seller.goto(`${ec}/seller/products`);
    await seller.getByRole('searchbox', { name: '商品検索' }).fill('オリーブ');
    await expect(seller.getByTestId(`manage-${product.id}`)).toContainText('オリーブ');
    let saved = await readFile(evidence, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    if (!saved) {
      const before = product.stock;
      expect(before).toBeGreaterThan(0);
      expect((await call(buyer.request, '/cart').then((r) => r.json())).itemCount).toBe(0);
      await buyer.goto(ec);
      await buyer.getByRole('button', { name: 'オリーブの詳細', exact: true }).click();
      await buyer.getByRole('dialog').getByRole('button', { name: 'カートに追加', exact: true }).click();
      await expect
        .poll(() =>
          call(buyer.request, '/cart')
            .then((r) => r.json())
            .then((c) => c.itemCount),
        )
        .toBe(1);
      await buyer.getByRole('link', { name: 'Canvasでイメージする' }).click();
      // Canvas creates a garden from the list's first card; its name is edited later in the editor.
      await buyer.getByRole('button', { name: '新しい庭をつくる', exact: true }).click();
      await expect(buyer.getByTestId(`asset-product:${product.id}`)).toHaveAttribute('aria-pressed', 'true');
      const gardenId = new URL(buyer.url()).pathname.split('/').pop();
      // Canvas places items only after the garden photo is confirmed (Canvas issue #15).
      await seedGardenPhoto(
        buyer,
        await call(buyer.request, `/gardens/${gardenId}`, 'GET', undefined, canvas).then((r) => r.json()),
      );
      await buyer.reload();
      await expect(buyer.getByTestId(`asset-product:${product.id}`)).toHaveAttribute('aria-pressed', 'true');
      const surface = buyer.locator('[data-testid="garden-canvas"] canvas');
      await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
      const box = await surface.boundingBox();
      await surface.click({ position: { x: box.width * 0.5, y: box.height * 0.55 } });
      await expect
        .poll(() =>
          call(buyer.request, `/gardens/${gardenId}`, 'GET', undefined, canvas)
            .then((r) => r.json())
            .then((g) => g.objects.length),
        )
        .toBe(1);
      await buyer.reload();
      await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
      await expect(buyer.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
      await buyer.screenshot({ path: 'artifacts/acceptance/garden-reloaded.png' });
      await buyer.goto(`${ec}/cart`);
      await buyer.getByRole('button', { name: '注文内容を確認する' }).click();
      const responsePromise = buyer.waitForResponse(
        (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
      );
      await buyer.getByRole('button', { name: '注文を確定する', exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const [order] = (await response.json()).orders;
      saved = { orderId: order.id, gardenId, productId: product.id, before, after: before - 1, order };
      await writeFile(evidence, JSON.stringify(saved, null, 2));
    }
    await login(buyer, 'test.user@example.com');
    const stock = await call(buyer.request, '/products?storeId=1')
      .then((r) => r.json())
      .then((ps) => ps.find((p) => p.id === product.id).stock);
    expect(stock).toBe(saved.after);
    const order = await call(buyer.request, `/orders/${saved.orderId}`).then((r) => r.json());
    expect(order.items[0].productId).toBe(product.id);
    expect(order.items[0].quantity).toBe(1);
    expect((await call(buyer.request, '/cart').then((r) => r.json())).itemCount).toBe(0);
    await buyer.goto(`${ec}/purchases`);
    await expect(buyer.getByTestId(`order-${saved.orderId}`)).toContainText('オリーブ');
    await buyer.screenshot({ path: 'artifacts/acceptance/buyer-orders.png', fullPage: true });
    await seller.goto(`${ec}/seller/orders`);
    await expect(seller.getByTestId(`order-${saved.orderId}`)).toContainText('オリーブ');
    await seller.screenshot({ path: 'artifacts/acceptance/seller-orders.png', fullPage: true });
    await buyer.goto(`${canvas}/gardens/${saved.gardenId}`);
    await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(buyer.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    const garden = await call(buyer.request, `/gardens/${saved.gardenId}`, 'GET', undefined, canvas).then((r) =>
      r.json(),
    );
    expect(garden.objects[0].productId).toBe(product.id);
    await buyer.screenshot({ path: 'artifacts/acceptance/garden-after-purchase.png' });
    await writeFile(
      'artifacts/acceptance/verified.json',
      JSON.stringify({ ...saved, order, garden, stock, reloginVerified: true }, null, 2),
    );
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});
