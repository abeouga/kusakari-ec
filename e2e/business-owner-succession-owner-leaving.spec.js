import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  capture,
  prepareMember,
  createPasswordTestAccount,
  deletePasswordTestAccount,
  successionResults,
  pendingDeadline,
  endingNotices,
  rename,
  productInput,
  add,
} from './business-helpers.js';
import { sql, sqlInBackground } from './database.js';
import { ADMIN_EMAIL } from './test-accounts.js';

const evidence = 'artifacts/business/owner-succession-owner-leaving';
const ENDED = 'この申し出は終わったため、承認も断りもできません。';
const NAMES = ['会員A', '会員B', '会員C'];

/** @param {string} query */
const rows = (query) => {
  const result = sql(query);
  return result ? result.split(/\r?\n/) : [];
};

/**
 * A test-owned organization with one published store and no products, owned by `owner`, with `successor` as staff of
 * that store. The sample organization has listed products, and an owner cannot withdraw while any is listed.
 * @param {{id:string}} owner @param {{id:string}} successor
 */
function ownOrganization(owner, successor) {
  prepareMember(owner, 'USER');
  prepareMember(successor, 'USER');
  const suffix = randomUUID().slice(0, 8);
  const [organization, store] = sql(`UPDATE members SET account_type='SHOP_OWNER' WHERE id='${owner.id}';
    INSERT INTO organizations(name,owner_member_id) VALUES('譲渡確認組織 ${suffix}','${owner.id}');
    SET @org = LAST_INSERT_ID();
    INSERT INTO stores(organization_id,name,address,business_hours,published)
      VALUES(@org,'譲渡確認店 ${suffix}','東京都 検証用店舗','10:00-18:00',TRUE);
    SET @store = LAST_INSERT_ID();
    UPDATE members SET account_type='SHOP_STAFF' WHERE id='${successor.id}';
    INSERT INTO organization_members(organization_id,member_id) VALUES(@org,'${successor.id}');
    INSERT INTO store_members(store_id,member_id,organization_id,role) VALUES(@store,'${successor.id}',@org,'STAFF');
    SELECT @org, @store;`)
    .split('\t')
    .map(Number);
  return { organization, store };
}

/** @param {number} organization the owner and the successor waiting for approval ('NULL' when none) */
const standing = (organization) =>
  sql(`SELECT CONCAT_WS('|', IFNULL(owner_member_id,'NULL'), IFNULL(pending_owner_member_id,'NULL'))
         FROM organizations WHERE id=${organization};`);

/** True while another session holds the row: FOR UPDATE NOWAIT fails at once instead of waiting. @param {string} row */
function locked(row) {
  try {
    sql(`SELECT id FROM ${row} FOR UPDATE NOWAIT;`);
    return false;
  } catch {
    return true;
  }
}

/** @param {import('@playwright/test').APIResponse} response */
const code = async (response) => [response.status(), (await response.json()).code];

/** @param {import('@playwright/test').Page} page @param {string} path */
const read = (page, path) => call(page.request, path).then((r) => r.json());

/** @param {import('@playwright/test').Page} page */
const requestCard = (page) =>
  page
    .locator('.workspace-card')
    .filter({ has: page.getByRole('heading', { name: 'オーナーの譲渡の申し出', exact: true }) })
    .first();

/**
 * Sends a request with a CSRF token taken before, so that requests of several sessions leave at the same moment.
 * @param {import('@playwright/test').Page} page @param {{headerName:string,token:string}} csrf
 * @param {string} path @param {string} method @param {unknown} [data]
 */
const send = (page, csrf, path, method, data) =>
  page.request.fetch(`${ec}/api${path}`, { method, data, headers: { [csrf.headerName]: csrf.token } });

// Issue #205 (2026-11-20 に足した作業): when the owner who made the request withdraws or is stopped by the operator while
// it waits for approval, the request becomes invalid in the same transaction, recorded as invalidated by that owner,
// and both the owner and the successor are told why (#200 の決めること 1・5). The owner's withdrawal locks the stores,
// then the organization, then the member, so an approval and a checkout at the same time cannot make a deadlock.
test('the owner withdrawing or being stopped invalidates the owner succession request', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const accounts = [createPasswordTestAccount(), createPasswordTestAccount(), createPasswordTestAccount()];
  /** @type {import('@playwright/test').BrowserContext[]} */ const contexts = [];
  /** @type {import('@playwright/test').Page[]} */ const pages = [];
  /** @type {{id:string}[]} */ const members = [];
  try {
    for (const account of accounts) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      members.push(await login(page, account.email, account.secret));
    }
    const operatorContext = await browser.newContext();
    contexts.push(operatorContext);
    const operatorPage = await operatorContext.newPage();
    prepareMember(await login(operatorPage, ADMIN_EMAIL), 'ADMIN');
    const [pageA, pageB, pageC] = pages;
    const [memberA, memberB, memberC] = members;
    rename(Object.fromEntries(NAMES.map((name, i) => [name, members[i]])));
    const nameOf = (/** @type {{id:string}} */ member) => NAMES[members.indexOf(member)];

    // First the organization of A, with B as the successor.
    let { organization, store } = ownOrganization(memberA, memberB);
    let [owner, successor, ownerPage, successorPage] = [memberA, memberB, pageA, pageB];
    const organizations = [organization];
    const baseline = Number(sql('SELECT IFNULL(MAX(id),0) FROM organization_member_events;'));
    const events = () =>
      rows(`SELECT CONCAT_WS('|', organization_id, event_type, actor_member_id, target_member_id, IFNULL(store_id,'NULL'))
              FROM organization_member_events WHERE id > ${baseline} AND organization_id IN (${organizations.join(',')})
               AND event_type LIKE 'OWNER_SUCCESSION%' ORDER BY id;`);
    /** @type {string[]} */ const listed = [];
    /** @param {string} type @param {{id:string}} actor @param {{id:string}} target */
    const event = (type, actor, target) => `${organization}|OWNER_SUCCESSION_${type}|${actor.id}|${target.id}|NULL`;
    const request = async () => {
      const response = await call(ownerPage.request, `/seller/accounts/${successor.id}/owner-succession`, 'POST');
      expect(response.status(), await response.text()).toBe(200);
      listed.push(event('REQUEST', owner, successor));
    };
    // The result notices each account should have received so far (#203, #200 の決めること 1).
    /** @type {unknown[][]} */ const expected = [[], [], []];
    const results = () => members.map(successionResults);
    /** @param {'expired'|'owner-disabled'|'owner-withdrawn'} ending @param {string} [deadline] */
    const invalidated = (ending, deadline) => {
      // The owner who made the request is the actor of the invalidation, also when it is the owner who left (#196 の 6).
      listed.push(event('AUTO_INVALIDATED', owner, successor));
      const names = { owner: nameOf(owner), successor: nameOf(successor), deadline };
      const [toOwner, toSuccessor] = endingNotices(ending, names, organization);
      expected[members.indexOf(owner)].push(toOwner);
      expected[members.indexOf(successor)].push(toSuccessor);
    };
    /** @param {{id:string}} member @param {boolean} enabled */
    const setEnabled = (member, enabled) =>
      call(operatorPage.request, `/operator/members/${member.id}/enabled`, 'PUT', { enabled }).then((r) => r.status());
    const approve = () => call(successorPage.request, '/seller/owner-succession/approval', 'POST');

    // Stopping the owner without a waiting request records nothing. The stop ends the owner's session.
    expect(await setEnabled(owner, false)).toBe(200);
    expect(await setEnabled(owner, true)).toBe(200);
    await login(ownerPage, accounts[0].email, accounts[0].secret);
    expect(events()).toEqual([]);
    expect(results()).toEqual(expected);

    // The operator stops the owner from the member page while the request waits: the request is invalidated in the
    // same transaction, and the successor's request notice says it ended.
    await request();
    await operatorPage.goto(`${ec}/operator/members`);
    const ownerEmail = accounts[0].email;
    // The part before @ finds the account too, and keeps the address out of the screenshot's search box.
    await operatorPage.getByLabel('名前・メール検索').fill(ownerEmail.slice(0, ownerEmail.indexOf('@')));
    const memberCard = operatorPage.locator('section.workspace-card').filter({ hasText: ownerEmail });
    await memberCard.getByRole('button', { name: '利用を停止', exact: true }).click();
    await operatorPage
      .getByRole('alertdialog', { name: '利用状況変更の確認' })
      .getByRole('button', { name: '利用停止を確定', exact: true })
      .click();
    await expect(operatorPage.getByText('利用を停止しました。')).toBeVisible();
    invalidated('owner-disabled');
    expect(standing(organization)).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual(expected);
    await successorPage.goto(`${ec}/seller/notifications`);
    await expect(successorPage.locator('.workspace-card').first()).toContainText(
      'オーナーの利用が運営に停止されたため',
    );
    await expect(requestCard(successorPage)).toContainText(ENDED);
    await expect(
      successorPage.locator('.workspace-main').getByRole('button', { name: /^(承認する|断る)$/ }),
    ).toHaveCount(0);
    await capture(successorPage, `${evidence}/successor-notices-after-owner-stopped-reloaded.png`);
    expect(await code(await approve())).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
    expect(await code(await call(ownerPage.request, '/auth/me'))).toEqual([403, 'ACCOUNT_DISABLED']);
    expect(await setEnabled(owner, true)).toBe(200);
    expect(standing(organization)).toBe(`${owner.id}|NULL`);
    await login(ownerPage, accounts[0].email, accounts[0].secret);

    // A request whose deadline had passed before the stop ended by its deadline, and says so (#194 の 16).
    await request();
    sql(`UPDATE organizations SET pending_owner_expires_at = pending_owner_expires_at - INTERVAL 31 MINUTE
          WHERE id=${organization};`);
    const deadline = pendingDeadline(organization);
    expect(await setEnabled(owner, false)).toBe(200);
    invalidated('expired', deadline);
    expect(standing(organization)).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual(expected);
    expect(await setEnabled(owner, true)).toBe(200);
    await login(ownerPage, accounts[0].email, accounts[0].secret);

    // An approval, the owner's withdrawal and a checkout at the organization's store, sent at the same moment, all
    // finish without a deadlock. The approval and the checkout succeed. The owner cannot withdraw while a product is
    // listed; when the approval came first, A withdraws as the ORG_ADMIN it has become.
    const created = await call(operatorPage.request, '/products', 'POST', { ...productInput(), storeId: store });
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();
    await add(pageC.request, product.id, 1);
    const cart = await read(pageC, '/cart');
    await request();
    const tokens = await Promise.all([ownerPage, successorPage, pageC].map((page) => read(page, '/auth/csrf')));
    const [withdrawal, approval, checkout] = await Promise.all([
      send(ownerPage, tokens[0], '/account', 'DELETE'),
      send(successorPage, tokens[1], '/seller/owner-succession/approval', 'POST'),
      send(pageC, tokens[2], '/orders', 'POST', {
        requestId: randomUUID(),
        revision: cart.revision,
        expectedTotalYen: cart.totalYen,
        paymentMethod: 'PAY_AT_STORE',
      }),
    ]);
    expect(approval.status(), await approval.text()).toBe(200);
    expect(checkout.status(), await checkout.text()).toBe(200);
    const withdrawn = await withdrawal.json();
    expect([withdrawal.status(), withdrawn.code]).toEqual(
      withdrawal.status() === 200 ? [200, undefined] : [409, 'WITHDRAWAL_LISTED_PRODUCTS'],
    );
    expect(standing(organization)).toBe(`${successor.id}|NULL`);
    listed.push(event('APPROVAL', successor, successor));
    expect(events()).toEqual(listed);
    const changed = expect.stringMatching(/^オーナーが交代しました\|/);
    expected[0].push(changed);
    expected[1].push(changed);
    expect(results()).toEqual(expected);
    const race = { withdrawal: [withdrawal.status(), withdrawn], orders: (await checkout.json()).orders.length };

    // Then the organization of B, with C as the successor. B withdraws from the account page while other sessions hold
    // the rows as an approval (the organization, then after a pause the owner) and a checkout (the store, then after a
    // pause the organization) do. The withdrawal waits for both and invalidates the request; had it locked the owner
    // before the store, as it did before, the three would wait for each other and MySQL would fail one of them.
    ({ organization, store } = ownOrganization(memberB, memberC));
    organizations.push(organization);
    [owner, successor, ownerPage, successorPage] = [memberB, memberC, pageB, pageC];
    await request();
    await ownerPage.goto(`${ec}/account/delete`);
    await ownerPage.getByLabel('注意事項を確認し、退会することに同意します', { exact: true }).check();
    const approvalSession = sqlInBackground(`START TRANSACTION;
      SELECT id FROM organizations WHERE id=${organization} FOR UPDATE;
      SELECT SLEEP(3);
      SELECT id FROM members WHERE id='${owner.id}' FOR UPDATE;
      COMMIT;`);
    await expect.poll(() => locked(`organizations WHERE id=${organization}`), { timeout: 4000 }).toBe(true);
    const checkoutSession = sqlInBackground(`START TRANSACTION;
      SELECT id FROM stores WHERE id=${store} FOR UPDATE;
      SELECT SLEEP(3);
      SELECT id FROM organizations WHERE id=${organization} LOCK IN SHARE MODE;
      COMMIT;`);
    await expect.poll(() => locked(`stores WHERE id=${store}`), { timeout: 4000 }).toBe(true);
    const [response] = await Promise.all([
      ownerPage.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/account' && r.request().method() === 'DELETE',
      ),
      ownerPage.getByRole('button', { name: 'アカウントを削除する', exact: true }).click(),
    ]);
    await Promise.all([approvalSession, checkoutSession]);
    expect(response.status()).toBe(200);
    await expect(ownerPage.getByText('退会が完了しました。ご利用ありがとうございました。')).toBeVisible();
    invalidated('owner-withdrawn');
    expect(standing(organization)).toBe(`${owner.id}|NULL`);
    expect(sql(`SELECT CONCAT_WS('|', enabled, withdrawn_at IS NOT NULL) FROM members WHERE id='${owner.id}';`)).toBe(
      '0|1',
    );
    expect(events()).toEqual(listed);
    expect(results()).toEqual(expected);

    // The successor's notices, after reloading: why the request ended on top, and the request without buttons.
    await successorPage.goto(`${ec}/seller/notifications`);
    await expect(successorPage.locator('.workspace-card').first()).toContainText('オーナーが退会したため');
    await expect(requestCard(successorPage)).toContainText(ENDED);
    await capture(successorPage, `${evidence}/successor-notices-after-owner-withdrawal-reloaded.png`);
    expect(await code(await approve())).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
    await writeFile(
      `${evidence}/owner-succession-owner-leaving.json`,
      JSON.stringify(
        {
          race,
          organizations: organizations.map((id) => ({ id, standing: standing(id) })),
          events: events(),
          successorNotices: await read(successorPage, '/notifications'),
          resultNotices: Object.fromEntries(NAMES.map((name, i) => [name, successionResults(members[i])])),
        },
        null,
        2,
      ),
    );
  } finally {
    // The Cognito accounts go first, so a failing database step cannot leave them behind.
    for (const account of accounts) deletePasswordTestAccount(account.email);
    for (const member of members) prepareMember(member, 'USER');
    for (const context of contexts) await context.close();
  }
});
