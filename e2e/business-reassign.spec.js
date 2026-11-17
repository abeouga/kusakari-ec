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

const evidence = 'artifacts/business/reassign';

/** @param {string} memberId */
function storeRows(memberId) {
  const rows = sql(
    `SELECT CONCAT(store_id,':',IFNULL(role,'NONE')) FROM store_members WHERE member_id='${memberId}' ORDER BY store_id;`,
  );
  return rows ? rows.split(/\r?\n/) : [];
}

/** @param {import('@playwright/test').Page} page @param {string} email */
const row = (page, email) => page.getByRole('row').filter({ hasText: email });

// Issue #179: removing from a store asks first; an account left without a store is found and assigned again.
test('an account removed from every store is found and assigned to a store again', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const accounts = [createPasswordTestAccount(), createPasswordTestAccount(), createPasswordTestAccount()];
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
    const [page] = pages;
    const [owner, staff, other] = members;
    const [, staffAccount, otherAccount] = accounts;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(staff, { 1: 'STAFF' });
    prepareStaff(other, { 2: 'STAFF' });
    const view = await call(page.request, '/seller/accounts').then((r) => r.json());
    const [store1, store2] = [1, 2].map((id) => view.stores.find((s) => s.id === id));

    // Removing from a store asks first; cancelling keeps the assignment.
    await page.goto(`${ec}/seller/accounts`);
    const removeButton = page.getByLabel(`${staffAccount.email}を${store1.name}の担当から外す`);
    await removeButton.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`${staffAccount.email}を${store1.name}の担当から外しますか？`);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);
    expect(storeRows(staff.id)).toEqual(['1:STAFF']);
    await removeButton.click();
    await page.getByRole('alertdialog').getByRole('button', { name: '担当から外す' }).click();
    await expect(page.getByText(`${staffAccount.email}を${store1.name}の担当から外しました。`)).toBeVisible();
    expect(storeRows(staff.id)).toEqual([]);

    // The filter shows only the accounts of this organization without a store: not the owner, not assigned staff.
    await page.getByLabel('表示する人').selectOption('unassigned');
    await expect(row(page, staffAccount.email)).toBeVisible();
    await expect(row(page, otherAccount.email)).toHaveCount(0);
    await expect(row(page, accounts[0].email)).toHaveCount(0);

    // Assigning again starts without a role (#168) and records the assignment; the account leaves the filter.
    await page.getByLabel(`${staffAccount.email}の${store2.name}のロール`).selectOption('NONE');
    await expect(
      page.getByText(`${staffAccount.email}の${store2.name}のロールを「ロールなし」にしました。`),
    ).toBeVisible();
    expect(storeRows(staff.id)).toEqual(['2:NONE']);
    await expect(row(page, staffAccount.email)).toHaveCount(0);
    const events = sql(
      `SELECT CONCAT_WS('|', event_type, store_id) FROM organization_member_events
        WHERE target_member_id='${staff.id}' ORDER BY id;`,
    ).split(/\r?\n/);
    expect(events).toEqual(['REMOVE_FROM_STORE|1', 'ASSIGN_TO_STORE|2']);

    await page.reload();
    await expect(page.getByLabel(`${staffAccount.email}の${store2.name}のロール`)).toHaveValue('NONE');
    await page.screenshot({ path: `${evidence}/accounts-after-reassign-reloaded.png`, fullPage: true });
    await writeFile(
      `${evidence}/reassign.json`,
      JSON.stringify({ accounts: await call(page.request, '/seller/accounts').then((r) => r.json()), events }, null, 2),
    );
  } finally {
    for (const account of accounts) deletePasswordTestAccount(account.email);
    for (const member of members) prepareMember(member, 'USER');
    for (const context of contexts) await context.close();
  }
});
