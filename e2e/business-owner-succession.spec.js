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
import { sql } from './database.js';

const evidence = 'artifacts/business/owner-succession';
const REQUEST_BUTTON = 'オーナーの譲渡を申し出る';
const OWNER_NAME = '譲渡するオーナー';
const TARGET_NAME = '譲渡先の担当者';
const SECOND_NAME = '譲渡先の候補';

/** The successor waiting for approval in the sample organization, or 'NULL'. */
const pendingMember = () => sql(`SELECT IFNULL(pending_owner_member_id,'NULL') FROM organizations WHERE id=1;`);

/**
 * Moves the request to 31 minutes ago, so its 30-minute deadline passed a minute ago (#194 の 12).
 * @param {string} memberId
 */
function expire(memberId) {
  sql(`UPDATE organizations SET pending_owner_expires_at = pending_owner_expires_at - INTERVAL 31 MINUTE
        WHERE id=1 AND pending_owner_member_id='${memberId}';`);
}

/** @param {string} memberId */
function requestNotices(memberId) {
  const rows = sql(
    `SELECT CONCAT_WS('|', kind, IFNULL(store_id,'NULL'), category, title) FROM notifications
      WHERE member_id='${memberId}' AND category='OWNER_SUCCESSION_REQUEST' ORDER BY created_at;`,
  );
  return rows ? rows.split(/\r?\n/) : [];
}

/** @param {import('@playwright/test').Page} page @param {string} email */
const row = (page, email) => page.getByRole('row').filter({ hasText: email });

/** @param {import('@playwright/test').Page} page @param {string} memberId */
const request = (page, memberId) => call(page.request, `/seller/accounts/${memberId}/owner-succession`, 'POST');

/** @param {import('@playwright/test').Page} page */
const cancel = (page) => call(page.request, '/seller/owner-succession', 'DELETE');

/** @param {import('@playwright/test').APIResponse} response */
const code = async (response) => [response.status(), (await response.json()).code];

/** @param {import('@playwright/test').Response} response */
const noticesLoaded = (response) =>
  new URL(response.url()).pathname === '/api/notifications' && response.request().method() === 'GET';

// Issue #203: the owner requests an owner succession from the account list, cancels it, and an expired request is
// recorded as OWNER_SUCCESSION_AUTO_INVALIDATED at the next operation (#194 の 15・16, #196 の 6). A cancelled or an
// invalidated request sends a result notice saying why to both the owner and the successor (#200 の決めること 1).
test('the owner requests and cancels an owner succession, and an expired request is invalidated', async ({
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const accounts = [createPasswordTestAccount(), createPasswordTestAccount(), createPasswordTestAccount()];
  /** @type {import('@playwright/test').BrowserContext[]} */ const contexts = [];
  /** @type {import('@playwright/test').Page[]} */ const pages = [];
  /** @type {{id:string}[]} */ const members = [];
  /** @type {{id:string,email:string}[]} */ const fixtures = [];
  try {
    for (const account of accounts) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      members.push(await login(page, account.email, account.secret));
    }
    const [ownerPage, staffPage, targetPage] = pages;
    const [owner, staff, target] = members;
    const targetEmail = accounts[2].email;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(staff, { 1: 'STAFF' }, true);
    prepareStaff(target, { 1: 'STAFF' });
    rename({ [OWNER_NAME]: owner, [TARGET_NAME]: target });
    // Any role can be chosen (#181 の 2), but not someone expelled, stopped by the operator or withdrawn.
    const second = createFixtureStaff(SECOND_NAME);
    const expelled = createFixtureStaff('除名中の担当者');
    const disabled = createFixtureStaff('停止中の担当者');
    const withdrawn = createFixtureStaff('退会済みの担当者');
    fixtures.push(second, expelled, disabled, withdrawn);
    sql(`UPDATE organization_members SET expelled=TRUE WHERE member_id='${expelled.id}';
         UPDATE members SET enabled=FALSE WHERE id='${disabled.id}';
         UPDATE members SET enabled=FALSE, withdrawn_at=CURRENT_TIMESTAMP(6) WHERE id='${withdrawn.id}';`);
    const baseline = sql('SELECT IFNULL(MAX(id),0) FROM organization_member_events;');
    const events = () => {
      const rows = sql(
        `SELECT CONCAT_WS('|', event_type, actor_member_id, target_member_id, IFNULL(store_id,'NULL'))
           FROM organization_member_events
          WHERE id > ${Number(baseline)} AND organization_id=1 AND event_type LIKE 'OWNER_SUCCESSION%' ORDER BY id;`,
      );
      return rows ? rows.split(/\r?\n/) : [];
    };
    /** @param {string} type @param {{id:string}} successor */
    const event = (type, successor) => `OWNER_SUCCESSION_${type}|${owner.id}|${successor.id}|NULL`;
    // The result notices the owner and the target should have received so far (#200 の決めること 1).
    /** @type {string[]} */ const ownerResults = [];
    /** @type {string[]} */ const targetResults = [];
    /** @param {'cancelled'|'expired'} ending @param {string} [deadline] */
    const ended = (ending, deadline) => {
      const [toOwner, toTarget] = endingNotices(ending, { owner: OWNER_NAME, successor: TARGET_NAME, deadline });
      ownerResults.push(toOwner);
      targetResults.push(toTarget);
    };
    const results = () => [successionResults(owner), successionResults(target)];

    // Only the owner sees and uses the succession (#195 の 7): ORG_ADMIN and MANAGER see no column, and the API says 403.
    for (const stores of [null, { 1: 'MANAGER' }]) {
      if (stores) prepareStaff(staff, stores);
      const view = await call(staffPage.request, '/seller/accounts').then((r) => r.json());
      expect(view.ownerSuccession).toBeNull();
      expect(view.accounts.filter((a) => a.ownerSuccessionSelectable)).toEqual([]);
      expect((await request(staffPage, target.id)).status()).toBe(403);
      expect((await cancel(staffPage)).status()).toBe(403);
      await staffPage.goto(`${ec}/seller/accounts`);
      await expect(row(staffPage, targetEmail)).toBeVisible();
      await expect(staffPage.getByRole('columnheader', { name: 'オーナーの譲渡' })).toHaveCount(0);
      await expect(staffPage.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);
    }
    expect(events()).toEqual([]);

    // The owner can choose the active staff only; the server refuses the others too.
    const opened = await call(ownerPage.request, '/seller/accounts').then((r) => r.json());
    const selectable = (/** @type {{id:string}} */ m) =>
      opened.accounts.find((/** @type {any} */ a) => a.memberId === m.id)?.ownerSuccessionSelectable;
    expect([target, second, expelled, disabled, withdrawn, owner].map(selectable)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    for (const member of [expelled, disabled, withdrawn]) {
      expect(await code(await request(ownerPage, member.id))).toEqual([409, 'OWNER_SUCCESSION_TARGET_UNAVAILABLE']);
    }
    expect((await request(ownerPage, owner.id)).status()).toBe(404);
    const targetName = opened.accounts.find((/** @type {any} */ a) => a.memberId === target.id).name;

    await ownerPage.goto(`${ec}/seller/accounts`);
    await expect(ownerPage.getByRole('columnheader', { name: 'オーナーの譲渡' })).toBeVisible();
    const requestButton = (/** @type {string} */ email) =>
      row(ownerPage, email).getByRole('button', { name: REQUEST_BUTTON });
    await expect(requestButton(targetEmail)).toBeVisible();
    await expect(requestButton(second.email)).toBeVisible();
    for (const member of [disabled, withdrawn]) {
      await expect(row(ownerPage, member.email)).toBeVisible();
      await expect(requestButton(member.email)).toHaveCount(0);
    }
    await ownerPage.getByLabel('表示する人').selectOption('expelled');
    await expect(row(ownerPage, expelled.email)).toBeVisible();
    await expect(requestButton(expelled.email)).toHaveCount(0);
    await ownerPage.getByLabel('表示する人').selectOption('active');

    // Requesting asks for a confirmation first; 取消 changes nothing.
    await requestButton(targetEmail).click();
    const confirm = ownerPage.getByRole('alertdialog');
    await expect(confirm).toContainText(`${targetName}にオーナーの譲渡を申し出ますか？`);
    await confirm.getByRole('button', { name: '取消' }).click();
    expect(pendingMember()).toBe('NULL');
    await requestButton(targetEmail).click();
    await ownerPage.getByRole('alertdialog').getByRole('button', { name: '申し出る', exact: true }).click();
    await expect(ownerPage.getByText(`${targetName}にオーナーの譲渡を申し出ました。`)).toBeVisible();
    await expect(
      ownerPage.getByText(`${targetName}（${targetEmail}）にオーナーの譲渡を申し出ています。`),
    ).toBeVisible();
    await expect(row(ownerPage, targetEmail)).toContainText('承認待ち');
    await expect(ownerPage.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);

    // The pending columns, a 30-minute deadline, the record without a store, and a personal notice to the successor.
    expect(pendingMember()).toBe(target.id);
    const period = Number(
      sql(`SELECT TIMESTAMPDIFF(SECOND,
             (SELECT created_at FROM organization_member_events WHERE id > ${Number(baseline)}
                AND event_type='OWNER_SUCCESSION_REQUEST' ORDER BY id DESC LIMIT 1),
             pending_owner_expires_at) FROM organizations WHERE id=1;`),
    );
    expect(period).toBeGreaterThanOrEqual(1799);
    expect(period).toBeLessThanOrEqual(1800);
    expect(events()).toEqual([event('REQUEST', target)]);
    expect(requestNotices(target.id)).toEqual(['PERSONAL|NULL|OWNER_SUCCESSION_REQUEST|オーナーの譲渡の申し出']);

    // One request at a time (#194 の 4).
    expect(await code(await request(ownerPage, second.id))).toEqual([409, 'OWNER_SUCCESSION_PENDING']);
    expect(pendingMember()).toBe(target.id);

    // The successor finds the request among its notices, marked 重要 (#202).
    await targetPage.goto(`${ec}/seller/notifications`);
    const requestCards = targetPage
      .locator('.workspace-card')
      .filter({ has: targetPage.getByRole('heading', { name: 'オーナーの譲渡の申し出', exact: true }) });
    await expect(requestCards).toHaveCount(1);
    await expect(requestCards.getByText('重要', { exact: true })).toBeVisible();
    await expect(requestCards).toContainText('承認の期限は');

    // The owner cancels before approval (#194 の 5).
    await ownerPage.getByRole('button', { name: '申し出を取り消す' }).click();
    const withdrawal = ownerPage.getByRole('alertdialog');
    await expect(withdrawal).toContainText(`${targetName}へのオーナーの譲渡の申し出を取り消しますか？`);
    await withdrawal.getByRole('button', { name: '申し出を取り消す' }).click();
    await expect(ownerPage.getByText('オーナーの譲渡の申し出を取り消しました。')).toBeVisible();
    await expect(row(ownerPage, targetEmail)).not.toContainText('承認待ち');
    await expect(requestButton(second.email)).toBeVisible();
    expect(pendingMember()).toBe('NULL');
    expect(await code(await cancel(ownerPage))).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
    expect(events()).toEqual([event('REQUEST', target), event('CANCELLATION', target)]);
    // Both the owner and the successor are told that the request was cancelled.
    ended('cancelled');
    expect(results()).toEqual([ownerResults, targetResults]);

    // An expired request counts as gone: it cannot be cancelled (nothing is written), and opening the account list
    // finds it and records it as invalidated, with the requesting owner as the actor (#196 の 6).
    expect((await request(ownerPage, target.id)).status()).toBe(200);
    expire(target.id);
    let deadline = pendingDeadline();
    expect(await code(await cancel(ownerPage))).toEqual([409, 'OWNER_SUCCESSION_NOT_PENDING']);
    expect(pendingMember()).toBe(target.id);
    expect(results()).toEqual([ownerResults, targetResults]);
    await ownerPage.reload();
    await expect(requestButton(targetEmail)).toBeVisible();
    await expect(ownerPage.getByText('にオーナーの譲渡を申し出ています。')).toHaveCount(0);
    expect(pendingMember()).toBe('NULL');
    const listed = [event('REQUEST', target), event('CANCELLATION', target)];
    listed.push(event('REQUEST', target), event('AUTO_INVALIDATED', target));
    expect(events()).toEqual(listed);
    // Both are told that it ended because the deadline passed, with that deadline.
    ended('expired', deadline);
    expect(results()).toEqual([ownerResults, targetResults]);

    // Loading the notices finds an expired request too (here the successor's). The list that found it already holds
    // the result notice it sent, as its newest notice.
    expect((await request(ownerPage, target.id)).status()).toBe(200);
    expire(target.id);
    deadline = pendingDeadline();
    const [loaded] = await Promise.all([targetPage.waitForResponse(noticesLoaded), targetPage.reload()]);
    await expect(requestCards).toHaveCount(3);
    expect(pendingMember()).toBe('NULL');
    listed.push(event('REQUEST', target), event('AUTO_INVALIDATED', target));
    expect(events()).toEqual(listed);
    ended('expired', deadline);
    expect(results()).toEqual([ownerResults, targetResults]);
    const newest = (await loaded.json())[0];
    expect([newest.category, `${newest.title}|${newest.body}`]).toEqual([
      'OWNER_SUCCESSION_RESULT',
      targetResults.at(-1),
    ]);
    await expect(targetPage.locator('.workspace-card').first()).toContainText(newest.body);

    // A new request after the deadline is accepted; the expired one is recorded first (#194 の 16).
    expect((await request(ownerPage, target.id)).status()).toBe(200);
    expire(target.id);
    deadline = pendingDeadline();
    const accepted = await request(ownerPage, second.id);
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).ownerSuccession.memberId).toBe(second.id);
    expect(pendingMember()).toBe(second.id);
    listed.push(event('REQUEST', target), event('AUTO_INVALIDATED', target), event('REQUEST', second));
    expect(events()).toEqual(listed);
    expect(requestNotices(second.id)).toEqual(['PERSONAL|NULL|OWNER_SUCCESSION_REQUEST|オーナーの譲渡の申し出']);
    ended('expired', deadline);
    expect(results()).toEqual([ownerResults, targetResults]);

    // Two requests at the same moment: the organization row lock lets exactly one through. The cancellation before
    // them tells the owner and the other candidate.
    expect((await cancel(ownerPage)).status()).toBe(200);
    listed.push(event('CANCELLATION', second));
    const [toOwner, toSecond] = endingNotices('cancelled', { owner: OWNER_NAME, successor: SECOND_NAME });
    ownerResults.push(toOwner);
    expect(results()).toEqual([ownerResults, targetResults]);
    expect(successionResults(second)).toEqual([toSecond]);
    const raced = await Promise.all([request(ownerPage, target.id), request(ownerPage, second.id)]);
    expect(raced.map((r) => r.status()).sort()).toEqual([200, 409]);
    const [winner, loser] = raced[0].status() === 200 ? [target, raced[1]] : [second, raced[0]];
    expect((await loser.json()).code).toBe('OWNER_SUCCESSION_PENDING');
    expect(pendingMember()).toBe(winner.id);
    listed.push(event('REQUEST', winner));
    expect(events()).toEqual(listed);

    // Evidence after reloading: the owner's list with the pending request and the successor's notices.
    // The status line holds an e-mail address and is masked in the shot, so the shot centres the 承認待ち cell.
    await ownerPage.reload();
    await expect(ownerPage.getByText('にオーナーの譲渡を申し出ています。')).toBeVisible();
    const pendingCell = row(ownerPage, winner === target ? targetEmail : second.email).getByRole('cell', {
      name: '承認待ち',
      exact: true,
    });
    await expect(pendingCell).toBeVisible();
    await capture(ownerPage, `${evidence}/accounts-pending-reloaded.png`, pendingCell);
    await targetPage.reload();
    await expect(requestCards.first()).toBeVisible();
    await capture(targetPage, `${evidence}/successor-notices-reloaded.png`);
    // The owner's notices, newest first: the cancellation to the other candidate, then the request that expired then.
    await ownerPage.goto(`${ec}/seller/notifications`);
    const ownerCards = ownerPage.locator('.workspace-card');
    await expect(ownerCards.first()).toContainText(toOwner.split('|')[1]);
    await expect(ownerCards.nth(1)).toContainText(ownerResults[3].split('|')[1]);
    await capture(ownerPage, `${evidence}/owner-notices-reloaded.png`);
    await writeFile(
      `${evidence}/owner-succession.json`,
      JSON.stringify(
        {
          ownerAccounts: await call(ownerPage.request, '/seller/accounts').then((r) => r.json()),
          successorNotices: await call(targetPage.request, '/notifications').then((r) => r.json()),
          ownerNotices: await call(ownerPage.request, '/notifications').then((r) => r.json()),
          events: events(),
          pendingOwnerMemberId: pendingMember(),
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
