import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { sql, removeScarceProduct } from './database.js';

function fixtures(count) {
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  const ids = Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(2, '0')}`);
  sql(
    ids
      .map(
        (
          id,
          i,
        ) => `INSERT INTO products(id,sku,name,latin_name,category,description,size_label,care,price_yen,image_url,badge,published_at)
    SELECT '${id}','${id}','${id}',latin_name,'${i % 2 ? 'ハーブ' : '庭木'}',description,size_label,care,${1000 + i * 100},image_url,badge,'2026-10-01 00:00:00' FROM products WHERE id='olive';
    INSERT INTO inventory(store_id,product_id,quantity) VALUES(1,'${id}',20),(2,'${id}',30);
    INSERT INTO material_products(material_code,product_id) VALUES('${id}','${id}');`,
      )
      .join('\n'),
  );
  return { prefix, ids };
}
function cleanup(ids) {
  for (const id of ids) {
    sql(`DELETE FROM material_products WHERE product_id='${id}';`);
    removeScarceProduct(id);
  }
}
async function status(client, ids, value, storeId = 1) {
  return client.patch('/api/seller/products/status', { data: { storeId, productIds: ids, status: value } });
}
async function catalog(client, storeId = 1, seller = false) {
  const response = await client.get(`/api/${seller ? 'seller/' : ''}products?storeId=${storeId}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('seller table search, sorting, pagination, bulk actions and independent store selection persist', async ({
  page,
}) => {
  test.setTimeout(150000);
  const { prefix, ids } = fixtures(26);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/seller/products');
    await page.getByRole('searchbox', { name: '商品検索', exact: true }).fill(prefix);
    const rows = page.locator('.seller-product-table tbody tr');
    await expect(rows).toHaveCount(25);
    await page.getByRole('combobox', { name: '並び順', exact: true }).selectOption('priceAsc');
    await expect(rows.first()).toHaveAttribute('data-testid', `manage-${ids[0]}`);
    await page.getByRole('checkbox', { name: '現在ページの商品をすべて選択' }).check();
    await page.getByRole('button', { name: '次のページ', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByText('0件選択中', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '前のページ', exact: true }).click();
    await page.getByRole('combobox', { name: '並び順', exact: true }).selectOption('priceDesc');
    await expect(rows.first()).toHaveAttribute('data-testid', `manage-${ids[25]}`);
    await page.getByRole('combobox', { name: 'カテゴリ', exact: true }).selectOption('ハーブ');
    await expect(rows).toHaveCount(13);
    await rows.first().getByRole('button', { name: '編集', exact: true }).click();
    await page.getByRole('button', { name: '商品一覧へ戻る', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'カテゴリ', exact: true })).toHaveValue('ハーブ');
    await page.getByRole('button', { name: '条件をリセット', exact: true }).click();
    await page.getByRole('searchbox', { name: '商品検索', exact: true }).fill(prefix);
    await page.getByRole('combobox', { name: '並び順', exact: true }).selectOption('priceAsc');
    await mkdir('artifacts/e2e', { recursive: true });
    await page.screenshot({ path: 'artifacts/e2e/seller-products-desktop.png', fullPage: true });
    await page.getByRole('checkbox', { name: '現在ページの商品をすべて選択' }).check();
    await page.getByRole('button', { name: '選択商品を非表示', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('25件');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await catalog(page.request)).filter((p) => ids.includes(p.id))).toHaveLength(26);
    await page.getByRole('button', { name: '選択商品を非表示', exact: true }).click();
    let patches = 0;
    page.on('request', (r) => {
      if (r.method() === 'PATCH') patches++;
    });
    await page.getByRole('button', { name: '非表示を確定', exact: true }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(patches).toBe(1);
    expect((await catalog(page.request)).filter((p) => ids.includes(p.id))).toHaveLength(1);
    expect((await catalog(page.request, 2)).filter((p) => ids.includes(p.id))).toHaveLength(26);
    await page.getByRole('combobox', { name: '公開状態', exact: true }).selectOption('HIDDEN');
    await expect(rows).toHaveCount(25);
    await page.getByRole('checkbox', { name: '現在ページの商品をすべて選択' }).check();
    await page.getByRole('button', { name: '選択商品を再公開', exact: true }).click();
    await page.getByRole('button', { name: '再公開を確定', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(rows).toHaveCount(0);
    await page.getByRole('combobox', { name: '公開状態', exact: true }).selectOption('');
    const firstProduct = page.getByTestId(`manage-${ids[0]}`);
    await expect(firstProduct.locator('.seller-row-actions button')).toHaveCount(2);
    await expect(firstProduct.getByRole('button', { name: '編集', exact: true }).locator('svg')).toBeVisible();
    await expect(firstProduct.getByRole('button', { name: '削除', exact: true }).locator('svg')).toBeVisible();
    await firstProduct.getByRole('button', { name: '公開中：非表示にする', exact: true }).click();
    const hiddenButton = firstProduct.getByRole('button', { name: '非表示：再公開する', exact: true });
    await expect(hiddenButton).toBeEnabled();
    await expect(hiddenButton.locator('svg')).toBeVisible();
    expect((await catalog(page.request)).some((p) => p.id === ids[0])).toBe(false);
    await page.reload();
    await page.getByRole('searchbox', { name: '商品検索', exact: true }).fill(prefix);
    await expect(hiddenButton).toBeVisible();
    await hiddenButton.focus();
    await hiddenButton.press('Enter');
    await expect(firstProduct.getByRole('button', { name: '公開中：非表示にする', exact: true })).toBeEnabled();
    expect((await catalog(page.request)).some((p) => p.id === ids[0])).toBe(true);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByTestId(`manage-${ids[0]}`).getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('button', { name: '削除を確定', exact: true }).click();
    await expect(page.getByTestId(`manage-${ids[0]}`)).toHaveCount(0);
    await page.getByRole('checkbox', { name: `${ids[1]}を選択`, exact: true }).check();
    await page.getByRole('checkbox', { name: `${ids[2]}を選択`, exact: true }).check();
    await page.getByRole('button', { name: '選択商品を削除', exact: true }).click();
    await page.getByRole('button', { name: '削除を確定', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.reload();
    await page.getByRole('searchbox', { name: '商品検索', exact: true }).fill(prefix);
    await expect(rows).toHaveCount(23);
    const saved = await catalog(page.request, 1, true);
    await writeFile(
      'artifacts/e2e/seller-products-api.json',
      JSON.stringify(
        saved.filter((p) => ids.includes(p.id)),
        null,
        2,
      ),
    );
    const cartBefore = await page.request.get('/api/cart').then((r) => r.json());
    await page.getByRole('combobox', { name: '管理する店舗', exact: true }).selectOption('2');
    await page.getByRole('searchbox', { name: '商品検索', exact: true }).fill(ids[0]);
    await expect(page.getByTestId(`manage-${ids[0]}`)).toBeVisible();
    const cartAfter = await page.request.get('/api/cart').then((r) => r.json());
    expect(cartAfter.storeId).toBe(cartBefore.storeId);
    expect(cartAfter.revision).toBe(cartBefore.revision);
    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/e2e/seller-products-mobile-${width}.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
    expect(sql(`SELECT publication_status FROM inventory WHERE store_id=1 AND product_id='${ids[0]}';`)).toBe(
      'DELETED',
    );
    expect(sql(`SELECT quantity FROM inventory WHERE store_id=2 AND product_id='${ids[0]}';`)).toBe('30');
  } finally {
    cleanup(ids);
  }
});

test('store status enforces atomic batches, cart and Canvas availability, and preserves order history', async ({
  request,
}) => {
  const { ids } = fixtures(3);
  try {
    const empty = await request.get('/api/cart').then((r) => r.json());
    const cart = await request
      .put(`/api/cart/items/${ids[0]}`, { data: { quantity: 1, revision: empty.revision } })
      .then((r) => r.json());
    expect((await status(request, [ids[0]], 'HIDDEN')).status()).toBe(200);
    expect((await request.get('/api/cart').then((r) => r.json())).canCheckout).toBe(false);
    expect(
      (
        await request.post('/api/orders', {
          data: { requestId: randomUUID(), revision: cart.revision, expectedTotalYen: cart.totalYen },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await request.put(`/api/cart/items/${ids[0]}`, { data: { quantity: 2, revision: cart.revision } })).status(),
    ).toBe(409);
    for (const storeId of [1, 2]) {
      const quote = await request
        .post('/api/materials/quote', {
          data: { storeId, items: [{ materialCode: ids[0], quantity: 1, unit: 'piece' }] },
        })
        .then((r) => r.json());
      expect(quote[0].candidates).toHaveLength(storeId === 1 ? 0 : 1);
    }
    const hidden = (await catalog(request, 1, true)).find((p) => p.id === ids[0]);
    const responseOnly = new Set([
      'id',
      'unit',
      'source',
      'sourceUpdatedAt',
      'publishedAt',
      'active',
      'publicationStatus',
      'modelComposition',
      'canvasMaterialCode',
    ]);
    const input = Object.fromEntries(Object.entries(hidden).filter(([key]) => !responseOnly.has(key)));

    expect((await request.put(`/api/products/${ids[0]}`, { data: { ...input, storeId: 1 } })).status()).toBe(200);
    expect((await catalog(request, 1, true)).find((p) => p.id === ids[0]).publicationStatus).toBe('HIDDEN');
    expect((await status(request, [ids[0]], 'PUBLISHED')).status()).toBe(200);
    const orderResponse = await request.post('/api/orders', {
      data: { requestId: randomUUID(), revision: cart.revision, expectedTotalYen: cart.totalYen },
    });
    expect(orderResponse.status()).toBe(200);
    const order = await orderResponse.json();
    expect((await status(request, [ids[0]], 'DELETED')).status()).toBe(200);
    expect(
      (await request.get('/api/orders').then((r) => r.json())).find((o) => o.id === order.id).items[0].productId,
    ).toBe(ids[0]);
    expect((await status(request, [ids[1], ids[0]], 'HIDDEN')).status()).toBe(409);
    expect((await catalog(request)).some((p) => p.id === ids[1])).toBe(true);
    expect((await status(request, [ids[1], 'missing-product'], 'HIDDEN')).status()).toBe(404);
    expect((await status(request, [ids[1], ids[1]], 'HIDDEN')).status()).toBe(400);
    expect((await status(request, ids, 'UNKNOWN')).status()).toBe(400);
    expect((await status(request, [], 'HIDDEN')).status()).toBe(400);
    expect((await status(request, Array(26).fill(ids[1]), 'HIDDEN')).status()).toBe(400);
    expect((await status(request, [ids[1]], 'HIDDEN', 999999)).status()).toBe(404);
    expect((await catalog(request, 2)).some((p) => p.id === ids[0])).toBe(true);
    const emptyAfterOrder = await request.get('/api/cart').then((r) => r.json());
    const otherStoreCart = await request
      .put('/api/cart/store', { data: { storeId: 2, revision: emptyAfterOrder.revision } })
      .then((r) => r.json());
    const otherCart = await request
      .put(`/api/cart/items/${ids[0]}`, { data: { quantity: 1, revision: otherStoreCart.revision } })
      .then((r) => r.json());
    expect(
      (
        await request.post('/api/orders', {
          data: { requestId: randomUUID(), revision: otherCart.revision, expectedTotalYen: otherCart.totalYen },
        })
      ).status(),
    ).toBe(200);
  } finally {
    cleanup(ids);
  }
});

test('checkout and visibility changes serialize on store inventory', async ({ playwright }) => {
  test.setTimeout(90000);
  const { ids } = fixtures(3);
  const buyer = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:15186' });
  const seller = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:15186' });
  try {
    for (const id of ids) {
      const empty = await buyer.get('/api/cart').then((r) => r.json());
      const cart = await buyer
        .put(`/api/cart/items/${id}`, { data: { quantity: 1, revision: empty.revision } })
        .then((r) => r.json());
      const [checkout, hidden] = await Promise.all([
        buyer.post('/api/orders', {
          data: { requestId: randomUUID(), revision: cart.revision, expectedTotalYen: cart.totalYen },
        }),
        status(seller, [id], 'HIDDEN'),
      ]);
      expect(hidden.status()).toBe(200);
      expect([200, 409]).toContain(checkout.status());
      const count = Number(sql(`SELECT COUNT(*) FROM order_items WHERE product_id='${id}';`));
      expect(count).toBe(checkout.status() === 200 ? 1 : 0);
      expect(sql(`SELECT quantity FROM inventory WHERE store_id=1 AND product_id='${id}';`)).toBe(String(20 - count));
      const latest = await buyer.get('/api/cart').then((r) => r.json());
      if (latest.items.length) {
        expect(
          (
            await buyer.post('/api/orders', {
              data: { requestId: randomUUID(), revision: latest.revision, expectedTotalYen: latest.totalYen },
            })
          ).status(),
        ).toBe(409);
        await buyer.put(`/api/cart/items/${id}`, { data: { quantity: 0, revision: latest.revision } });
      }
    }
  } finally {
    await buyer.dispose();
    await seller.dispose();
    cleanup(ids);
  }
});

test('inventory screen shares store visibility and keeps quantities isolated', async ({ page }) => {
  test.setTimeout(90000);
  const { ids } = fixtures(1);
  try {
    await page.goto('/seller/inventory');
    await page.getByRole('combobox', { name: '管理する店舗', exact: true }).selectOption('2');
    const row = page.getByRole('row').filter({ hasText: ids[0] });
    await row.getByRole('button', { name: '非表示', exact: true }).click();
    await page.getByRole('button', { name: '変更を確定', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(row.getByRole('button', { name: '再公開', exact: true })).toBeVisible();
    expect((await catalog(page.request, 1)).some((p) => p.id === ids[0])).toBe(true);
    expect((await catalog(page.request, 2)).some((p) => p.id === ids[0])).toBe(false);
    await row.getByRole('button', { name: '在庫を編集', exact: true }).click();
    await page.getByRole('spinbutton', { name: '在庫数', exact: true }).fill('31');
    await page.getByRole('button', { name: '在庫を保存', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '在庫数', exact: true })).toHaveCount(0);
    await row.getByRole('button', { name: '再公開', exact: true }).click();
    await page.getByRole('button', { name: '変更を確定', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.reload();
    await page.getByRole('combobox', { name: '管理する店舗', exact: true }).selectOption('2');
    await expect(row).toContainText('31');
    expect((await catalog(page.request, 1)).find((p) => p.id === ids[0]).stock).toBe(20);
    expect((await catalog(page.request, 2)).find((p) => p.id === ids[0]).stock).toBe(31);
  } finally {
    cleanup(ids);
  }
});
