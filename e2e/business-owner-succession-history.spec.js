import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
  rename,
} from './business-helpers.js';
import { sql } from './database.js';

const evidence = 'artifacts/business/owner-succession-history';

/** @param {import('@playwright/test').Page} page @param {string} path */
const read = (page, path) => call(page.request, path).then((r) => r.json());

// Issue #213: the owner-succession records (request, refusal, cancellation, automatic invalidation, approval) appear in
// the staff history of every store as records of the whole organization, for the owner and ORG_ADMIN as before
// (#200 の決めること 3). An automatic invalidation is nobody's operation, so it does not show the owner who made the
// request as its operator. After the approval, the new owner reads the earlier records too.
test('the staff history shows the owner-succession records of the organization', async ({ browser }) => {
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
    const [ownerPage, successorPage, managerPage] = pages;
    const [owner, successor, manager] = members;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(successor, { 1: 'STAFF' });
    prepareStaff(manager, { 1: 'MANAGER' });
    // Names of this run only: the sample organization keeps the records of earlier runs.
    const tag = randomUUID().slice(0, 8);
    const [ownerName, successorName] = [`譲渡したオーナー ${tag}`, `譲渡先 ${tag}`];
    rename({ [ownerName]: owner, [successorName]: successor });

    const ok = async (/** @type {Promise<import('@playwright/test').APIResponse>} */ response) => {
      const done = await response;
      expect(done.status(), await done.text()).toBe(200);
    };
    const request = () => ok(call(ownerPage.request, `/seller/accounts/${successor.id}/owner-succession`, 'POST'));
    // Refused, cancelled, expired (found when the owner reads the account list), then approved.
    await request();
    await ok(call(successorPage.request, '/seller/owner-succession/refusal', 'POST'));
    await request();
    await ok(call(ownerPage.request, '/seller/owner-succession', 'DELETE'));
    await request();
    sql(`UPDATE organizations SET pending_owner_expires_at = pending_owner_expires_at - INTERVAL 31 MINUTE
          WHERE id=1 AND pending_owner_member_id='${successor.id}';`);
    await ok(call(ownerPage.request, '/seller/accounts'));
    await request();
    await ok(call(successorPage.request, '/seller/owner-succession/approval', 'POST'));

    // The API returns them to the new owner and to the previous owner, now ORG_ADMIN, newest first, without a store.
    const expected = [
      ['OWNER_SUCCESSION_APPROVAL', successor.id, successor.id],
      ['OWNER_SUCCESSION_REQUEST', owner.id, successor.id],
      ['OWNER_SUCCESSION_AUTO_INVALIDATED', owner.id, successor.id],
      ['OWNER_SUCCESSION_REQUEST', owner.id, successor.id],
      ['OWNER_SUCCESSION_CANCELLATION', owner.id, successor.id],
      ['OWNER_SUCCESSION_REQUEST', owner.id, successor.id],
      ['OWNER_SUCCESSION_REFUSAL', successor.id, successor.id],
      ['OWNER_SUCCESSION_REQUEST', owner.id, successor.id],
    ];
    const ours = (/** @type {any[]} */ events) =>
      events.filter((e) => e.eventType.startsWith('OWNER_SUCCESSION') && e.target.memberId === successor.id);
    /** @type {Record<string, any[]>} */ const api = {};
    for (const [name, page] of /** @type {const} */ ([
      ['newOwner', successorPage],
      ['previousOwner', ownerPage],
    ])) {
      for (const store of [1, 2]) {
        const events = ours(await read(page, `/seller/stores/${store}/member-events`));
        expect(events.map((e) => [e.eventType, e.actor.memberId, e.target.memberId])).toEqual(expected);
        expect(events.every((e) => e.storeId === null)).toBe(true);
        api[`${name}Store${store}`] = events;
      }
    }
    // MANAGER cannot read the history, as before.
    expect((await call(managerPage.request, '/seller/stores/1/member-events')).status()).toBe(403);

    // The new owner's history page, after reloading: every record of this run, with its operation, on every store.
    await successorPage.goto(`${ec}/seller/products`);
    await successorPage.getByRole('navigation', { name: '出店者メニュー' }).getByRole('link', { name: '履歴' }).click();
    await expect(successorPage).toHaveURL(`${ec}/seller/member-events`);
    await successorPage.getByLabel('管理する店舗').selectOption('2');
    await successorPage.reload();
    const rows = successorPage.locator('.workspace-main').getByRole('row').filter({ hasText: tag });
    await expect(rows).toHaveCount(8);
    const labels = [
      'オーナーの譲渡を承認した（オーナーが交代）',
      'オーナーの譲渡を申し出た',
      'オーナーの譲渡の申し出が自動で無効になった',
      'オーナーの譲渡を申し出た',
      'オーナーの譲渡の申し出を取り消した',
      'オーナーの譲渡を申し出た',
      'オーナーの譲渡の申し出を断った',
      'オーナーの譲渡を申し出た',
    ];
    for (const [index, label] of labels.entries()) {
      const cells = rows.nth(index).getByRole('cell');
      await expect(cells.nth(1)).toContainText(label);
      await expect(cells.nth(4)).toHaveText('（組織）');
    }
    // The automatic invalidation has no operator; the owner who made the request is named as such, not as operator.
    const automatic = rows.nth(2).getByRole('cell');
    await expect(automatic.nth(2)).toHaveText('なし（自動）');
    await expect(automatic.nth(1)).toContainText(`申し出たオーナー：${ownerName}`);
    await expect(automatic.nth(3)).toContainText(successorName);
    await expect(rows.nth(3).getByRole('cell').nth(2)).toContainText(ownerName);
    await capture(successorPage, `${evidence}/new-owner-history-reloaded.png`, rows.first());
    await writeFile(`${evidence}/owner-succession-history.json`, JSON.stringify(api, null, 2));
  } finally {
    // The Cognito accounts go first, so a failing database step cannot leave them behind.
    for (const account of accounts) deletePasswordTestAccount(account.email);
    for (const member of members) prepareMember(member, 'USER');
    for (const context of contexts) await context.close();
  }
});
