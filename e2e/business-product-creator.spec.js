import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { sql } from './database.js';
import {
  ec,
  canvas,
  call,
  login,
  prepareMember,
  prepareStaff,
  productInput,
  seedGardenPhoto,
} from './business-helpers.js';
import { ADMIN_EMAIL, MANAGER_EMAIL, USER_EMAIL } from './test-accounts.js';
import { MARGUERITE, SAMPLE_PRODUCT_IDS } from './sample-products.js';

const evidence = 'artifacts/business/product-creator';
const RETIRED = ['olive', 'lavender', 'rosemary', 'monstera'];

/** @param {string} id */
const creatorOf = (id) => sql(`SELECT COALESCE(created_by_member_id,'') FROM products WHERE id='${id}';`);
/** @param {string} id */
const displayName = (id) => sql(`SELECT display_name FROM members WHERE id='${id}';`);

// V7 (docs/decisions/2026-11-20-sample-products-and-creator.md): the 31 products sold before DB v3 belong to store 1,
// store 1's four V2 products are deleted, and a product records who added it. The name is shown to the store's people
// and to the operators, never to buyers. Seed products have no creator and show 「初期データ」.
test('V7 products are on sale at store 1 and the creator is kept on edit and shown to staff and operators', async ({
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const managerContext = await browser.newContext();
  const staffContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const manager = await managerContext.newPage();
  const staff = await staffContext.newPage();
  const admin = await adminContext.newPage();
  const managerMember = await login(manager, MANAGER_EMAIL);
  prepareMember(managerMember, 'SELLER');
  const staffMember = await login(staff, USER_EMAIL);
  /** @type {{id:string,sku:string,name:string}|undefined} */
  let product;
  try {
    // Buyers see the 31 products at store 1 and not the deleted V2 ones, and never the creator.
    const listed = await call(manager.request, '/products?storeId=1').then((r) => r.json());
    const ids = listed.map((/** @type {{id:string}} */ p) => p.id);
    expect(SAMPLE_PRODUCT_IDS.filter((id) => !ids.includes(id))).toEqual([]);
    expect(ids.filter((id) => RETIRED.includes(id))).toEqual([]);
    expect(listed.filter((/** @type {object} */ p) => Object.hasOwn(p, 'createdByName'))).toEqual([]);
    // The deleted products stay readable for gardens that placed them.
    const references = await call(manager.request, '/products/references', 'POST', { productIds: RETIRED });
    expect(references.status()).toBe(200);
    expect((await references.json()).map((/** @type {{active:boolean}} */ r) => r.active)).toEqual([
      false,
      false,
      false,
      false,
    ]);

    // The MANAGER adds a product: the signed-in member is recorded as the creator.
    const created = await call(manager.request, '/products', 'POST', productInput());
    expect(created.status(), await created.text()).toBe(200);
    product = await created.json();
    expect(product).not.toHaveProperty('createdByName');
    expect(creatorOf(product.id)).toBe(managerMember.id);
    const managerName = displayName(managerMember.id);

    // A STAFF member of store 1 edits it: the creator does not change.
    prepareStaff(staffMember, { 1: 'STAFF' });
    const edited = await call(staff.request, `/products/${product.id}`, 'PUT', {
      ...productInput(),
      sku: product.sku,
      name: `${product.name} 編集`,
      expectedStock: 5,
    });
    expect(edited.status(), await edited.text()).toBe(200);
    expect(creatorOf(product.id)).toBe(managerMember.id);
    const staffList = await call(staff.request, '/seller/products?storeId=1').then((r) => r.json());
    expect(staffList.find((/** @type {{id:string}} */ p) => p.id === product.id).createdByName).toBe(managerName);
    expect(staffList.find((/** @type {{id:string}} */ p) => p.id === MARGUERITE.id)).not.toHaveProperty(
      'createdByName',
    );

    // The store's product management shows the name, and 「初期データ」 for the seed products, after a reload.
    await manager.goto(`${ec}/seller/products`);
    await manager.reload();
    const search = manager.getByPlaceholder('商品名・商品番号');
    await search.fill(product.sku);
    await expect(manager.getByTestId(`creator-${product.id}`)).toHaveText(`追加した人：${managerName}`);
    await manager.screenshot({ path: `${evidence}/seller-products-created.png` });
    await search.fill(MARGUERITE.sku);
    await expect(manager.getByTestId(`creator-${MARGUERITE.id}`)).toHaveText('追加した人：初期データ');
    await manager.screenshot({ path: `${evidence}/seller-products-seed.png` });

    // The operators' product screen shows it too.
    prepareMember(await login(admin, ADMIN_EMAIL), 'ADMIN');
    const operatorList = await call(admin.request, '/operator/products').then((r) => r.json());
    expect(operatorList.find((/** @type {{id:string}} */ p) => p.id === product.id).createdByName).toBe(managerName);
    expect(operatorList.find((/** @type {{id:string}} */ p) => p.id === MARGUERITE.id).createdByName).toBeNull();
    await admin.goto(`${ec}/operator/products`);
    await admin.reload();
    await expect(admin.getByTestId(`operator-product-creator-${product.id}`)).toHaveText(`追加した人：${managerName}`);
    await expect(admin.getByTestId(`operator-product-creator-${MARGUERITE.id}`)).toHaveText('追加した人：初期データ');
    await admin.getByTestId(`operator-product-${product.id}`).scrollIntoViewIfNeeded();
    await admin.screenshot({ path: `${evidence}/operator-products.png` });
    await writeFile(
      `${evidence}/api.json`,
      JSON.stringify(
        {
          staffList: staffList.filter((/** @type {{id:string}} */ p) => [product?.id, MARGUERITE.id].includes(p.id)),
          operatorList: operatorList.filter((/** @type {{id:string}} */ p) =>
            [product?.id, MARGUERITE.id].includes(p.id),
          ),
        },
        (key, value) => (key === 'modelComposition' ? undefined : value),
        2,
      ),
    );
  } finally {
    if (product) expect((await call(manager.request, `/products/${product.id}`, 'DELETE')).status()).toBe(200);
    prepareMember(staffMember, 'USER');
    await managerContext.close();
    await staffContext.close();
    await adminContext.close();
  }
});

// The 31 products have plant models, so a buyer can place them from Canvas's product list.
test('Canvas lists the 31 V7 products and a placed one is kept after reload', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  prepareMember(await login(page, USER_EMAIL), 'USER');
  const created = await call(
    page.request,
    '/gardens',
    'POST',
    { name: `V7商品の配置 ${randomUUID().slice(0, 8)}` },
    canvas,
  );
  expect(created.status()).toBe(201);
  const garden = await created.json();
  const read = () => call(page.request, `/gardens/${garden.id}`, 'GET', undefined, canvas).then((r) => r.json());
  try {
    await seedGardenPhoto(page, garden);
    await page.goto(`${canvas}/gardens/${garden.id}`);
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await page.getByRole('tab', { name: '商品一覧', exact: true }).click();
    for (const id of SAMPLE_PRODUCT_IDS) await expect(page.getByTestId(`browse-${id}`)).toHaveCount(1);
    await page.screenshot({ path: `${evidence}/canvas-products.png` });

    const surface = page.getByTestId('garden-canvas').locator('canvas');
    const bounds = await surface.boundingBox();
    const card = page.getByTestId(`browse-${MARGUERITE.id}`);
    await card.scrollIntoViewIfNeeded();
    await card.hover({ position: { x: 35, y: 35 } });
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.55, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await expect
      .poll(async () => (await read()).objects.map((/** @type {any} */ o) => o.productId))
      .toEqual([MARGUERITE.id]);

    await page.reload();
    await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    await page.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    await page.screenshot({ path: `${evidence}/canvas-after-reload.png` });
    const saved = await read();
    expect(saved.objects.map((/** @type {any} */ o) => o.productId)).toEqual([MARGUERITE.id]);
    await writeFile(`${evidence}/garden-after-reload.json`, JSON.stringify(saved, null, 2));
  } finally {
    await call(page.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
  }
});
