import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  prepareMember,
  prepareStaff,
  createPasswordTestAccount,
  deletePasswordTestAccount,
} from './business-helpers.js';
import { sql } from './database.js';

const evidence = 'artifacts/business/expulsion';

/** @param {string} memberId */
function organizationEvents(memberId) {
  const rows = sql(
    `SELECT CONCAT_WS('|', event_type, actor_member_id, IFNULL(store_id,'NULL'))
       FROM organization_member_events WHERE target_member_id='${memberId}'
        AND event_type IN ('EXPEL_FROM_ORGANIZATION','REINSTATE_TO_ORGANIZATION') ORDER BY id;`,
  );
  return rows ? rows.split(/\r?\n/) : [];
}

/** @param {import('@playwright/test').Page} page @param {string} email */
const row = (page, email) => page.getByRole('row').filter({ hasText: email });

// Issue #175: the owner and ORG_ADMIN expel a staff account and bring it back; the expelled account cannot sign in.
test('expelling a staff account stops its sign-in and reinstating restores its stores', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const accounts = [createPasswordTestAccount(), createPasswordTestAccount(), createPasswordTestAccount()];
  const contexts = [];
  const pages = [];
  const members = [];
  try {
    for (const account of accounts) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      members.push(await login(page, account.email, account.secret));
    }
    const [ownerPage, adminPage, targetPage] = pages;
    const [owner, admin, target] = members;
    const targetEmail = accounts[2].email;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(admin, { 1: 'STAFF' }, true);
    prepareStaff(target, { 1: 'MANAGER', 2: 'STAFF' });

    // The target issues an invitation key as MANAGER; expelling revokes it.
    const issued = await call(targetPage.request, '/seller/stores/1/invitations', 'POST', { singleUse: true });
    expect(issued.status()).toBe(201);
    const expulsion = (page, memberId, method) =>
      call(page.request, `/seller/accounts/${memberId}/expulsion`, method).then((r) => r.status());

    // Who may expel (#167, #177): not oneself, not the owner, not a MANAGER.
    expect(await expulsion(adminPage, admin.id, 'POST')).toBe(403);
    expect(await expulsion(adminPage, owner.id, 'POST')).toBe(404);
    expect(await expulsion(targetPage, admin.id, 'POST')).toBe(403);
    expect(await expulsion(ownerPage, target.id, 'DELETE')).toBe(409);

    // The owner expels the target from the account page after a confirmation.
    await ownerPage.goto(`${ec}/seller/accounts`);
    await row(ownerPage, targetEmail).getByRole('button', { name: '組織から除名' }).click();
    const dialog = ownerPage.getByRole('alertdialog');
    await expect(dialog).toContainText(`${targetEmail}を組織から除名しますか？`);
    await dialog.getByRole('button', { name: '取消' }).click();
    expect(sql(`SELECT expelled FROM organization_members WHERE member_id='${target.id}';`)).toBe('0');
    await row(ownerPage, targetEmail).getByRole('button', { name: '組織から除名' }).click();
    await ownerPage.getByRole('alertdialog').getByRole('button', { name: '除名する' }).click();
    await expect(ownerPage.getByText(`${targetEmail}を組織から除名しました。`)).toBeVisible();
    await expect(row(ownerPage, targetEmail)).toHaveCount(0);

    // Data stays (logical deletion); the invitation key is revoked; the event is recorded without a store.
    expect(sql(`SELECT expelled FROM organization_members WHERE member_id='${target.id}';`)).toBe('1');
    expect(sql(`SELECT COUNT(*) FROM store_members WHERE member_id='${target.id}';`)).toBe('2');
    expect(
      sql(`SELECT COUNT(*) FROM store_invitations WHERE issued_by_member_id='${target.id}' AND revoked_at IS NULL;`),
    ).toBe('0');
    expect(organizationEvents(target.id)).toEqual([`EXPEL_FROM_ORGANIZATION|${owner.id}|NULL`]);
    // An expelled account's stores and roles cannot be changed until it is reinstated.
    expect(
      (await call(ownerPage.request, `/seller/accounts/${target.id}/stores/3`, 'PUT', { role: 'STAFF' })).status(),
    ).toBe(409);

    // The target's open session ends at its next request, as for a disabled account
    // (the Canvas API asks this same endpoint, so Canvas stops too).
    const me = await call(targetPage.request, '/auth/me');
    expect(me.status()).toBe(403);
    expect((await me.json()).code).toBe('ACCOUNT_EXPELLED');
    expect((await call(targetPage.request, '/auth/me').then((r) => r.json())).authenticated).toBe(false);
    await targetPage.goto(`${ec}/seller/products`);
    // Signed out, the seller page shows only the login form in its place.
    await expect(targetPage.getByLabel('メールアドレス', { exact: true })).toBeVisible();
    await expect(targetPage.getByRole('navigation', { name: '出店者メニュー' })).toHaveCount(0);

    // Signing in again is refused on the login form with the reason.
    await targetPage.goto(`${ec}/account/login`);
    await targetPage.getByLabel('メールアドレス', { exact: true }).fill(targetEmail);
    await targetPage.getByLabel('パスワード', { exact: true }).fill(accounts[2].secret);
    await targetPage.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(targetPage.getByRole('alert')).toContainText('このアカウントは無効化されています');
    expect((await call(targetPage.request, '/auth/me').then((r) => r.json())).authenticated).toBe(false);
    await targetPage.screenshot({ path: `${evidence}/expelled-login-refused.png`, fullPage: true });

    // The expelled account is hidden by default and shown by the filter; ORG_ADMIN brings it back.
    await adminPage.goto(`${ec}/seller/accounts`);
    await expect(row(adminPage, targetEmail)).toHaveCount(0);
    await adminPage.getByLabel('表示する人').selectOption('expelled');
    await row(adminPage, targetEmail).getByRole('button', { name: '復帰させる' }).click();
    await adminPage.getByRole('alertdialog').getByRole('button', { name: '復帰させる' }).click();
    await expect(adminPage.getByText(`${targetEmail}を組織に復帰させました。`)).toBeVisible();
    await adminPage.reload();
    await expect(row(adminPage, targetEmail)).toBeVisible();
    await adminPage.screenshot({ path: `${evidence}/accounts-after-reinstatement-reloaded.png`, fullPage: true });

    // Reinstated with the stores and roles held before the expulsion.
    const back = await login(targetPage, targetEmail, accounts[2].secret);
    expect(back.authenticated).toBe(true);
    expect([...back.storeIds].sort()).toEqual([1, 2]);
    expect(organizationEvents(target.id)).toEqual([
      `EXPEL_FROM_ORGANIZATION|${owner.id}|NULL`,
      `REINSTATE_TO_ORGANIZATION|${admin.id}|NULL`,
    ]);
    await writeFile(
      `${evidence}/expulsion.json`,
      JSON.stringify(
        {
          accounts: await call(adminPage.request, '/seller/accounts').then((r) => r.json()),
          events: organizationEvents(target.id),
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
