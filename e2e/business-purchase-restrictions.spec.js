import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add, openStore } from './business-helpers.js';
import { sql } from './database.js';

const evidence = 'artifacts/business/purchase-restrictions';
const buyerOnly = '店舗・出店申請用のアカウントでは購入できません。購入は購入者のアカウントでご利用ください。';

/** @param {string} value */
function uuid(value) {
  if (!/^[a-f0-9-]{36}$/.test(value)) throw new Error('Unexpected member id.');
  return value;
}

// Issue #108: shop accounts (owner and staff) and applicants cannot use the buyer APIs or see the cart.
test('shop accounts and applicants cannot use the cart, orders or garden shopping lists', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [shop, buyer, admin] = await Promise.all(contexts.map((c) => c.newPage()));
  const shopMember = await login(shop, 'test.seller@example.com');
  try {
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    const missingOrder = randomUUID();
    const buyerApis = [
      ['/cart', 'GET'],
      ['/cart/items/olive', 'PUT', { quantity: 1, revision: 0 }],
      [
        '/orders',
        'POST',
        { requestId: randomUUID(), revision: 0, expectedTotalYen: 1000, paymentMethod: 'PAY_AT_STORE' },
      ],
      ['/orders', 'GET'],
      [`/orders/${missingOrder}`, 'GET'],
      [`/orders/${missingOrder}`, 'DELETE'],
      [`/orders/${missingOrder}/cancellation`, 'POST', { reason: '確認' }],
      ['/shopping-lists', 'GET'],
      ['/shopping-lists/items/olive', 'POST'],
      [
        `/cart/shopping-lists/${randomUUID()}/items`,
        'POST',
        { gardenRevision: 0, cartRevision: 0, items: [{ key: 'product:olive', productId: 'olive' }], listRevision: 0 },
      ],
    ];
    const results = {};
    for (const role of ['SHOP_OWNER', 'SELLER', 'SHOP_OWNER_APPLICANT']) {
      prepareMember(shopMember, role);
      results[role] = [];
      for (const [path, method, data] of buyerApis) {
        const response = await call(shop.request, path, method, data);
        const body = await response.json().catch(() => null);
        results[role].push({ path, method, status: response.status(), code: body?.code });
        expect(response.status(), `${role} ${method} ${path}`).toBe(403);
        expect(body?.code, `${role} ${method} ${path}`).toBe('BUYER_REQUIRED');
      }
      // The screen: no cart in the header or on the product cards, and a note in place of the cart.
      await shop.goto(`${ec}/`);
      const header = shop.locator('.kusakari-site-header');
      await expect(shop.locator('.product-card').first()).toBeVisible();
      await expect(header.locator('.bag-button')).toBeHidden();
      await expect(shop.locator('.header-buyer-note')).toHaveText(buyerOnly);
      await expect(shop.getByRole('button', { name: /をカートに追加$/ })).toHaveCount(0);
      await shop.locator('.product-card .product-name').first().click();
      const detail = shop.getByRole('dialog');
      await expect(detail.getByRole('note')).toHaveText(buyerOnly);
      await expect(detail.getByRole('button', { name: 'カートに追加', exact: true })).toHaveCount(0);
      await shop.goto(`${ec}/cart`);
      await shop.reload();
      await expect(shop.locator('main').getByRole('note')).toHaveText(buyerOnly);
      await expect(shop.locator('.cart-line')).toHaveCount(0);
      await expect(header.locator('.bag-button')).toBeHidden();
      await shop.screenshot({ path: `${evidence}/cart-${role.toLowerCase()}-reloaded.png`, fullPage: true });
      await shop.goto(`${ec}/purchases`);
      await expect(shop.locator('.workspace-main').getByRole('note')).toHaveText(buyerOnly);
    }
    // Buyers and the operator keep the cart.
    for (const page of [buyer, admin]) expect((await call(page.request, '/cart')).status()).toBe(200);
    expect((await call(admin.request, '/orders')).status()).toBe(200);
    await buyer.goto(`${ec}/`);
    await expect(buyer.locator('.kusakari-site-header .bag-button')).toBeVisible();
    await expect(buyer.locator('.header-buyer-note')).toHaveCount(0);
    await expect(buyer.getByRole('button', { name: /をカートに追加$/ }).first()).toBeVisible();
    await writeFile(`${evidence}/buyer-api.json`, JSON.stringify(results, null, 2));
  } finally {
    prepareMember(shopMember, 'SELLER');
    await Promise.all(contexts.map((c) => c.close()));
  }
});

// Issue #105: STAFF edits products (prices too); an unassigned staff member only reads the store's products.
test('staff edit prices and unassigned staff only read their store', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  const member = await login(page, 'test.seller@example.com');
  prepareMember(member, 'SELLER');
  const input = productInput();
  const created = await call(page.request, '/products', 'POST', input);
  expect(created.status(), await created.text()).toBe(200);
  const product = await created.json();
  const setRole = (role) =>
    sql(
      `UPDATE store_members SET role=${role ? `'${role}'` : 'NULL'} WHERE store_id=1 AND member_id='${uuid(member.id)}';`,
    );
  try {
    setRole('STAFF');
    const priced = await call(page.request, `/products/${product.id}`, 'PUT', { ...input, priceYen: 2600 });
    expect(priced.status(), await priced.text()).toBe(200);
    expect((await priced.json()).priceYen).toBe(2600);
    // Registration, deletion and the store profile stay with the owner and MANAGER.
    expect((await call(page.request, '/products', 'POST', productInput())).status()).toBe(403);
    expect((await call(page.request, `/products/${product.id}`, 'DELETE')).status()).toBe(404);
    const { revision, name, contact, email, address, hours, story } = await call(page.request, '/stores/1').then((r) =>
      r.json(),
    );
    const storeInput = { revision, name, contact, email, address, hours, story };
    expect((await call(page.request, '/seller/stores/1', 'PUT', storeInput)).status()).toBe(403);

    setRole(null);
    const listed = await call(page.request, '/seller/products?storeId=1');
    expect(listed.status()).toBe(200);
    const row = (await listed.json()).find((p) => p.id === product.id);
    expect(row).toMatchObject({ priceYen: 2600, stock: 5 });
    expect((await call(page.request, '/seller/stores').then((r) => r.json())).map((s) => s.id)).toContain(1);
    expect((await call(page.request, '/stores/1')).status()).toBe(200);
    const writes = [
      ['/seller/orders?storeId=1', 'GET'],
      [`/seller/products/${product.id}/stock`, 'PUT', { storeId: 1, expectedStock: 5, stock: 4 }],
      ['/seller/products/status', 'PATCH', { storeId: 1, productIds: [product.id], status: 'HIDDEN' }],
      ['/products', 'POST', productInput()],
    ];
    for (const [path, method, data] of writes)
      expect((await call(page.request, path, method, data)).status(), `${method} ${path}`).toBe(403);
    // The product is not editable either; it is reported as missing like another store's product.
    expect((await call(page.request, `/products/${product.id}`, 'PUT', { ...input, priceYen: 2700 })).status()).toBe(
      404,
    );
    await page.goto(`${ec}/seller/products`);
    await page.reload();
    await expect(page.getByText(input.name, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${evidence}/unassigned-staff-products-reloaded.png`, fullPage: true });
    const saved = await call(page.request, '/seller/products?storeId=1').then((r) => r.json());
    await writeFile(
      `${evidence}/unassigned-staff-products.json`,
      JSON.stringify(
        saved.find((p) => p.id === product.id),
        null,
        2,
      ),
    );
  } finally {
    setRole('MANAGER');
    await call(page.request, `/products/${product.id}`, 'DELETE');
  }
});

/** A store of a separate organization, created directly because the operator's organization actions are not built yet (#109). */
function organizationFixture(label) {
  const suffix = randomUUID().slice(0, 8);
  const organization = sql(
    `INSERT INTO organizations(name) VALUES('E2E ${label} ${suffix}'); SELECT LAST_INSERT_ID();`,
  );
  const store = sql(`INSERT INTO stores(organization_id,name,address,business_hours,published)
    VALUES(${Number(organization)},'E2E ${label} store ${suffix}','Tokyo','10:00-18:00',TRUE); SELECT LAST_INSERT_ID();`);
  const product = `test-${suffix}`;
  sql(`INSERT INTO products(id,store_id,sku,name,latin_name,category_name,description,size_label,care,price_yen,image_url,badge)
    SELECT '${product}',${Number(store)},'${product}','E2E ${label} product ${suffix}',latin_name,category_name,description,size_label,care,1500,image_url,badge FROM products WHERE id='olive';
    INSERT INTO inventory(product_id,quantity,publication_status) VALUES('${product}',5,'PUBLISHED');`);
  return { organization: Number(organization), store: Number(store), product, name: `E2E ${label} product ${suffix}` };
}

// Issue #119: opening the cart removes lines that can no longer be bought; temporary states stay as "cannot buy".
test('cart removes unbuyable lines, references explain why and closed stores are hidden', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const contexts = await Promise.all([1, 2, 3, 4].map(() => browser.newContext()));
  const [owner, buyer, admin, visitor] = await Promise.all(contexts.map((c) => c.newPage()));
  const ownerMember = await login(owner, 'test.seller@example.com');
  try {
    prepareMember(ownerMember, 'SHOP_OWNER');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    const suffix = randomUUID().slice(0, 8);
    const stores = {};
    for (const key of ['suspended', 'closed', 'closing'])
      stores[key] = await openStore(owner.request, `E2E ${key} ${suffix}`);
    const hiddenStore = await call(owner.request, '/seller/stores', 'POST', {
      revision: 0,
      name: `E2E unpublished ${suffix}`,
      contact: '',
      email: '',
      address: '東京都 検証用店舗',
      hours: '10:00-18:00',
      story: '',
    }).then((r) => r.json());
    const products = {};
    for (const [key, storeId] of [
      ['deleted', 1],
      ['hidden', 1],
      ['suspended', 1],
      ['soldOut', 1],
      ['storeSuspended', stores.suspended],
      ['storeClosed', stores.closed],
      ['storeClosing', stores.closing],
    ]) {
      const response = await call(owner.request, '/products', 'POST', { ...productInput(), storeId });
      expect(response.status(), await response.text()).toBe(200);
      products[key] = await response.json();
    }
    const stopped = organizationFixture('stopped');
    const paused = organizationFixture('paused');
    const ids = [...Object.values(products).map((p) => p.id), stopped.product, paused.product];
    for (const id of ids) await add(buyer.request, id);

    // Make each line unbuyable in a different way.
    expect((await call(owner.request, `/products/${products.deleted.id}`, 'DELETE')).status()).toBe(200);
    const hide = { storeId: 1, productIds: [products.hidden.id], status: 'HIDDEN' };
    expect((await call(owner.request, '/seller/products/status', 'PATCH', hide)).status()).toBe(200);
    const moderation = { suspended: true, reason: '購入制限の確認' };
    const moderated = await call(
      admin.request,
      `/operator/products/${products.suspended.id}/moderation`,
      'PUT',
      moderation,
    );
    expect(moderated.status()).toBe(200);
    const off = await call(admin.request, `/operator/stores/${stores.suspended}/enabled`, 'PUT', {
      enabled: false,
      reason: '購入制限の確認',
    });
    expect(off.status()).toBe(200);
    sql(`UPDATE inventory SET quantity=0 WHERE product_id='${products.soldOut.id}';
      UPDATE stores SET closing_started_at=NOW(6),closing_started_by='OWNER',closed_at=NOW(6) WHERE id=${Number(stores.closed)};
      UPDATE stores SET closing_started_at=NOW(6),closing_started_by='OWNER' WHERE id=${Number(stores.closing)};
      UPDATE organizations SET suspension_started_at=NOW(6),suspended=TRUE WHERE id=${stopped.organization};
      UPDATE organizations SET suspension_started_at=NOW(6) WHERE id=${paused.organization};`);

    // The bulk reference says why each product cannot be bought (Canvas removes the first four kinds).
    const references = await call(buyer.request, '/products/references', 'POST', { productIds: ids }).then((r) =>
      r.json(),
    );
    const reasons = Object.fromEntries(references.map((r) => [r.id, [r.purchasable, r.unavailableReason]]));
    expect(reasons).toEqual({
      [products.deleted.id]: [false, 'DELETED'],
      [products.hidden.id]: [false, 'HIDDEN'],
      [products.suspended.id]: [false, 'PRODUCT_SUSPENDED'],
      [products.soldOut.id]: [false, 'OUT_OF_STOCK'],
      [products.storeSuspended.id]: [false, 'STORE_SUSPENDED'],
      [products.storeClosed.id]: [false, 'STORE_CLOSED'],
      [products.storeClosing.id]: [false, 'STORE_CLOSING'],
      [stopped.product]: [false, 'ORGANIZATION_SUSPENDED'],
      [paused.product]: [false, 'ORGANIZATION_NOT_ACCEPTING'],
    });

    // Opening the cart removes the permanent cases and tells the buyer; the temporary ones stay.
    const removedNames = [products.deleted.name, products.storeSuspended.name, products.storeClosed.name, stopped.name];
    await buyer.goto(`${ec}/cart`);
    const notice = buyer.locator('.cart-removed-notice');
    for (const name of removedNames)
      await expect(notice).toContainText(`${name}は購入できなくなったためカートから外しました。`);
    await expect(buyer.locator('.cart-line')).toHaveCount(5);
    for (const key of ['hidden', 'suspended', 'storeClosing'])
      await expect(buyer.locator('.cart-line').filter({ hasText: products[key].name })).toContainText(
        '現在は購入できません',
      );
    await expect(buyer.locator('.cart-line').filter({ hasText: products.soldOut.name })).toContainText('在庫不足');
    await expect(buyer.getByRole('button', { name: '注文内容を確認する' })).toBeDisabled();
    await buyer.screenshot({ path: `${evidence}/cart-removed-notice.png`, fullPage: true });
    await buyer.reload();
    await expect(buyer.locator('.cart-line')).toHaveCount(5);
    await expect(notice).toHaveCount(0);
    await buyer.screenshot({ path: `${evidence}/cart-reloaded.png`, fullPage: true });
    const cart = await call(buyer.request, '/cart').then((r) => r.json());
    expect(cart.removedItems).toEqual([]);
    expect(cart.items.map((line) => line.product.id).sort()).toEqual(
      [products.hidden.id, products.suspended.id, products.soldOut.id, products.storeClosing.id, paused.product].sort(),
    );
    // The products themselves are kept (the removed lines' products are still referenced).
    expect(sql(`SELECT COUNT(*) FROM products WHERE id IN (${ids.map((id) => `'${id}'`).join(',')});`)).toBe('9');

    // Store pages: buyers and visitors see open and closing stores only; staff see the stores they handle.
    const status = async (page, id) => (await call(page.request, `/stores/${id}`)).status();
    const closing = await call(visitor.request, `/stores/${stores.closing}`).then((r) => r.json());
    expect(closing.closingStartedAt).toBeTruthy();
    const visibility = {
      visitor: {},
      buyer: {},
      owner: { unpublished: await status(owner, hiddenStore.id), closed: await status(owner, stores.closed) },
      admin: { suspended: await status(admin, stores.suspended), stopped: await status(admin, stopped.store) },
    };
    for (const [key, id] of [
      ['open', 1],
      ['closing', stores.closing],
      ['paused', paused.store],
      ['unpublished', hiddenStore.id],
      ['suspended', stores.suspended],
      ['closed', stores.closed],
      ['stopped', stopped.store],
    ]) {
      visibility.visitor[key] = await status(visitor, id);
      visibility.buyer[key] = await status(buyer, id);
    }
    const shown = { open: 200, closing: 200, paused: 200, unpublished: 404, suspended: 404, closed: 404, stopped: 404 };
    expect(visibility.visitor).toEqual(shown);
    expect(visibility.buyer).toEqual(shown);
    expect(visibility.owner).toEqual({ unpublished: 200, closed: 200 });
    expect(visibility.admin).toEqual({ suspended: 200, stopped: 200 });
    await visitor.goto(`${ec}/store/${stores.closing}`);
    await visitor.reload();
    await expect(visitor.locator('.workspace-main')).toContainText('閉店予定');
    await visitor.screenshot({ path: `${evidence}/closing-store-reloaded.png`, fullPage: true });
    await writeFile(
      `${evidence}/cart-and-references.json`,
      JSON.stringify({ cart, references, visibility, closing }, null, 2),
    );
  } finally {
    prepareMember(ownerMember, 'SELLER');
    await Promise.all(contexts.map((c) => c.close()));
  }
});
