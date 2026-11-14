import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  prepareMember,
  prepareStaff,
  productInput,
  add,
  checkout,
  createPasswordTestAccount,
  deletePasswordTestAccount,
} from './business-helpers.js';
import { sql } from './database.js';

const evidence = 'artifacts/business/invitations';

/**
 * Temporary Cognito accounts (no sign-up mail) signed in on their own pages. The first login creates the member.
 * @param {import('@playwright/test').Browser} browser @param {number} count
 */
async function temporaryAccounts(browser, count) {
  const accounts = [];
  for (let i = 0; i < count; i += 1) {
    const account = createPasswordTestAccount();
    const membersBefore = Number(sql(`SELECT COUNT(*) FROM members WHERE email='${account.email}';`));
    const context = await browser.newContext();
    const page = await context.newPage();
    const member = await login(page, account.email, account.secret);
    accounts.push({ ...account, context, page, member, membersBefore });
  }
  return accounts;
}

/** @param {{email:string,member:{id:string},context:import('@playwright/test').BrowserContext}[]} accounts */
async function removeAccounts(accounts) {
  for (const account of accounts) {
    prepareMember(account.member, 'USER');
    deletePasswordTestAccount(account.email);
    await account.context.close();
  }
}

/** @param {import('@playwright/test').APIRequestContext} request @param {number} storeId */
async function createProduct(request, storeId) {
  const input = { ...productInput(), storeId };
  const response = await call(request, '/products', 'POST', input);
  expect(response.status(), await response.text()).toBe(200);
  return { input, product: await response.json() };
}

// Issue #111: who sees which accounts and who may assign which roles (StaffPolicy).
test('account list scope and role assignment permissions', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const context = await browser.newContext();
  const seller = await context.newPage();
  const manager = await login(seller, 'test.seller@example.com');
  prepareMember(manager, 'SELLER');
  const [owner, staff, otherStaff, admin] = await temporaryAccounts(browser, 4);
  try {
    prepareMember(owner.member, 'SHOP_OWNER');
    prepareStaff(staff.member, { 1: 'STAFF' });
    prepareStaff(otherStaff.member, { 2: 'STAFF' });
    prepareStaff(admin.member, { 1: 'STAFF' });
    const list = async (page) => call(page.request, '/seller/accounts').then((r) => r.json());
    const ids = (view) => view.accounts.map((a) => a.memberId);

    // MANAGER: the staff of their own store only, without the owner; STAFF: no list.
    const managerView = await list(seller);
    expect(managerView.stores.map((s) => s.id)).toEqual([1]);
    expect(ids(managerView)).toEqual(expect.arrayContaining([staff.member.id, admin.member.id, manager.id]));
    expect(ids(managerView)).not.toContain(otherStaff.member.id);
    expect(ids(managerView)).not.toContain(owner.member.id);
    expect((await call(staff.page.request, '/seller/accounts')).status()).toBe(403);
    // The owner: everyone, the owner listed but not changeable.
    const ownerView = await list(owner.page);
    expect(ownerView.stores.map((s) => s.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(ids(ownerView)).toEqual(expect.arrayContaining([owner.member.id, staff.member.id, otherStaff.member.id]));
    expect(ownerView.accounts.find((a) => a.memberId === owner.member.id)).toMatchObject({
      owner: true,
      organizationRoleEditable: false,
      assignments: [],
    });
    const assign = (page, member, store, role) =>
      call(page.request, `/seller/accounts/${member}/stores/${store}`, 'PUT', { role }).then((r) => r.status());
    const orgRole = (page, member, organizationAdmin) =>
      call(page.request, `/seller/accounts/${member}/organization-role`, 'PUT', { organizationAdmin }).then((r) =>
        r.status(),
      );
    expect(await assign(owner.page, owner.member.id, 1, 'STAFF')).toBe(404);

    // ORG_ADMIN is given and taken by the owner only.
    expect(await orgRole(seller, staff.member.id, true)).toBe(403);
    expect(await orgRole(owner.page, admin.member.id, true)).toBe(200);
    expect(await orgRole(admin.page, staff.member.id, true)).toBe(403);
    expect((await call(admin.page.request, '/auth/me').then((r) => r.json())).organizationRole).toBe('ORG_ADMIN');

    // MANAGER: STAFF and no role at their own store; not MANAGER, not another store, not adding a store.
    expect(await assign(seller, staff.member.id, 1, 'MANAGER')).toBe(403);
    expect(await assign(seller, otherStaff.member.id, 2, 'NONE')).toBe(403);
    expect(await assign(seller, staff.member.id, 2, 'STAFF')).toBe(403);
    expect(await assign(seller, staff.member.id, 1, 'NONE')).toBe(200);
    expect(await assign(seller, staff.member.id, 1, 'STAFF')).toBe(200);
    expect((await call(seller.request, `/seller/accounts/${staff.member.id}/stores/1`, 'DELETE')).status()).toBe(403);
    // ORG_ADMIN: every store of the organization, MANAGER included, and adding/removing another store.
    expect(await assign(admin.page, otherStaff.member.id, 3, 'MANAGER')).toBe(200);
    expect(await assign(admin.page, otherStaff.member.id, 2, 'MANAGER')).toBe(200);
    expect(
      (await call(admin.page.request, `/seller/accounts/${otherStaff.member.id}/stores/3`, 'DELETE')).status(),
    ).toBe(200);
    const roles = sql(
      `SELECT CONCAT(store_id,':',IFNULL(role,'NONE')) FROM store_members WHERE member_id='${otherStaff.member.id}' ORDER BY store_id;`,
    );
    expect(roles).toBe('2:MANAGER');

    // ORG_ADMIN's store choice: every store; without a role there, only the personnel pages.
    const candidates = await call(admin.page.request, '/seller/stores').then((r) => r.json());
    expect(candidates.map((s) => [s.id, s.memberRole])).toEqual(
      expect.arrayContaining([
        [1, 'STAFF'],
        [2, null],
        [3, null],
      ]),
    );
    expect((await call(admin.page.request, '/seller/products?storeId=2')).status()).toBe(403);
    expect((await call(admin.page.request, '/seller/stores/2/invitations')).status()).toBe(200);
    await admin.page.goto(`${ec}/seller/products`);
    await admin.page.getByLabel('管理する店舗').selectOption('2');
    const note = admin.page.getByRole('note').filter({ hasText: '人事（アカウント・招待キー）の画面だけを使えます' });
    await expect(note).toBeVisible();
    await admin.page.reload();
    await expect(note).toBeVisible();
    await expect(admin.page.getByLabel('管理する店舗')).toHaveValue('2');
    await expect(
      admin.page.getByRole('navigation', { name: '出店者メニュー' }).getByRole('link', { name: 'アカウント' }),
    ).toBeVisible();
    await admin.page.screenshot({ path: `${evidence}/org-admin-personnel-only-reloaded.png`, fullPage: true });

    // The owner's account page: the ORG_ADMIN switch, kept after a reload.
    await owner.page.goto(`${ec}/seller/accounts`);
    // The switch shows the saved state, so it turns on once the server has stored it.
    await owner.page.getByLabel(`${staff.email}を ORG_ADMIN にする`).click();
    await expect(owner.page.getByText(`${staff.email}を ORG_ADMIN にしました。`)).toBeVisible();
    await expect(owner.page.getByLabel(`${staff.email}を ORG_ADMIN にする`)).toBeChecked();
    await owner.page.reload();
    await expect(owner.page.getByLabel(`${staff.email}を ORG_ADMIN にする`)).toBeChecked();
    await expect(owner.page.getByRole('cell', { name: 'オーナー（全店舗）' }).first()).toBeVisible();
    await owner.page.screenshot({ path: `${evidence}/accounts-owner-reloaded.png`, fullPage: true });
    await writeFile(
      `${evidence}/account-scope.json`,
      JSON.stringify({ manager: managerView, owner: await list(owner.page), orgAdminStores: candidates }, null, 2),
    );
  } finally {
    await removeAccounts([owner, staff, otherStaff, admin]);
    prepareMember(manager, 'SELLER');
    await context.close();
  }
});

// Issue #112: switching the store shows that store's products; the choice survives a reload.
test('store switching shows each store products and survives a reload', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  const manager = await login(page, 'test.seller@example.com');
  prepareStaff(manager, { 1: 'MANAGER', 2: 'MANAGER' });
  const created = [];
  try {
    const first = await createProduct(page.request, 1);
    const second = await createProduct(page.request, 2);
    created.push(first.product, second.product);
    const stores = await call(page.request, '/seller/stores').then((r) => r.json());
    expect(stores.map((s) => [s.id, s.memberRole])).toEqual([
      [1, 'MANAGER'],
      [2, 'MANAGER'],
    ]);
    await page.goto(`${ec}/seller/products`);
    const select = page.getByLabel('管理する店舗');
    await expect(select.locator('option')).toHaveText(['二子玉川ガーデン', '横浜グリーンハウス']);
    await expect(page.getByText(first.input.name, { exact: true }).first()).toBeVisible();
    await select.selectOption('2');
    await expect(page.getByText(second.input.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(first.input.name, { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('管理する店舗')).toHaveValue('2');
    await expect(page.getByText(second.input.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(first.input.name, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${evidence}/store-switch-reloaded.png`, fullPage: true });
    // The other store pages keep the choice too.
    await page.goto(`${ec}/seller/orders`);
    await expect(page.getByLabel('管理する店舗')).toHaveValue('2');
    const products = await call(page.request, '/seller/products?storeId=2').then((r) => r.json());
    expect(products.map((p) => p.id)).toContain(second.product.id);
    expect(products.map((p) => p.id)).not.toContain(first.product.id);
    await writeFile(`${evidence}/store-switch.json`, JSON.stringify({ stores, store2Products: products }, null, 2));
  } finally {
    for (const product of created) await call(page.request, `/products/${product.id}`, 'DELETE');
    prepareMember(manager, 'SELLER');
  }
});

/** A store of another organization, created directly (the operator's organization actions are not built yet). */
function otherOrganizationStore() {
  const suffix = randomUUID().slice(0, 8);
  const organization = sql(`INSERT INTO organizations(name) VALUES('E2E roles ${suffix}'); SELECT LAST_INSERT_ID();`);
  return Number(
    sql(`INSERT INTO stores(organization_id,name,address,business_hours,published)
      VALUES(${Number(organization)},'E2E roles store ${suffix}','Tokyo','10:00-18:00',TRUE); SELECT LAST_INSERT_ID();`),
  );
}

// Issues #110 and #108: products, orders and notices belong to the store; each role operates its own range only.
test('store staff share products, orders and notices; roles limit what each account operates', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const contexts = await Promise.all([1, 2].map(() => browser.newContext()));
  const [seller, buyer] = await Promise.all(contexts.map((c) => c.newPage()));
  const manager = await login(seller, 'test.seller@example.com');
  prepareMember(manager, 'SELLER');
  prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
  const [staff, otherStaff, owner] = await temporaryAccounts(browser, 3);
  // #108: like a Cognito user left after a database reset, an account without a member gets one (USER) at first login.
  expect(staff.membersBefore).toBe(0);
  expect(staff.member).toMatchObject({ authenticated: true, accountType: 'USER' });
  const created = [];
  try {
    prepareStaff(staff.member, { 1: 'STAFF' });
    prepareStaff(otherStaff.member, { 2: 'STAFF' });
    prepareMember(owner.member, 'SHOP_OWNER');

    // #110: a product registered by the MANAGER is edited by another staff member of the same store.
    const { input, product } = await createProduct(seller.request, 1);
    created.push(product);
    const edited = await call(staff.page.request, `/products/${product.id}`, 'PUT', { ...input, priceYen: 3100 });
    expect(edited.status(), await edited.text()).toBe(200);
    expect((await call(otherStaff.page.request, `/products/${product.id}`, 'PUT', input)).status()).toBe(404);
    await staff.page.goto(`${ec}/seller/products`);
    await staff.page.reload();
    await expect(staff.page.getByText(input.name, { exact: true }).first()).toBeVisible();
    await staff.page.screenshot({ path: `${evidence}/staff-edits-shared-product-reloaded.png`, fullPage: true });

    // #110: the order reaches the store; everyone with a role there is told; the other store's staff see nothing.
    await add(buyer.request, product.id);
    const { order } = await checkout(buyer.request);
    const notices = async (page) =>
      call(page.request, '/notifications')
        .then((r) => r.json())
        .then((all) => all.filter((n) => n.body === order.id).map((n) => n.title));
    expect(await notices(seller)).toEqual(['新しい注文が届きました']);
    expect(await notices(staff.page)).toEqual(['新しい注文が届きました']);
    expect(await notices(owner.page)).toEqual(['新しい注文が届きました']);
    expect(await notices(otherStaff.page)).toEqual([]);
    const seen = await call(staff.page.request, '/seller/orders?storeId=1').then((r) => r.json());
    expect(seen.map((o) => o.id)).toContain(order.id);
    expect((await call(otherStaff.page.request, '/seller/orders?storeId=1')).status()).toBe(403);
    expect([403, 404]).toContain((await call(otherStaff.page.request, `/seller/orders/${order.id}`)).status());
    await staff.page.goto(`${ec}/seller/notifications`);
    await staff.page.reload();
    await expect(staff.page.getByText('新しい注文が届きました').first()).toBeVisible();
    await staff.page.screenshot({ path: `${evidence}/staff-notices-reloaded.png`, fullPage: true });

    // #108: the owner operates every store of the organization; MANAGER and STAFF their assigned stores only.
    const third = await createProduct(owner.page.request, 3);
    created.push(third.product);
    const scope = {};
    const status = async (page, path, method = 'GET', data) => (await call(page.request, path, method, data)).status();
    scope.managerOtherStore = await status(seller, '/products', 'POST', { ...productInput(), storeId: 3 });
    scope.managerOtherStoreOrders = await status(seller, '/seller/orders?storeId=3');
    scope.staffCreate = await status(staff.page, '/products', 'POST', productInput());
    const profile = await call(staff.page.request, '/stores/1').then((r) => r.json());
    const { revision, name, contact, email, address, hours, story } = profile;
    const storeInput = { revision, name, contact, email, address, hours, story };
    scope.staffStoreProfile = await status(staff.page, '/seller/stores/1', 'PUT', storeInput);
    scope.staffOrders = await status(staff.page, '/seller/orders?storeId=1');
    scope.staffOtherStore = await status(staff.page, '/seller/products?storeId=2');
    const foreign = otherOrganizationStore();
    scope.ownerForeign = await status(owner.page, '/products', 'POST', { ...productInput(), storeId: foreign });
    scope.ownerForeignProducts = await status(owner.page, `/seller/products?storeId=${foreign}`);
    scope.managerForeign = await status(seller, `/seller/orders?storeId=${foreign}`);
    scope.ownerStore3Orders = await status(owner.page, '/seller/orders?storeId=3');
    expect(scope).toEqual({
      managerOtherStore: 403,
      managerOtherStoreOrders: 403,
      staffCreate: 403,
      staffStoreProfile: 403,
      staffOrders: 200,
      staffOtherStore: 403,
      ownerForeign: 403,
      ownerForeignProducts: 403,
      managerForeign: 403,
      ownerStore3Orders: 200,
    });
    const after = await call(seller.request, `/seller/orders/${order.id}`).then((r) => r.json());
    await writeFile(`${evidence}/store-scope.json`, JSON.stringify({ order: after, scope }, null, 2));
  } finally {
    for (const item of created) await call(owner.page.request, `/products/${item.id}`, 'DELETE');
    await removeAccounts([staff, otherStaff, owner]);
    prepareMember(manager, 'SELLER');
    await Promise.all(contexts.map((c) => c.close()));
  }
});
