import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  capture,
  prepareMember,
  prepareStaff,
  createPasswordTestAccount,
  deletePasswordTestAccount,
  successionResults,
  pendingDeadline,
  endingNotices,
  rename,
} from './business-helpers.js';
import { sql, sqlInBackground } from './database.js';

const evidence = 'artifacts/business/owner-succession-approval';
const NOT_PENDING = 'あなたあての、承認を待っているオーナーの譲渡の申し出はありません。';
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
 * Account type, organization role and expulsion, and the number of store assignments of a member.
 * @param {{id:string}} member
 */
const standing = (member) =>
  sql(`SELECT CONCAT_WS('|', m.account_type, IFNULL(om.role,'-'), IFNULL(om.expelled,'-'),
          (SELECT COUNT(*) FROM store_members s WHERE s.member_id=m.id))
         FROM members m LEFT JOIN organization_members om ON om.member_id=m.id WHERE m.id='${member.id}';`);

/** @param {{id:string}} member */
const noticeCount = (member) => Number(sql(`SELECT COUNT(*) FROM notifications WHERE member_id='${member.id}';`));

/**
 * Moves the request to 31 minutes ago, so its 30-minute deadline passed a minute ago (#194 の 12).
 * @param {{id:string}} member
 */
const expire = (member) =>
  sql(`UPDATE organizations SET pending_owner_expires_at = pending_owner_expires_at - INTERVAL 31 MINUTE
        WHERE id=1 AND pending_owner_member_id='${member.id}';`);

/**
 * True while another session holds the member's organization row: FOR UPDATE NOWAIT fails at once instead of waiting.
 * @param {{id:string}} member
 */
function membershipLocked(member) {
  try {
    sql(`SELECT member_id FROM organization_members WHERE member_id='${member.id}' FOR UPDATE NOWAIT;`);
    return false;
  } catch {
    return true;
  }
}

/** @param {import('@playwright/test').Response} response */
const noticesLoaded = (response) =>
  new URL(response.url()).pathname === '/api/notifications' && response.request().method() === 'GET';

/** @param {import('@playwright/test').APIResponse} response */
const code = async (response) => [response.status(), (await response.json()).code];

/** @param {import('@playwright/test').Page} page @param {'approval'|'refusal'} answer */
const reply = (page, answer) => call(page.request, `/seller/owner-succession/${answer}`, 'POST');

/**
 * Approves with a CSRF token taken earlier: as a page opened before the account was expelled or stopped would, or to
 * send two approvals at once with the same token.
 * @param {import('@playwright/test').Page} page @param {{headerName:string,token:string}} csrf
 */
const approveWith = (page, csrf) =>
  page.request.fetch(`${ec}/api/seller/owner-succession/approval`, {
    method: 'POST',
    headers: { [csrf.headerName]: csrf.token },
  });

/** @param {import('@playwright/test').Page} page @param {{id:string}} member */
const requestTo = (page, member) => call(page.request, `/seller/accounts/${member.id}/owner-succession`, 'POST');

/** @param {import('@playwright/test').Page} page @param {string} path */
const read = (page, path) => call(page.request, path).then((r) => r.json());

/** @param {import('@playwright/test').Page} page */
const requestCard = (page) =>
  page
    .locator('.workspace-card')
    .filter({ has: page.getByRole('heading', { name: 'オーナーの譲渡の申し出', exact: true }) })
    .first();

/**
 * Answers the newest request notice through its button and the confirmation dialog.
 * @param {import('@playwright/test').Page} page @param {'承認する'|'断る'} label @param {string} question
 */
async function answerOnPage(page, label, question) {
  await requestCard(page).getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(question);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

// Issue #204: the successor approves or refuses an owner-succession request from its notice. Approval swaps the owner
// and the successor in one transaction (#197 の 8); an expired request or an unavailable successor cannot be approved.
test('the successor approves or refuses an owner succession from the notice', async ({ browser }) => {
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
    const [ownerPage, successorPage, adminPage] = pages;
    const [owner, successor, admin] = members;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(successor, { 1: 'STAFF', 2: 'MANAGER' });
    prepareStaff(admin, { 1: 'STAFF' }, true);
    rename({ [OWNER_NAME]: owner, [SUCCESSOR_NAME]: successor });
    let baseline = sql('SELECT IFNULL(MAX(id),0) FROM organization_member_events;');
    const events = () =>
      rows(`SELECT CONCAT_WS('|', event_type, actor_member_id, target_member_id, IFNULL(store_id,'NULL'))
              FROM organization_member_events
             WHERE id > ${Number(baseline)} AND organization_id=1 AND event_type LIKE 'OWNER_SUCCESSION%' ORDER BY id;`);
    /** @param {string} type @param {{id:string}} actor @param {{id:string}} target */
    const event = (type, actor, target) => `OWNER_SUCCESSION_${type}|${actor.id}|${target.id}|NULL`;
    const listed = [];
    // The result notices the owner and the successor should have received so far (#203, #200 の決めること 1).
    /** @type {unknown[]} */ const ownerResults = [];
    /** @type {unknown[]} */ const successorResults = [];
    /** @param {'expired'|'expelled'} ending @param {string} [deadline] */
    const ended = (ending, deadline) => {
      const [toOwner, toSuccessor] = endingNotices(ending, { owner: OWNER_NAME, successor: SUCCESSOR_NAME, deadline });
      ownerResults.push(toOwner);
      successorResults.push(toSuccessor);
    };
    const results = () => [successionResults(owner), successionResults(successor)];

    // Without a request addressed to them, nobody can answer, and nothing is written.
    expect(await code(await reply(successorPage, 'approval'))).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
    expect((await requestTo(ownerPage, successor)).status()).toBe(200);
    listed.push(event('REQUEST', owner, successor));
    for (const page of [adminPage, ownerPage]) {
      for (const answer of /** @type {const} */ (['approval', 'refusal'])) {
        expect(await code(await reply(page, answer))).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
      }
    }
    expect(organization()).toBe(`${owner.id}|${successor.id}`);
    expect(events()).toEqual(listed);

    // The request notice has 承認する and 断る (#194 の 17). Refusing clears the request and records it; nobody is
    // notified, because who should be is not decided yet (#200 の決めること 1).
    await successorPage.goto(`${ec}/seller/notifications`);
    await expect(requestCard(successorPage).getByText('重要', { exact: true })).toBeVisible();
    await expect(requestCard(successorPage).getByRole('button', { name: '承認する', exact: true })).toBeVisible();
    await expect(requestCard(successorPage).getByRole('button', { name: '断る', exact: true })).toBeVisible();
    await capture(successorPage, `${evidence}/successor-request-reloaded.png`);
    const ownerNotices = noticeCount(owner);
    await answerOnPage(successorPage, '断る', 'オーナーの譲渡の申し出を断りますか？');
    await expect(successorPage.getByText('オーナーの譲渡の申し出を断りました。')).toBeVisible();
    expect(organization()).toBe(`${owner.id}|NULL`);
    listed.push(event('REFUSAL', successor, successor));
    expect(events()).toEqual(listed);
    expect(noticeCount(owner)).toBe(ownerNotices);

    // The buttons stay on the old notice; pressing them now shows the server's refusal and changes nothing.
    await answerOnPage(successorPage, '承認する', 'オーナーの譲渡を承認しますか？');
    await expect(successorPage.getByRole('alert').filter({ hasText: NOT_PENDING })).toBeVisible();
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(events()).toEqual(listed);

    // An expired request cannot be answered. The answer is an error, yet the request is recorded as invalidated by
    // that very call (no other request ran in between), so the error rolls back neither the record nor the result
    // notices it sent to the owner and the successor (#203).
    for (const answer of /** @type {const} */ (['approval', 'refusal'])) {
      expect((await requestTo(ownerPage, successor)).status()).toBe(200);
      expire(successor);
      const deadline = pendingDeadline();
      expect(await code(await reply(successorPage, answer))).toEqual([409, 'OWNER_SUCCESSION_EXPIRED']);
      expect(organization()).toBe(`${owner.id}|NULL`);
      listed.push(event('REQUEST', owner, successor), event('AUTO_INVALIDATED', owner, successor));
      expect(events()).toEqual(listed);
      ended('expired', deadline);
      expect(results()).toEqual([ownerResults, successorResults]);
    }
    // On the page, the notice was loaded before the deadline passed. Loading the notices also finds expired requests,
    // so the deadline moves only after that load has answered.
    expect((await requestTo(ownerPage, successor)).status()).toBe(200);
    await Promise.all([successorPage.waitForResponse(noticesLoaded), successorPage.reload()]);
    expire(successor);
    const deadline = pendingDeadline();
    await answerOnPage(successorPage, '承認する', 'オーナーの譲渡を承認しますか？');
    await expect(
      successorPage
        .getByRole('alert')
        .filter({ hasText: '承認の期限が過ぎたため、このオーナーの譲渡の申し出は無効になりました。' }),
    ).toBeVisible();
    expect(organization()).toBe(`${owner.id}|NULL`);
    listed.push(event('REQUEST', owner, successor), event('AUTO_INVALIDATED', owner, successor));
    expect(events()).toEqual(listed);
    ended('expired', deadline);
    expect(results()).toEqual([ownerResults, successorResults]);

    // A successor who is expelled, or stopped by the operator, cannot approve. The sign-in check refuses the approval
    // sent with a CSRF token taken before, and ends that session, so the successor signs in again afterwards.
    // The expulsion invalidates the request and tells both why (#205, #203); the stop is made in the database here.
    expect((await requestTo(ownerPage, successor)).status()).toBe(200);
    let csrf = await read(successorPage, '/auth/csrf');
    expect((await call(ownerPage.request, `/seller/accounts/${successor.id}/expulsion`, 'POST')).status()).toBe(200);
    ended('expelled');
    expect(results()).toEqual([ownerResults, successorResults]);
    expect(await code(await approveWith(successorPage, csrf))).toEqual([403, 'ACCOUNT_EXPELLED']);
    expect((await call(ownerPage.request, `/seller/accounts/${successor.id}/expulsion`, 'DELETE')).status()).toBe(200);
    await login(successorPage, accounts[1].email, accounts[1].secret);
    csrf = await read(successorPage, '/auth/csrf');
    sql(`UPDATE members SET enabled=FALSE WHERE id='${successor.id}';`);
    expect(await code(await approveWith(successorPage, csrf))).toEqual([403, 'ACCOUNT_DISABLED']);
    sql(`UPDATE members SET enabled=TRUE WHERE id='${successor.id}';`);
    await login(successorPage, accounts[1].email, accounts[1].secret);
    expect(organization()).toBe(`${owner.id}|NULL`);

    // An expulsion that commits while the approval waits for the membership row (another administrator expelling at
    // the same moment): the approval reads the row again under its lock and refuses, so the owner stays.
    baseline = sql('SELECT IFNULL(MAX(id),0) FROM organization_member_events;');
    listed.length = 0;
    expect((await requestTo(ownerPage, successor)).status()).toBe(200);
    listed.push(event('REQUEST', owner, successor));
    const expulsion = sqlInBackground(`START TRANSACTION;
      UPDATE organization_members SET expelled=TRUE WHERE member_id='${successor.id}';
      SELECT SLEEP(5);
      COMMIT;`);
    await expect.poll(() => membershipLocked(successor), { timeout: 4000 }).toBe(true);
    const raced = await reply(successorPage, 'approval');
    await expulsion;
    expect(await code(raced)).toEqual([409, 'OWNER_SUCCESSION_TARGET_UNAVAILABLE']);
    expect(organization()).toBe(`${owner.id}|${successor.id}`);
    expect(standing(successor)).toBe('SHOP_STAFF|-|1|2');
    expect(events()).toEqual(listed);
    expect(results()).toEqual([ownerResults, successorResults]);
    expect((await call(ownerPage.request, `/seller/accounts/${successor.id}/expulsion`, 'DELETE')).status()).toBe(200);

    // Approval from the notice: the successor becomes the owner and leaves its stores; the previous owner becomes a
    // staff account with ORG_ADMIN (#195 の 1・2・4・5). The menu follows at once (履歴 is for the owner and ORG_ADMIN).
    await successorPage.goto(`${ec}/seller/notifications`);
    await answerOnPage(successorPage, '承認する', 'オーナーの譲渡を承認しますか？');
    await expect(successorPage.getByText('オーナーの譲渡を承認しました。あなたが組織のオーナーです。')).toBeVisible();
    await expect(
      successorPage.getByRole('navigation', { name: '出店者メニュー' }).getByRole('link', { name: '履歴' }),
    ).toBeVisible();
    expect(organization()).toBe(`${successor.id}|NULL`);
    expect(standing(successor)).toBe('SHOP_OWNER|-|-|0');
    expect(standing(owner)).toBe('SHOP_STAFF|ORG_ADMIN|0|0');
    listed.push(event('APPROVAL', successor, successor));
    expect(events()).toEqual(listed);
    const changed = expect.stringMatching(/^オーナーが交代しました\|/);
    ownerResults.push(changed);
    successorResults.push(changed);
    expect(results()).toEqual([ownerResults, successorResults]);

    // After reloading, each account works with its new type: AuthService reads it from the database every time.
    await successorPage.goto(`${ec}/seller/accounts`);
    await expect(successorPage.getByRole('columnheader', { name: 'オーナーの譲渡' })).toBeVisible();
    // The shot scrolls the wide table to the previous owner's button in the オーナーの譲渡 column.
    const handBack = successorPage
      .getByRole('row')
      .filter({ hasText: accounts[0].email })
      .getByRole('button', { name: 'オーナーの譲渡を申し出る' });
    await expect(handBack).toBeVisible();
    await capture(successorPage, `${evidence}/new-owner-accounts-reloaded.png`, handBack);
    await ownerPage.goto(`${ec}/seller/notifications`);
    await expect(
      ownerPage
        .locator('.workspace-card')
        .filter({ has: ownerPage.getByRole('heading', { name: 'オーナーが交代しました', exact: true }) }),
    ).toContainText('あなたは組織の ORG_ADMIN になり');
    await capture(ownerPage, `${evidence}/previous-owner-notices-reloaded.png`);
    await ownerPage.goto(`${ec}/seller/accounts`);
    await expect(ownerPage.getByRole('row').filter({ hasText: accounts[1].email })).toBeVisible();
    await expect(ownerPage.getByRole('columnheader', { name: 'オーナーの譲渡' })).toHaveCount(0);
    expect((await requestTo(ownerPage, admin)).status()).toBe(403);
    const newOwnerSession = await read(successorPage, '/auth/me');
    const previousSession = await read(ownerPage, '/auth/me');
    expect([newOwnerSession.accountType, newOwnerSession.organizationId]).toEqual(['SHOP_OWNER', 1]);
    expect([previousSession.accountType, previousSession.organizationRole]).toEqual(['SHOP_STAFF', 'ORG_ADMIN']);

    // The previous owner is an ORG_ADMIN like any other, so the new owner can expel and reinstate it (#195 の 8).
    // The expelled account's request ends its session, so it signs in again after the reinstatement.
    const newOwnerAccounts = await read(successorPage, '/seller/accounts');
    const previousAccount = newOwnerAccounts.accounts.find((/** @type {any} */ a) => a.memberId === owner.id);
    expect([previousAccount.owner, previousAccount.organizationRole, previousAccount.expellable]).toEqual([
      false,
      'ORG_ADMIN',
      true,
    ]);
    expect((await call(successorPage.request, `/seller/accounts/${owner.id}/expulsion`, 'POST')).status()).toBe(200);
    expect(await code(await call(ownerPage.request, '/seller/accounts'))).toEqual([403, 'ACCOUNT_EXPELLED']);
    expect((await call(successorPage.request, `/seller/accounts/${owner.id}/expulsion`, 'DELETE')).status()).toBe(200);
    await login(ownerPage, accounts[0].email, accounts[0].secret);

    // There is no undo (#197): the new owner hands the organization back with a new request. Two approvals at the same
    // moment swap the owner once; the organization row lock makes the second find no request.
    expect((await requestTo(successorPage, owner)).status()).toBe(200);
    // One CSRF token for both: a session just signed in has none, and two requests at once would each make their own.
    csrf = await read(ownerPage, '/auth/csrf');
    const approvals = await Promise.all([approveWith(ownerPage, csrf), approveWith(ownerPage, csrf)]);
    expect(approvals.map((r) => r.status()).sort()).toEqual([200, 409]);
    const [accepted, refused] = approvals[0].status() === 200 ? approvals : [approvals[1], approvals[0]];
    expect(await accepted.json()).toEqual({ organizationId: 1, organizationName: expect.any(String), owner: true });
    expect((await refused.json()).code).toBe('OWNER_SUCCESSION_NOT_PENDING');
    expect(organization()).toBe(`${owner.id}|NULL`);
    expect(standing(owner)).toBe('SHOP_OWNER|-|-|0');
    expect(standing(successor)).toBe('SHOP_STAFF|ORG_ADMIN|0|0');
    listed.push(event('REQUEST', successor, owner), event('APPROVAL', owner, owner));
    expect(events()).toEqual(listed);
    ownerResults.push(changed);
    successorResults.push(changed);
    expect(results()).toEqual([ownerResults, successorResults]);

    await writeFile(
      `${evidence}/owner-succession-approval.json`,
      JSON.stringify(
        {
          afterFirstApproval: { newOwnerSession, previousSession, newOwnerAccounts },
          afterHandBack: {
            ownerSession: await read(ownerPage, '/auth/me'),
            successorSession: await read(successorPage, '/auth/me'),
            successorNotices: await read(successorPage, '/notifications'),
          },
          organization: organization(),
          events: events(),
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
