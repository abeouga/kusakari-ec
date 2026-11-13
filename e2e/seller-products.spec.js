import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { sql, removeScarceProduct } from './database.js';
import { ec, login, call, prepareMember } from './business-helpers.js';

// Issue #113: a product belongs to one store and has one inventory row (v3, #110). The seller is the MANAGER of sample
// store 1 ('SELLER'); the buyer is the test buyer. Both sign in with real Cognito.
function fixtures(count) {
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  const ids = Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(2, '0')}`);
  sql(
    ids
      .map(
        (
          id,
          i,
        ) => `INSERT INTO products(id,store_id,sku,name,latin_name,category_name,description,size_label,care,price_yen,image_url,badge)
    SELECT '${id}',1,'${id}','${id}',latin_name,'${i % 2 ? 'ハーブ' : '庭木'}',description,size_label,care,${1000 + i * 100},image_url,badge FROM products WHERE id='olive';
    INSERT INTO inventory(product_id,quantity,publication_status) VALUES('${id}',20,'PUBLISHED');
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
/** @param {import('@playwright/test').Browser} browser @param {string} email @param {'USER'|'SELLER'} role */
async function member(browser, email, role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  prepareMember(await login(page, email), role);
  return { context, page, request: page.request };
}
async function status(client, ids, value, storeId = 1) {
  return call(client, '/seller/products/status', 'PATCH', { storeId, productIds: ids, status: value });
}
async function catalog(client, storeId = 1, seller = false) {
  const response = await call(client, `/${seller ? 'seller/' : ''}products?storeId=${storeId}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
/** @param {any} cart */
const checkout = (client, cart) =>
  call(client, '/orders', 'POST', {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'PAY_AT_STORE',
  });

test('seller table search, sorting, pagination and bulk actions persist', async ({ page }) => {
  test.setTimeout(150000);
  const { prefix, ids } = fixtures(26);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
    await page.goto(`${ec}/seller/products`);
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
    await page.getByRole('combobox', { name: '公開状態', exact: true }).selectOption('HIDDEN');
    await expect(rows).toHaveCount(25);
    await page.getByRole('checkbox', { name: '現在ページの商品をすべて選択' }).check();
    await page.getByRole('button', { name: '選択商品を再公開', exact: true }).click();
    await page.getByRole('button', { name: '再公開を確定', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(rows).toHaveCount(0);
    await page.getByRole('combobox', { name: '公開状態', exact: true }).selectOption('');
    const firstProduct = page.getByTestId(`manage-${ids[0]}`);
    await expect(firstProduct.getByRole('button', { name: '編集', exact: true }).locator('svg')).toBeVisible();
    await expect(firstProduct.getByRole('button', { name: '削除', exact: true }).locator('svg')).toBeVisible();
    await firstProduct.getByRole('button', { name: '公開中：非表示にする', exact: true }).click();
    const hiddenButton = firstProduct.getByRole('button', { name: '非表示：再公開する', exact: true });
    await expect(hiddenButton).toBeEnabled();
    await expect(hiddenButton.locator('svg')).toBeVisible();
    expect((await catalog(page.request)).some((p) => p.id === ids[0])).toBe(false);
    await page.reload();
    await page.getByRole('searchbox', { name: '商品検索', exact: true }).fill(prefix);
    await page.getByRole('combobox', { name: '並び順', exact: true }).selectOption('priceAsc');
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
    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/e2e/seller-products-mobile-${width}.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
    // Deletion keeps the row as DELETED (no products.active any more, #122).
    expect(sql(`SELECT publication_status FROM inventory WHERE product_id='${ids[0]}';`)).toBe('DELETED');
    expect(sql(`SELECT COUNT(*) FROM products WHERE id='${ids[0]}';`)).toBe('1');
  } finally {
    cleanup(ids);
  }
});

test('store status enforces atomic batches, cart and Canvas availability, and preserves order history', async ({
  browser,
}) => {
  const { ids } = fixtures(3);
  const seller = await member(browser, 'test.seller@example.com', 'SELLER');
  const buyer = await member(browser, 'test.user@example.com', 'USER');
  try {
    const empty = await call(buyer.request, '/cart').then((r) => r.json());
    const cart = await call(buyer.request, `/cart/items/${ids[0]}`, 'PUT', {
      quantity: 1,
      revision: empty.revision,
    }).then((r) => r.json());
    expect((await status(seller.request, [ids[0]], 'HIDDEN')).status()).toBe(200);
    expect((await call(buyer.request, '/cart').then((r) => r.json())).canCheckout).toBe(false);
    expect((await checkout(buyer.request, cart)).status()).toBe(409);
    expect(
      (await call(buyer.request, `/cart/items/${ids[0]}`, 'PUT', { quantity: 2, revision: cart.revision })).status(),
    ).toBe(409);
    const quote = await buyer.request
      .post(`${ec}/api/materials/quote`, {
        data: { storeId: 1, items: [{ materialCode: ids[0], quantity: 1, unit: 'piece' }] },
      })
      .then((r) => r.json());
    expect(quote[0].candidates).toHaveLength(0);
    const hidden = (await catalog(seller.request, 1, true)).find((p) => p.id === ids[0]);
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
      'sellerStoreId',
      'sellerStoreName',
    ]);
    const input = Object.fromEntries(Object.entries(hidden).filter(([key]) => !responseOnly.has(key)));
    const edited = await call(seller.request, `/products/${ids[0]}`, 'PUT', { ...input, storeId: 1 });
    expect(edited.status(), await edited.text()).toBe(200);
    expect((await catalog(seller.request, 1, true)).find((p) => p.id === ids[0]).publicationStatus).toBe('HIDDEN');
    expect((await status(seller.request, [ids[0]], 'PUBLISHED')).status()).toBe(200);
    const orderResponse = await checkout(buyer.request, cart);
    expect(orderResponse.status()).toBe(200);
    const [order] = (await orderResponse.json()).orders;
    expect((await status(seller.request, [ids[0]], 'DELETED')).status()).toBe(200);
    expect(
      (await call(buyer.request, '/orders').then((r) => r.json())).find((o) => o.id === order.id).items[0].productId,
    ).toBe(ids[0]);
    expect((await status(seller.request, [ids[1], ids[0]], 'HIDDEN')).status()).toBe(409);
    expect((await catalog(buyer.request)).some((p) => p.id === ids[1])).toBe(true);
    expect((await status(seller.request, [ids[1], 'missing-product'], 'HIDDEN')).status()).toBe(404);
    expect((await status(seller.request, [ids[1], ids[1]], 'HIDDEN')).status()).toBe(400);
    expect((await status(seller.request, ids, 'UNKNOWN')).status()).toBe(400);
    expect((await status(seller.request, [], 'HIDDEN')).status()).toBe(400);
    expect((await status(seller.request, Array(26).fill(ids[1]), 'HIDDEN')).status()).toBe(400);
    // A store the seller has no role at is refused before the products are looked up (#105), whether it exists or not.
    expect((await status(seller.request, [ids[1]], 'HIDDEN', 999999)).status()).toBe(403);
    expect((await status(seller.request, [ids[1]], 'HIDDEN', 2)).status()).toBe(403);
    expect((await catalog(buyer.request)).some((p) => p.id === ids[1])).toBe(true);
  } finally {
    await seller.context.close();
    await buyer.context.close();
    cleanup(ids);
  }
});

test('checkout and visibility changes serialize on store inventory', async ({ browser }) => {
  test.setTimeout(120000);
  const { ids } = fixtures(3);
  const seller = await member(browser, 'test.seller@example.com', 'SELLER');
  const buyer = await member(browser, 'test.user@example.com', 'USER');
  try {
    for (const id of ids) {
      const empty = await call(buyer.request, '/cart').then((r) => r.json());
      const cart = await call(buyer.request, `/cart/items/${id}`, 'PUT', {
        quantity: 1,
        revision: empty.revision,
      }).then((r) => r.json());
      const [placed, hidden] = await Promise.all([
        checkout(buyer.request, cart),
        status(seller.request, [id], 'HIDDEN'),
      ]);
      expect(hidden.status()).toBe(200);
      expect([200, 409]).toContain(placed.status());
      const count = Number(sql(`SELECT COUNT(*) FROM order_items WHERE product_id='${id}';`));
      expect(count).toBe(placed.status() === 200 ? 1 : 0);
      expect(sql(`SELECT quantity FROM inventory WHERE product_id='${id}';`)).toBe(String(20 - count));
      const latest = await call(buyer.request, '/cart').then((r) => r.json());
      if (latest.items.length) {
        expect((await checkout(buyer.request, latest)).status()).toBe(409);
        await call(buyer.request, `/cart/items/${id}`, 'PUT', { quantity: 0, revision: latest.revision });
      }
    }
  } finally {
    await seller.context.close();
    await buyer.context.close();
    cleanup(ids);
  }
});

test('product management edits stock and visibility of the chosen store', async ({ page }) => {
  test.setTimeout(90000);
  const { ids } = fixtures(1);
  try {
    prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
    await page.goto(`${ec}/seller/products`);
    await expect(page.getByRole('link', { name: '在庫', exact: true })).toHaveCount(0);
    await page.getByLabel('商品検索').fill(ids[0]);
    const row = page.getByTestId(`manage-${ids[0]}`);
    await row.getByRole('button', { name: '公開中：非表示にする', exact: true }).click();
    await expect(row.getByRole('button', { name: '非表示：再公開する', exact: true })).toBeEnabled();
    expect((await catalog(page.request, 1)).some((p) => p.id === ids[0])).toBe(false);
    await row.getByRole('button', { name: '在庫を編集', exact: true }).click();
    await expect(page.getByRole('group', { name: '在庫数の変更' })).toContainText('変更前の在庫数 20');
    await page.getByRole('spinbutton', { name: '在庫数', exact: true }).fill('0');
    await page.getByRole('button', { name: '在庫を保存', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '在庫数', exact: true })).toHaveCount(0);
    await expect(row.locator('td[data-label="在庫"]')).toContainText('在庫切れ');
    await row.getByRole('button', { name: '在庫を編集', exact: true }).click();
    await page.getByRole('spinbutton', { name: '在庫数', exact: true }).fill('31');
    await page.getByRole('button', { name: '在庫を保存', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '在庫数', exact: true })).toHaveCount(0);
    await row.getByRole('button', { name: '非表示：再公開する', exact: true }).click();
    await expect(row.getByRole('button', { name: '公開中：非表示にする', exact: true })).toBeEnabled();
    await page.reload();
    await page.getByLabel('商品検索').fill(ids[0]);
    await expect(row.locator('td[data-label="在庫"] .seller-stock > span')).toHaveText('31');
    await mkdir('artifacts/business', { recursive: true });
    await page.screenshot({ path: 'artifacts/business/seller-products-stock-reloaded.png', fullPage: true });
    expect((await catalog(page.request, 1)).find((p) => p.id === ids[0]).stock).toBe(31);
    expect(sql(`SELECT quantity FROM inventory WHERE product_id='${ids[0]}';`)).toBe('31');
  } finally {
    cleanup(ids);
  }
});
