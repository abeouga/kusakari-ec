import { addImages } from './product-images.js';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { sql } from './database.js';
import { ec, call, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

/** Saves the current screen at 1440px and 390px, then returns to the configured desktop size. */
async function shoot(page, path) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${path}-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

// Moved from crud.spec.js (product part only): since Cognito became mandatory the seller signs in first, and the
// wizard has no product-number input (issue #46). A duplicate number is therefore checked through the real API.
test('product CRUD, plant filters, gallery and archived cart through real MySQL', async ({ browser }) => {
  test.setTimeout(300000);
  const dir = 'artifacts/business/product-crud';
  await mkdir(dir, { recursive: true });
  const sellerContext = await browser.newContext();
  const buyerContext = await browser.newContext();
  const page = await sellerContext.newPage();
  const buyer = await buyerContext.newPage();
  const name = `CRUDデモ植物 ${randomUUID().slice(0, 8)}`;
  let product;
  try {
    prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    await page.goto(`${ec}/`);
    await page.locator('.site-footer').getByRole('button', { name: '商品管理', exact: true }).click();
    await page
      .getByRole('dialog', { name: '商品管理', exact: true })
      .getByRole('button', { name: '新しい商品', exact: true })
      .click();
    await expect(page).toHaveURL(`${ec}/seller/products/new`);
    const manager = page.locator('.workspace-main');
    await manager.getByLabel('商品名', { exact: true }).fill(name);
    await manager.getByRole('button', { name: 'カテゴリーを選ぶ', exact: true }).click();
    const categoryDialog = page.getByRole('dialog', { name: 'カテゴリーを選ぶ', exact: true });
    await categoryDialog.getByLabel('カテゴリー名で絞り込み').fill('ハーブ');
    await categoryDialog
      .getByRole('list', { name: 'カテゴリー一覧' })
      .getByRole('button', { name: 'ハーブ', exact: true })
      .click();
    await expect(categoryDialog).toHaveCount(0);
    await manager.getByLabel('税込価格（円）').fill('3200');
    await manager.getByLabel('選択店舗の在庫').fill('5');
    await manager.locator('summary').getByText('詳しい情報', { exact: true }).click();
    await manager.getByLabel('生産者名', { exact: true }).fill('CRUDデモ農園');
    await manager.getByLabel('商品説明', { exact: true }).fill('専用DBだけに保存するテスト用の商品です。');
    await manager.getByRole('button', { name: '次へ', exact: true }).click();
    await addImages(manager, [
      'frontend/public/images/olive.png',
      'frontend/public/images/rosemary.png',
      'frontend/public/images/lavender.png',
    ]);
    await manager.getByRole('button', { name: '次へ', exact: true }).click();
    await manager.getByRole('button', { name: '手動で設定', exact: true }).click();
    await manager.getByLabel('植物の高さ（cm・土際から）', { exact: true }).fill('275');
    await manager.getByRole('button', { name: '次へ', exact: true }).click();
    const created = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
    await manager.getByRole('button', { name: '出品する', exact: true }).click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(200);
    product = await response.json();
    const input = response.request().postDataJSON();
    expect(input.sku).toBe('');
    expect(input.heightCm).toBe(275);
    expect(input.plantModelProfile.heightCm).toBe(input.heightCm);

    // The 409 duplicate-number path, the input validation and unknown fields, through the real API.
    const olive = (await (await call(page.request, '/products?storeId=1')).json()).find((item) => item.id === 'olive');
    const duplicate = await call(page.request, '/products', 'POST', { ...input, sku: olive.sku });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).code).toBe('SKU_EXISTS');
    expect((await call(page.request, '/products', 'POST', { ...input, priceYen: -1 })).status()).toBe(400);
    expect((await call(page.request, '/products', 'POST', { ...input, heightCm: 5 })).status()).toBe(400);
    expect(
      (await call(page.request, '/products', 'POST', { ...input, imageUrl: 'javascript:alert(1)' })).status(),
    ).toBe(400);
    expect((await call(page.request, '/products', 'POST', { ...input, ownerId: 'unexpected' })).status()).toBe(400);
    await expect(manager.getByRole('status')).toContainText('商品を保存');
    await expect(page).toHaveURL(`${ec}/seller/products`);
    // Set test-owned catalog attributes directly; the removed guidance editor is not a setup path.
    sql(`UPDATE products SET sunlight='半日陰',care_level=3,use_case='室内インテリア' WHERE id='${product.id}';`);
    await page.reload();
    await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
    await expect(page.getByTestId(`manage-${product.id}`)).toBeVisible();

    await buyer.goto(`${ec}/`);
    await buyer.getByLabel('植物を検索', { exact: true }).fill(name);
    await expect(buyer.getByTestId(`product-${product.id}`)).toBeVisible();
    await buyer.getByRole('combobox', { name: '日照条件', exact: true }).selectOption('半日陰');
    await buyer.getByRole('combobox', { name: '手入れレベル', exact: true }).selectOption('3');
    await expect(buyer.locator('.product-card')).toHaveCount(1);
    await buyer.getByRole('button', { name: `${name}の詳細`, exact: true }).click();
    const detail = buyer.getByRole('dialog');
    await expect(detail.getByRole('region', { name: '出品者Tips' })).toHaveCount(0);
    await expect(detail).toContainText('高さ 約275cm');
    await detail.getByRole('button', { name: '商品画像2', exact: true }).click();
    await expect(buyer.locator('.detail-main-image')).toHaveAttribute('src', product.images[0]);
    await shoot(buyer, `${dir}/detail-after-reload`);
    const savedProduct = (await (await call(buyer.request, '/products?storeId=1')).json()).find(
      (item) => item.id === product.id,
    );
    expect(savedProduct.images).toEqual(product.images);
    expect(savedProduct.careLevel).toBe(3);
    expect(savedProduct.heightCm).toBe(275);
    expect(savedProduct.sku).toBe(product.sku);
    await writeFile(
      `${dir}/product-after-reload.json`,
      JSON.stringify(
        (({ id, sku, name: n, category, heightCm, careLevel, sunlight, imageUrl, images }) => ({
          id,
          sku,
          name: n,
          category,
          heightCm,
          careLevel,
          sunlight,
          imageUrl,
          images,
        }))(savedProduct),
        null,
        2,
      ),
    );
    await detail.getByLabel('購入数量').fill('2');
    await detail.getByRole('button', { name: 'カートに追加', exact: true }).click();
    await expect(detail.getByRole('status')).toContainText('カートを更新');
    await detail.getByRole('button', { name: '閉じる', exact: true }).click();

    // The seller edits from the footer 「商品管理」 dialog.
    await page.goto(`${ec}/`);
    await page.locator('.site-footer').getByRole('button', { name: '商品管理', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '商品管理', exact: true });
    await dialog.getByPlaceholder('商品名・商品番号').fill(product.sku);
    await dialog.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
    await expect(dialog.getByLabel('商品番号', { exact: true })).toHaveText(product.sku);
    await shoot(page, `${dir}/product-manager`);
    await dialog.getByLabel('税込価格（円）').fill('3500');
    await dialog.getByLabel('選択店舗の在庫').fill('2');
    await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
    await expect(dialog.getByTestId(`manage-${product.id}`)).toContainText('3,500');
    await buyer.reload();
    await buyer
      .locator('.kusakari-site-header')
      .getByRole('link', { name: /^カートを開く/ })
      .click();
    await expect(buyer.locator('.grand-total')).toContainText('7,000');
    const otherStock = await (await call(page.request, '/products?storeId=2')).json();
    // Stock was registered only at store 1. The public list omits a product with no inventory row at the store
    // being viewed (CatalogService/ProductMapper on main), so check both the list and the inventory table.
    expect(otherStock.find((item) => item.id === product.id)).toBeUndefined();
    expect(
      sql(`SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE product_id='${product.id}' AND store_id=2;`),
    ).toBe('0');

    await dialog.getByTestId(`manage-${product.id}`).getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('button', { name: '削除を確定', exact: true }).click();
    await expect(dialog.getByTestId(`manage-${product.id}`)).toHaveCount(0);
    await buyer.goto(`${ec}/`);
    await buyer.getByLabel('植物を検索', { exact: true }).fill(name);
    await expect(buyer.getByTestId(`product-${product.id}`)).toHaveCount(0);
    await buyer
      .locator('.kusakari-site-header')
      .getByRole('link', { name: /^カートを開く/ })
      .click();
    await expect(buyer.getByRole('button', { name: '注文内容を確認する' })).toBeDisabled();
    await shoot(buyer, `${dir}/archived-cart-after-reload`);
    await buyer.getByRole('button', { name: `${name}を削除`, exact: true }).click();
    await expect(buyer.getByRole('heading', { name: 'まだ商品が入っていません。' })).toBeVisible();
    expect(sql(`SELECT active FROM products WHERE id='${product.id}';`)).toBe('1');
    expect(sql(`SELECT publication_status FROM inventory WHERE product_id='${product.id}' AND store_id=1;`)).toBe(
      'DELETED',
    );
  } finally {
    if (product && /^[a-f0-9-]{36}$/.test(product.id)) {
      sql(
        `DELETE FROM cart_items WHERE product_id='${product.id}'; DELETE FROM material_products WHERE product_id='${product.id}'; DELETE FROM product_images WHERE product_id='${product.id}'; DELETE FROM inventory WHERE product_id='${product.id}'; DELETE FROM products WHERE id='${product.id}';`,
      );
    }
    await sellerContext.close();
    await buyerContext.close();
  }
});
