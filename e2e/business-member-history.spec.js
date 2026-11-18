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

const evidence = 'artifacts/business/member-history';

/** @param {import('@playwright/test').Page} page @param {string} email */
const rows = (page, email) => page.locator('.workspace-main').getByRole('row').filter({ hasText: email });

// Issue #180: the owner and ORG_ADMIN read who assigned, removed, expelled or reinstated whom, store by store.
test('the history shows expulsions of the organization and assignments of the chosen store', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const accounts = [0, 1, 2, 3].map(() => createPasswordTestAccount());
  const contexts = [];
  const members = [];
  try {
    const pages = [];
    for (const account of accounts) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      members.push(await login(page, account.email, account.secret));
    }
    const [ownerPage, adminPage, managerPage] = pages;
    const [owner, admin, manager, staff] = members;
    const staffEmail = accounts[3].email;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(admin, { 1: 'STAFF' }, true);
    prepareStaff(manager, { 1: 'MANAGER' });
    prepareStaff(staff, { 1: 'STAFF' });
    const ok = async (response) => expect((await response).status()).toBe(200);
    await ok(call(ownerPage.request, `/seller/accounts/${staff.id}/stores/2`, 'PUT', { role: 'NONE' }));
    await ok(call(ownerPage.request, `/seller/accounts/${staff.id}/stores/1`, 'DELETE'));
    await ok(call(ownerPage.request, `/seller/accounts/${staff.id}/expulsion`, 'POST'));
    await ok(call(adminPage.request, `/seller/accounts/${staff.id}/expulsion`, 'DELETE'));

    // MANAGER: no history link, and the API refuses.
    await managerPage.goto(`${ec}/seller/products`);
    const managerMenu = managerPage.getByRole('navigation', { name: '出店者メニュー' });
    await expect(managerMenu.getByRole('link', { name: 'アカウント' })).toBeVisible();
    await expect(managerMenu.getByRole('link', { name: '履歴' })).toHaveCount(0);
    expect((await call(managerPage.request, '/seller/stores/1/member-events')).status()).toBe(403);

    // ORG_ADMIN at store 1: the expulsion and reinstatement, and the removal from store 1, newest first.
    await adminPage.goto(`${ec}/seller/products`);
    await adminPage.getByRole('navigation', { name: '出店者メニュー' }).getByRole('link', { name: '履歴' }).click();
    await expect(adminPage).toHaveURL(`${ec}/seller/member-events`);
    await adminPage.getByLabel('管理する店舗').selectOption('1');
    const staffRows = rows(adminPage, staffEmail);
    await expect(staffRows).toHaveCount(3);
    await expect(staffRows.nth(0)).toContainText('組織に復帰させた');
    await expect(staffRows.nth(0)).toContainText(accounts[1].email);
    await expect(staffRows.nth(1)).toContainText('組織から除名した');
    await expect(staffRows.nth(1)).toContainText(accounts[0].email);
    await expect(staffRows.nth(2)).toContainText('店舗の担当から外した');

    // Switching to store 2 shows its assignment instead of the removal from store 1.
    await adminPage.getByLabel('管理する店舗').selectOption('2');
    await expect(staffRows).toHaveCount(3);
    await expect(staffRows.nth(2)).toContainText('店舗の担当にした');
    await expect(staffRows.filter({ hasText: '店舗の担当から外した' })).toHaveCount(0);
    await adminPage.reload();
    await expect(adminPage.getByLabel('管理する店舗')).toHaveValue('2');
    await expect(staffRows).toHaveCount(3);
    await adminPage.screenshot({ path: `${evidence}/history-store2-reloaded.png`, fullPage: true });

    const api = await call(ownerPage.request, '/seller/stores/2/member-events').then((r) => r.json());
    expect(
      api.filter((e) => e.target.memberId === staff.id).map((e) => [e.eventType, e.actor.memberId, e.storeId]),
    ).toEqual([
      ['REINSTATE_TO_ORGANIZATION', admin.id, null],
      ['EXPEL_FROM_ORGANIZATION', owner.id, null],
      ['ASSIGN_TO_STORE', owner.id, 2],
    ]);
    await writeFile(`${evidence}/member-events-store2.json`, JSON.stringify(api, null, 2));
  } finally {
    for (const account of accounts) deletePasswordTestAccount(account.email);
    for (const member of members) prepareMember(member, 'USER');
    for (const context of contexts) await context.close();
  }
});
