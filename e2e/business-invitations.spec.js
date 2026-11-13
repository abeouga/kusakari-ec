import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  password,
  prepareMember,
  productInput,
  add,
  checkout,
  confirmSignUpTestAccount,
  deletePasswordTestAccount,
} from './business-helpers.js';
import { sql } from './database.js';

const evidence = 'artifacts/business/invitations';

/** @param {string} value */
function uuid(value) {
  if (!/^[a-f0-9-]{36}$/.test(value)) throw new Error('Unexpected id.');
  return value;
}

/** @param {import('@playwright/test').APIRequestContext} request @param {string} email @param {string} secret @param {string} invitationKey */
function signUpWithKey(request, email, secret, invitationKey) {
  return call(request, '/auth/signup', 'POST', {
    email,
    password: secret,
    confirmPassword: secret,
    business: false,
    invitationKey,
  });
}

/** @param {import('@playwright/test').APIResponse} response */
async function expectInvalidKey(response) {
  expect(response.status(), await response.text()).toBe(400);
  expect((await response.json()).code).toBe('INVITATION_INVALID');
}

// Issue #111: a store's key registers a new account as a staff member without a role; a MANAGER then assigns STAFF.
test('invitation keys register unassigned staff and a MANAGER assigns STAFF', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const contexts = await Promise.all([1, 2, 3, 4].map(() => browser.newContext()));
  const [seller, invitee, other, buyer] = await Promise.all(contexts.map((c) => c.newPage()));
  const registered = /** @type {string[]} */ ([]);
  const manager = await login(seller, 'test.seller@example.com');
  prepareMember(manager, 'SELLER');
  let product = null;
  try {
    // The MANAGER issues a multi-use key on the invitation page; key and registration URL are shown once.
    await seller.goto(`${ec}/seller/invitations`);
    await seller.getByLabel('有効期限内なら何回でも').check();
    const issuedResponse = seller.waitForResponse(
      (r) => r.url().endsWith('/api/seller/stores/1/invitations') && r.request().method() === 'POST',
    );
    await seller.getByRole('button', { name: '招待キーを発行', exact: true }).click();
    const multi = await (await issuedResponse).json();
    const shown = seller.getByRole('group', { name: '発行した招待キー' });
    await expect(shown.getByLabel('招待キー', { exact: true })).toHaveValue(multi.key);
    await expect(shown.getByLabel('登録用URL')).toHaveValue(`${ec}/account/login?invite=${multi.key}`);
    await seller.screenshot({ path: `${evidence}/issued.png`, fullPage: true });
    expect(multi.maxUses).toBeNull();
    expect(new Date(multi.expiresAt).getTime() - Date.now()).toBeGreaterThan(29.9 * 24 * 3600 * 1000);
    const single = await call(seller.request, '/seller/stores/1/invitations', 'POST', { singleUse: true }).then((r) =>
      r.json(),
    );
    // Only the hash is stored.
    expect(
      sql(`SELECT COUNT(*) FROM store_invitations WHERE key_hash='${single.key}' OR key_hash='${multi.key}';`),
    ).toBe('0');

    // A new account registers on the invitation entrance of the login card, the key filled in from the URL.
    const first = { email: `password-${randomUUID()}@example.com`, secret: `Aa9!${randomUUID()}` };
    await invitee.goto(`${ec}/account/login?invite=${single.key}`);
    await expect(invitee.getByRole('heading', { name: '招待キーで登録' })).toBeVisible();
    await expect(invitee.getByLabel('招待キー', { exact: true })).toHaveValue(single.key);
    await expect(invitee.getByText('企業様向け：出店を申請するアカウントとして登録する')).toHaveCount(0);
    await invitee.getByLabel('メールアドレス', { exact: true }).fill(first.email);
    await invitee.getByLabel('パスワード（8文字以上）').fill(first.secret);
    await invitee.getByLabel('パスワード（確認）').fill(first.secret);
    await invitee.getByRole('button', { name: '確認コードを送信' }).click();
    registered.push(first.email);
    await expect(invitee.getByLabel('確認コード')).toBeVisible();
    // The member exists from the registration on: SHOP_STAFF, in the organization and store 1 without a role.
    const created = sql(`SELECT m.id, m.account_type, om.organization_id, IFNULL(sm.role,'NONE'), u.invitation_id
      FROM members m JOIN organization_members om ON om.member_id=m.id JOIN store_members sm ON sm.member_id=m.id
      JOIN store_invitation_uses u ON u.member_id=m.id WHERE m.email='${first.email}';`).split('\t');
    expect(created.slice(1)).toEqual(['SHOP_STAFF', '1', 'NONE', single.id]);
    confirmSignUpTestAccount(first.email);
    const staff = await login(invitee, first.email, first.secret);
    expect(staff).toMatchObject({ id: created[0], accountType: 'SHOP_STAFF', organizationId: 1, storeIds: [] });

    // Unassigned: store information and products are readable, orders, the account list and keys are not.
    const stores = await call(invitee.request, '/seller/stores').then((r) => r.json());
    expect(stores.map((s) => [s.id, s.memberRole])).toEqual([[1, 'NONE']]);
    expect((await call(invitee.request, '/seller/products?storeId=1')).status()).toBe(200);
    for (const [path, method, data] of [
      ['/seller/orders?storeId=1', 'GET'],
      ['/seller/accounts', 'GET'],
      ['/seller/stores/1/invitations', 'GET'],
      ['/seller/stores/1/invitations', 'POST', { singleUse: true }],
      ['/products', 'POST', productInput()],
    ])
      expect((await call(invitee.request, path, method, data)).status(), `${method} ${path}`).toBe(403);
    await invitee.goto(`${ec}/seller/products`);
    await expect(invitee.getByRole('link', { name: 'アカウント' })).toHaveCount(0);
    await expect(invitee.getByRole('link', { name: '招待キー' })).toHaveCount(0);

    // A single-use key admits nobody else; a revoked, expired or unknown key admits nobody (no Cognito user is made).
    const unused = `password-${randomUUID()}@example.com`;
    await expectInvalidKey(await signUpWithKey(other.request, unused, `Aa9!${randomUUID()}`, single.key));
    const revoked = await call(seller.request, '/seller/stores/1/invitations', 'POST', { singleUse: false }).then((r) =>
      r.json(),
    );
    expect((await call(seller.request, `/seller/invitations/${revoked.id}/revoke`, 'POST')).status()).toBe(200);
    await expectInvalidKey(await signUpWithKey(other.request, unused, `Aa9!${randomUUID()}`, revoked.key));
    const expired = await call(seller.request, '/seller/stores/1/invitations', 'POST', { singleUse: false }).then((r) =>
      r.json(),
    );
    sql(`UPDATE store_invitations SET expires_at=NOW(6) - INTERVAL 1 SECOND WHERE id='${uuid(expired.id)}';`);
    await expectInvalidKey(await signUpWithKey(other.request, unused, `Aa9!${randomUUID()}`, expired.key));
    const unknown = randomBytes(32).toString('base64url');
    await expectInvalidKey(await signUpWithKey(other.request, unused, `Aa9!${randomUUID()}`, unknown));
    expect(sql(`SELECT COUNT(*) FROM members WHERE email='${unused}';`)).toBe('0');
    // The registration card explains the refusal.
    await other.goto(`${ec}/account/login?invite=${revoked.key}`);
    await other.getByLabel('メールアドレス', { exact: true }).fill(unused);
    await other.getByLabel('パスワード（8文字以上）').fill(password);
    await other.getByLabel('パスワード（確認）').fill(password);
    await other.getByRole('button', { name: '確認コードを送信' }).click();
    await expect(other.getByRole('alert')).toContainText('招待キーが無効です');
    await other.screenshot({ path: `${evidence}/revoked-key.png`, fullPage: true });

    // An existing buyer cannot join with a key: the address is already registered, and a signed-in buyer is told so.
    const existing = await signUpWithKey(other.request, 'test.user@example.com', password, multi.key);
    expect(existing.status()).toBe(409);
    expect((await existing.json()).code).toBe('EMAIL_IN_USE');
    prepareMember(await login(buyer, 'test.user@example.com'), 'USER');
    await buyer.goto(`${ec}/account/login?invite=${multi.key}`);
    await expect(buyer.getByRole('alert')).toContainText('招待キーは新規登録のときだけ使えます');

    // A multi-use key admits a second person.
    const second = { email: `password-${randomUUID()}@example.com`, secret: `Aa9!${randomUUID()}` };
    const accepted = await signUpWithKey(other.request, second.email, second.secret, multi.key);
    registered.push(second.email);
    expect(accepted.status(), await accepted.text()).toBe(200);
    expect(sql(`SELECT COUNT(*) FROM store_invitation_uses WHERE invitation_id='${uuid(multi.id)}';`)).toBe('1');

    // The MANAGER sees both new members and assigns STAFF to the first on the account page.
    await seller.goto(`${ec}/seller/accounts`);
    const role = seller.getByLabel(`${first.email}の二子玉川ガーデンのロール`);
    await expect(role).toHaveValue('NONE');
    await expect(seller.getByLabel(`${second.email}の二子玉川ガーデンのロール`)).toHaveValue('NONE');
    await role.selectOption('STAFF');
    await expect(seller.locator('.workspace-main').getByRole('status').filter({ hasText: 'ロールを' })).toContainText(
      '「STAFF」にしました',
    );
    // A MANAGER cannot give MANAGER.
    const refused = await call(seller.request, `/seller/accounts/${staff.id}/stores/1`, 'PUT', { role: 'MANAGER' });
    expect(refused.status()).toBe(403);
    await seller.reload();
    await expect(seller.getByLabel(`${first.email}の二子玉川ガーデンのロール`)).toHaveValue('STAFF');
    await seller.screenshot({ path: `${evidence}/accounts-manager-reloaded.png`, fullPage: true });

    // As STAFF the new member edits a product registered by the MANAGER and hands over its order.
    const input = productInput();
    product = await call(seller.request, '/products', 'POST', input).then((r) => r.json());
    const edited = await call(invitee.request, `/products/${product.id}`, 'PUT', { ...input, priceYen: 2400 });
    expect(edited.status(), await edited.text()).toBe(200);
    await add(buyer.request, product.id);
    const { order } = await checkout(buyer.request);
    const ready = await call(invitee.request, `/seller/orders/${order.id}/status`, 'PUT', {
      expectedStatus: 'ACCEPTED',
      status: 'READY',
    });
    expect(ready.status(), await ready.text()).toBe(200);
    await invitee.goto(`${ec}/seller/orders`);
    await invitee.reload();
    await expect(invitee.getByTestId(`order-${order.id}`)).toBeVisible();
    await invitee.screenshot({ path: `${evidence}/staff-orders-reloaded.png`, fullPage: true });

    // Back to no role: the product can no longer be changed.
    await call(seller.request, `/seller/accounts/${staff.id}/stores/1`, 'PUT', { role: 'NONE' });
    expect((await call(invitee.request, `/products/${product.id}`, 'PUT', { ...input, priceYen: 2500 })).status()).toBe(
      404,
    );

    await seller.goto(`${ec}/seller/invitations`);
    await seller.reload();
    await expect(seller.getByRole('cell', { name: first.email })).toBeVisible();
    await seller.screenshot({ path: `${evidence}/invitations-reloaded.png`, fullPage: true });
    const listed = await call(seller.request, '/seller/stores/1/invitations').then((r) => r.json());
    const status = Object.fromEntries(listed.map((i) => [i.id, i.status]));
    expect([status[single.id], status[multi.id], status[revoked.id], status[expired.id]]).toEqual([
      'USED_UP',
      'ACTIVE',
      'REVOKED',
      'EXPIRED',
    ]);
    const accounts = await call(seller.request, '/seller/accounts').then((r) => r.json());
    await writeFile(
      `${evidence}/invitations-and-accounts.json`,
      JSON.stringify(
        {
          invitations: listed.filter(
            (i) => status[i.id] && [single.id, multi.id, revoked.id, expired.id].includes(i.id),
          ),
          accounts,
        },
        null,
        2,
      ),
    );
  } finally {
    if (product) await call(seller.request, `/products/${product.id}`, 'DELETE');
    for (const email of registered) {
      sql(
        `DELETE FROM organization_members WHERE member_id IN (SELECT id FROM (SELECT id FROM members WHERE email='${email}') x);`,
      );
      deletePasswordTestAccount(email);
    }
    prepareMember(manager, 'SELLER');
    await Promise.all(contexts.map((c) => c.close()));
  }
});
