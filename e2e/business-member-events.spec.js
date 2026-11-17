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

const evidence = 'artifacts/business/member-events';

/** @param {string} memberId */
function events(memberId) {
  const rows = sql(
    `SELECT CONCAT_WS('|', event_type, actor_member_id, IFNULL(store_id,'NULL'), organization_id)
       FROM organization_member_events WHERE target_member_id='${memberId}' ORDER BY id;`,
  );
  return rows ? rows.split(/\r?\n/) : [];
}

// Issue #178: assigning to and removing from a store are recorded with who, whom, which store and when.
test('store assignment and removal leave member events', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const ownerAccount = createPasswordTestAccount();
  const staffAccount = createPasswordTestAccount();
  const ownerContext = await browser.newContext();
  const staffContext = await browser.newContext();
  const page = await ownerContext.newPage();
  const owner = await login(page, ownerAccount.email, ownerAccount.secret);
  const staff = await login(await staffContext.newPage(), staffAccount.email, staffAccount.secret);
  try {
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(staff, { 1: 'STAFF' });
    // The new column starts as "not expelled" for every membership.
    expect(sql(`SELECT expelled FROM organization_members WHERE member_id='${staff.id}';`)).toBe('0');

    const view = await call(page.request, '/seller/accounts').then((r) => r.json());
    const store = view.stores.find((s) => s.id === 2);
    expect(store).toBeTruthy();

    // Adding the staff to store 2 on the owner's account page records ASSIGN_TO_STORE.
    await page.goto(`${ec}/seller/accounts`);
    const role = page.getByLabel(`${staffAccount.email}の${store.name}のロール`);
    await role.selectOption('NONE');
    await expect(page.getByText(`${staffAccount.email}の${store.name}のロールを「`)).toBeVisible();
    expect(events(staff.id)).toEqual([`ASSIGN_TO_STORE|${owner.id}|2|1`]);

    // Changing the role at a store already assigned is not an assignment, so nothing is added.
    await role.selectOption('STAFF');
    await expect(page.getByText(`${staffAccount.email}の${store.name}のロールを「STAFF」にしました。`)).toBeVisible();
    expect(events(staff.id)).toHaveLength(1);

    // Removing from the store records REMOVE_FROM_STORE; the organization membership stays.
    await page.getByLabel(`${staffAccount.email}を${store.name}の担当から外す`).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '担当から外す' }).click();
    await expect(page.getByText(`${staffAccount.email}を${store.name}の担当から外しました。`)).toBeVisible();
    expect(events(staff.id)).toEqual([`ASSIGN_TO_STORE|${owner.id}|2|1`, `REMOVE_FROM_STORE|${owner.id}|2|1`]);
    expect(sql(`SELECT COUNT(*) FROM organization_members WHERE member_id='${staff.id}';`)).toBe('1');
    const recordedAt = sql(
      `SELECT COUNT(*) FROM organization_member_events WHERE target_member_id='${staff.id}'
         AND created_at > NOW(6) - INTERVAL 10 MINUTE;`,
    );
    expect(recordedAt).toBe('2');

    // The database refuses a store event without a store and an organization event with one.
    expect(() =>
      sql(`INSERT INTO organization_member_events(organization_id,event_type,actor_member_id,target_member_id)
           VALUES(1,'REMOVE_FROM_STORE','${owner.id}','${staff.id}');`),
    ).toThrow(/ck_org_member_events_store/);
    expect(() =>
      sql(`INSERT INTO organization_member_events(organization_id,event_type,actor_member_id,target_member_id,store_id)
           VALUES(1,'EXPEL_FROM_ORGANIZATION','${owner.id}','${staff.id}',2);`),
    ).toThrow(/ck_org_member_events_store/);

    await page.reload();
    await expect(page.getByLabel(`${staffAccount.email}の${store.name}のロール`)).toHaveValue('');
    await page.screenshot({ path: `${evidence}/accounts-after-removal-reloaded.png`, fullPage: true });
    await writeFile(
      `${evidence}/member-events.json`,
      JSON.stringify(
        { accounts: await call(page.request, '/seller/accounts').then((r) => r.json()), events: events(staff.id) },
        null,
        2,
      ),
    );
  } finally {
    for (const [member, account] of [
      [owner, ownerAccount],
      [staff, staffAccount],
    ]) {
      prepareMember(member, 'USER');
      deletePasswordTestAccount(account.email);
    }
    await ownerContext.close();
    await staffContext.close();
  }
});
