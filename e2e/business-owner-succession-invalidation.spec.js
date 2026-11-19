import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  capture,
  prepareMember,
  prepareStaff,
  createFixtureStaff,
  createPasswordTestAccount,
  deletePasswordTestAccount,
  successionResults,
  pendingDeadline,
  endingNotices,
  rename,
} from './business-helpers.js';
import { sql, sqlInBackground } from './database.js';
import { ADMIN_EMAIL } from './test-accounts.js';

const evidence = 'artifacts/business/owner-succession-invalidation';
const OWNER_NAME = '譲渡するオーナー';
const SUCCESSOR_NAME = '譲渡先の担当者';

/** @param {string} query */
const rows = (query) => {
  const result = sql(query);
  return result ? result.split(/\r?\n/) : [];
};

/** The sample organization's owner and the successor waiting for approval ('NULL' when none). */
const organization = () =>
  sql(`SELECT CONCAT_WS('|', IFNULL(owner_member_id,'NULL'), IFNULL(pending_owner_member_id,'NULL'))
         FROM organizations WHERE id=1;`);

/**
 * Moves the request to 31 minutes ago, so its 30-minute deadline passed a minute ago (#194 の 12).
 * @param {{id:string}} member
 */
const expire = (member) =>
  sql(`UPDATE organizations SET pending_owner_expires_at = pending_owner_expires_at - INTERVAL 31 MINUTE
        WHERE id=1 AND pending_owner_member_id='${member.id}';`);

/** True while another session holds the sample organization's row: FOR UPDATE NOWAIT fails at once instead of waiting. */
function organizationLocked() {
  try {
    sql('SELECT id FROM organizations WHERE id=1 FOR UPDATE NOWAIT;');
    return false;
  } catch {
    return true;
  }
}

/**
 * Runs an operation on the successor while another session holds the rows in the approval's order (#204): the
 * organization first, then, after a pause in which the operation starts and waits, the successor's membership and
 * member rows. An operation that took those rows before the organization row would deadlock with that session, and
 * MySQL would fail one of the two.
 * @template T @param {{id:string}} member @param {() => Promise<T>} operation
 */
async function besideApproval(member, operation) {
  const approval = sqlInBackground(`START TRANSACTION;
    SELECT id FROM organizations WHERE id=1 FOR UPDATE;
    SELECT SLEEP(3);
    SELECT member_id FROM organization_members WHERE member_id='${member.id}' FOR UPDATE;
    SELECT id FROM members WHERE id='${member.id}' FOR UPDATE;
    COMMIT;`);
  await expect.poll(organizationLocked, { timeout: 4000 }).toBe(true);
  const result = await operation();
  await approval;
  return result;
}

/** @param {import('@playwright/test').APIResponse} response */
const code = async (response) => [response.status(), (await response.json()).code];

/** @param {import('@playwright/test').Page} page @param {string} path */
const read = (page, path) => call(page.request, path).then((r) => r.json());

// Issue #205: when the successor waiting for approval is expelled, stopped by the operator or withdraws, the request
// becomes invalid in the same transaction and is recorded as invalidated by the owner (#194 の 7・8・13・14、#196 の 5・6).
// The owner and the successor both receive a result notice that says why (#203, #200 の決めること 1).
test('expelling, stopping or withdrawing the successor invalidates the owner succession request', async ({
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const accounts = [createPasswordTestAccount(), createPasswordTestAccount(), createPasswordTestAccount()];
  /** @type {import('@playwright/test').BrowserContext[]} */ const contexts = [];
  /** @type {import('@playwright/test').Page[]} */ const pages = [];
  /** @type {{id:string}[]} */ const members = [];
  /** @type {{id:string}[]} */ const fixtures = [];
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
    const [ownerPage, successorPage, adminPage] = pages;
    const [owner, successor, admin] = members;
    const successorEmail = accounts[1].email;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(successor, { 1: 'STAFF', 2: 'MANAGER' });
    prepareStaff(admin, { 1: 'STAFF' }, true);
    rename({ [OWNER_NAME]: owner, [SUCCESSOR_NAME]: successor });
    const bystander = createFixtureStaff('承認待ちでない担当者');
    fixtures.push(bystander);

    const baseline = Number(sql('SELECT IFNULL(MAX(id),0) FROM organization_member_events;'));
    const events = () =>
      rows(`SELECT CONCAT_WS('|', event_type, actor_member_id, target_member_id, IFNULL(store_id,'NULL'))
              FROM organization_member_events
             WHERE id > ${baseline} AND organization_id=1 AND event_type LIKE 'OWNER_SUCCESSION%' ORDER BY id;`);
    const expulsions = () =>
      rows(`SELECT CONCAT_WS('|', event_type, actor_member_id) FROM organization_member_events
             WHERE id > ${baseline} AND target_member_id='${successor.id}'
               AND event_type IN ('EXPEL_FROM_ORGANIZATION','REINSTATE_TO_ORGANIZATION') ORDER BY id;`);
    /** @type {string[]} */ const listed = [];
    const request = async () => {
      const response = await call(ownerPage.request, `/seller/accounts/${successor.id}/owner-succession`, 'POST');
      expect(response.status()).toBe(200);
      listed.push(`OWNER_SUCCESSION_REQUEST|${owner.id}|${successor.id}|NULL`);
    };
    /** @type {string[]} */ const ownerResults = [];
    /** @type {string[]} */ const successorResults = [];
    const results = () => [successionResults(owner), successionResults(successor)];
    // The owner who made the request is the actor of the invalidation, whoever expelled or stopped (#196 の 6). Both
    // the owner and the successor are told why the request ended; an expired request ended by its deadline.
    /** @param {'expired'|'expelled'|'disabled'|'withdrawn'} ending @param {string} [deadline] */
    const invalidated = (ending, deadline) => {
      listed.push(`OWNER_SUCCESSION_AUTO_INVALIDATED|${owner.id}|${successor.id}|NULL`);
      const [toOwner, toSuccessor] = endingNotices(ending, { owner: OWNER_NAME, successor: SUCCESSOR_NAME, deadline });
      ownerResults.push(toOwner);
      successorResults.push(toSuccessor);
    };
    /** @param {import('@playwright/test').Page} page @param {{id:string}} member @param {'POST'|'DELETE'} method */
    const expulsion = (page, member, method) =>
      call(page.request, `/seller/accounts/${member.id}/expulsion`, method).then((r) => r.status());
    /** @param {{id:string}} member @param {boolean} enabled */
    const setEnabled = (member, enabled) =>
      call(operatorPage.request, `/operator/members/${member.id}/enabled`, 'PUT', { enabled }).then((r) => r.status());
    const approve = () => call(successorPage.request, '/seller/owner-succession/approval', 'POST');

    // Expelling or stopping someone other than the successor leaves the request as it is.
    await request();
    expect(await expulsion(ownerPage, bystander, 'POST')).toBe(200);
    expect(await setEnabled(bystander, false)).toBe(200);
    expect(organization()).toBe(`${owner.id}|${successor.id}`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual([[], []]);
    expect(await setEnabled(bystander, true)).toBe(200);
    expect(await expulsion(ownerPage, bystander, 'DELETE')).toBe(200);

    // The owner expels the successor from the account page: the request disappears together with the expulsion.
    await ownerPage.goto(`${ec}/seller/accounts`);
    const pendingNote = ownerPage.getByText('にオーナーの譲渡を申し出ています。');
    await expect(pendingNote).toBeVisible();
    const successorRow = ownerPage.getByRole('row').filter({ hasText: successorEmail });
    await expect(successorRow).toContainText('承認待ち');
    await successorRow.getByRole('button', { name: '組織から除名' }).click();
    await ownerPage.getByRole('alertdialog').getByRole('button', { name: '除名する' }).click();
    await expect(ownerPage.getByText(`${SUCCESSOR_NAME}を組織から除名しました。`)).toBeVisible();
    await expect(pendingNote).toHaveCount(0);
    invalidated('expelled');
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual([ownerResults, successorResults]);
    await ownerPage.reload();
    await expect(ownerPage.getByRole('columnheader', { name: 'オーナーの譲渡' })).toBeVisible();
    await expect(pendingNote).toHaveCount(0);
    await capture(ownerPage, `${evidence}/owner-accounts-after-expulsion-reloaded.png`);
    const afterExpulsion = await read(ownerPage, '/seller/accounts');
    expect(afterExpulsion.ownerSuccession).toBeNull();

    // The successor's open session ends. Brought back, it signs in again: the old notice has no 承認する or 断る and
    // says the request ended (#204, #200 の決めること 6), and an approval sent anyway finds no request.
    expect(await code(await call(successorPage.request, '/auth/me'))).toEqual([403, 'ACCOUNT_EXPELLED']);
    expect(await expulsion(ownerPage, successor, 'DELETE')).toBe(200);
    await login(successorPage, successorEmail, accounts[1].secret);
    await successorPage.goto(`${ec}/seller/notifications`);
    const requestCard = successorPage
      .locator('.workspace-card')
      .filter({ has: successorPage.getByRole('heading', { name: 'オーナーの譲渡の申し出', exact: true }) })
      .first();
    await expect(requestCard).toContainText('この申し出は終わったため、承認も断りもできません。');
    await expect(
      successorPage.locator('.workspace-main').getByRole('button', { name: /^(承認する|断る)$/ }),
    ).toHaveCount(0);
    await capture(successorPage, `${evidence}/successor-request-ended-reloaded.png`);
    expect(await code(await approve())).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);

    // ORG_ADMIN may expel the successor too. The expulsion is ORG_ADMIN's; the invalidation is still the owner's.
    await request();
    expect(await expulsion(adminPage, successor, 'POST')).toBe(200);
    invalidated('expelled');
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual([ownerResults, successorResults]);
    expect(expulsions()).toEqual([
      `EXPEL_FROM_ORGANIZATION|${owner.id}`,
      `REINSTATE_TO_ORGANIZATION|${owner.id}`,
      `EXPEL_FROM_ORGANIZATION|${admin.id}`,
    ]);
    expect(await expulsion(adminPage, successor, 'DELETE')).toBe(200);

    // An expired request is recorded as invalidated once, whether the expulsion or a read that looks for expired
    // requests (the account list, #194 の 15) reaches it first. Either way it ended by its deadline, and says so.
    for (const listFirst of [false, true]) {
      await request();
      expire(successor);
      const deadline = pendingDeadline();
      if (listFirst) await read(ownerPage, '/seller/accounts');
      expect(await expulsion(ownerPage, successor, 'POST')).toBe(200);
      invalidated('expired', deadline);
      expect((await read(ownerPage, '/seller/accounts')).ownerSuccession).toBeNull();
      expect(events()).toEqual(listed);
      expect(results()).toEqual([ownerResults, successorResults]);
      expect(await expulsion(ownerPage, successor, 'DELETE')).toBe(200);
    }

    // The operator stops the successor from the member page; the request is invalidated in the same transaction.
    await login(successorPage, successorEmail, accounts[1].secret);
    await request();
    await operatorPage.goto(`${ec}/operator/members`);
    const search = operatorPage.getByLabel('名前・メール検索');
    // The part before @ finds the account too, and keeps the address out of the screenshot's search box.
    const searchKey = successorEmail.slice(0, successorEmail.indexOf('@'));
    await search.fill(searchKey);
    const memberCard = operatorPage.locator('section.workspace-card').filter({ hasText: successorEmail });
    await memberCard.getByRole('button', { name: '利用を停止', exact: true }).click();
    await operatorPage
      .getByRole('alertdialog', { name: '利用状況変更の確認' })
      .getByRole('button', { name: '利用停止を確定', exact: true })
      .click();
    await expect(operatorPage.getByText('利用を停止しました。')).toBeVisible();
    invalidated('disabled');
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual([ownerResults, successorResults]);
    await operatorPage.reload();
    await search.fill(searchKey);
    await expect(memberCard).toContainText('利用停止');
    await capture(operatorPage, `${evidence}/operator-member-stopped-reloaded.png`, memberCard);
    expect(await code(await call(successorPage.request, '/auth/me'))).toEqual([403, 'ACCOUNT_DISABLED']);
    expect(await setEnabled(successor, true)).toBe(200);
    await login(successorPage, successorEmail, accounts[1].secret);
    expect(await code(await approve())).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
    expect(organization()).toBe(`${owner.id}|NULL`);

    // Lock order: the expulsion and the stop take the organization row before the membership and member rows, as the
    // request and the approval do, so they wait for an approval in progress instead of deadlocking with it.
    await request();
    expect(await besideApproval(successor, () => expulsion(ownerPage, successor, 'POST'))).toBe(200);
    invalidated('expelled');
    expect(await expulsion(ownerPage, successor, 'DELETE')).toBe(200);
    await request();
    expect(await besideApproval(successor, () => setEnabled(successor, false))).toBe(200);
    invalidated('disabled');
    expect(await setEnabled(successor, true)).toBe(200);
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual([ownerResults, successorResults]);

    // ORG_ADMIN, who is not the successor, withdraws and the request stays. Then the successor withdraws from the
    // account page beside an approval in progress, and the request is invalidated.
    await login(successorPage, successorEmail, accounts[1].secret);
    await request();
    expect((await call(adminPage.request, '/account', 'DELETE')).status()).toBe(200);
    expect(organization()).toBe(`${owner.id}|${successor.id}`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual([ownerResults, successorResults]);
    await successorPage.goto(`${ec}/account/delete`);
    await successorPage.getByLabel('注意事項を確認し、退会することに同意します', { exact: true }).check();
    const withdrawal = await besideApproval(successor, async () => {
      const [response] = await Promise.all([
        successorPage.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/account' && r.request().method() === 'DELETE',
        ),
        successorPage.getByRole('button', { name: 'アカウントを削除する', exact: true }).click(),
      ]);
      return response.status();
    });
    expect(withdrawal).toBe(200);
    await expect(successorPage.getByText('退会が完了しました。ご利用ありがとうございました。')).toBeVisible();
    invalidated('withdrawn');
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);
    expect(results()).toEqual([ownerResults, successorResults]);
    expect(
      sql(`SELECT CONCAT_WS('|', enabled, withdrawn_at IS NOT NULL) FROM members WHERE id='${successor.id}';`),
    ).toBe('0|1');
    expect((await approve()).status()).toBe(401);

    await ownerPage.goto(`${ec}/seller/accounts`);
    await expect(ownerPage.getByRole('columnheader', { name: 'オーナーの譲渡' })).toBeVisible();
    await expect(pendingNote).toHaveCount(0);
    await capture(ownerPage, `${evidence}/owner-accounts-after-withdrawal-reloaded.png`);
    // The owner's notices, newest first: the withdrawal, then the stop beside the approval.
    await ownerPage.goto(`${ec}/seller/notifications`);
    const ownerCards = ownerPage.locator('.workspace-card');
    await expect(ownerCards.first()).toContainText(ownerResults.at(-1).split('|')[1]);
    await expect(ownerCards.nth(1)).toContainText(ownerResults.at(-2).split('|')[1]);
    await capture(ownerPage, `${evidence}/owner-notices-after-withdrawal-reloaded.png`);
    const watched = [successor.id, admin.id, bystander.id];
    await writeFile(
      `${evidence}/owner-succession-invalidation.json`,
      JSON.stringify(
        {
          afterExpulsion,
          afterWithdrawal: await read(ownerPage, '/seller/accounts'),
          operatorMembers: (await read(operatorPage, '/operator/members')).filter((/** @type {{id:string}} */ m) =>
            watched.includes(m.id),
          ),
          organization: organization(),
          events: events(),
          expulsions: expulsions(),
          ownerNotices: await read(ownerPage, '/notifications'),
          resultNotices: { owner: successionResults(owner), successor: successionResults(successor) },
        },
        null,
        2,
      ),
    );
  } finally {
    // The Cognito accounts go first, so a failing database step cannot leave them behind.
    for (const account of accounts) deletePasswordTestAccount(account.email);
    for (const member of [...members, ...fixtures]) prepareMember(member, 'USER');
    if (fixtures.length)
      sql(`UPDATE members SET enabled=FALSE WHERE id IN (${fixtures.map((m) => `'${m.id}'`).join(',')});`);
    for (const context of contexts) await context.close();
  }
});
