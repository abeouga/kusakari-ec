import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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

const evidence = 'artifacts/business/unassigned-notices';

// Issue #169: a staff account removed from its last store keeps the seller pages for its own notices only.
test('a staff account without a store sees only its own notices on the seller pages', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const accounts = [createPasswordTestAccount(), createPasswordTestAccount()];
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
    const [ownerPage, staffPage] = pages;
    const [owner, staff] = members;
    const staffEmail = accounts[1].email;
    prepareMember(owner, 'SHOP_OWNER');
    prepareStaff(staff, { 1: 'STAFF' });
    const store = await call(ownerPage.request, '/seller/accounts')
      .then((r) => r.json())
      .then((view) => view.stores.find((s) => s.id === 1));

    // Test-owned notices for store 1: one with its store, one from before V5 without a store.
    const storeNotice = `店舗あての試験通知 ${randomUUID()}`;
    const legacyNotice = `店舗の分からない試験通知 ${randomUUID()}`;
    sql(`INSERT INTO notifications(id,member_id,kind,store_id,title,body)
           VALUES('${randomUUID()}','${staff.id}','STORE',1,'${storeNotice}','E2E');
         INSERT INTO notifications(id,member_id,kind,store_id,title,body)
           VALUES('${randomUUID()}','${staff.id}','STORE',NULL,'${legacyNotice}','E2E');`);
    const titles = async () =>
      call(staffPage.request, '/notifications')
        .then((r) => r.json())
        .then((list) => list.map((n) => n.title));
    expect(await titles()).toEqual(expect.arrayContaining([storeNotice, legacyNotice]));

    // The owner removes the staff from its only store.
    await ownerPage.goto(`${ec}/seller/accounts`);
    await ownerPage.getByLabel(`${staffEmail}を${store.name}の担当から外す`).click();
    await ownerPage.getByRole('alertdialog').getByRole('button', { name: '担当から外す' }).click();
    await expect(ownerPage.getByText(`${staffEmail}を${store.name}の担当から外しました。`)).toBeVisible();

    // Its own notice tells it so; the store's notices are no longer shown, nor readable.
    const notices = await call(staffPage.request, '/notifications').then((r) => r.json());
    const removal = notices.find((n) => n.title === '店舗の担当から外れました');
    expect(removal.body).toBe(`${store.name}の担当から外れました。組織には所属しています。`);
    // #202: no category fits, so it is GENERAL.
    expect(removal.category).toBe('GENERAL');
    expect(notices.map((n) => n.title)).not.toContain(storeNotice);
    expect(notices.map((n) => n.title)).not.toContain(legacyNotice);
    const hiddenId = sql(`SELECT id FROM notifications WHERE title='${storeNotice}';`);
    expect((await call(staffPage.request, `/notifications/${hiddenId}/read`, 'PUT')).status()).toBe(404);
    // Nothing tied to the store can be read any more.
    expect((await call(staffPage.request, '/seller/products?storeId=1')).status()).toBe(403);
    expect((await call(staffPage.request, '/seller/stores').then((r) => r.json())).length).toBe(0);

    // The seller pages: the notices menu only, and the notice can be marked read.
    await staffPage.goto(`${ec}/seller/notifications`);
    const menu = staffPage.getByRole('navigation', { name: '出店者メニュー' });
    await expect(menu.getByRole('link', { name: '出店者通知' })).toBeVisible();
    await expect(menu.getByRole('link', { name: '商品管理' })).toHaveCount(0);
    await expect(staffPage.getByRole('heading', { name: '店舗の担当から外れました' })).toBeVisible();
    await expect(staffPage.getByText(storeNotice)).toHaveCount(0);

    // A page that needs a store, opened by its URL, says so and leads back to the notices.
    await staffPage.goto(`${ec}/seller/products`);
    await expect(staffPage.locator('.workspace-main').getByRole('note')).toContainText(
      'どの店舗にも所属していないため、この画面は使えません',
    );
    await expect(staffPage.getByRole('button', { name: '商品を登録' })).toHaveCount(0);
    await staffPage.reload();
    await expect(staffPage.locator('.workspace-main').getByRole('note')).toContainText(
      'どの店舗にも所属していないため、この画面は使えません',
    );
    await staffPage.screenshot({ path: `${evidence}/unassigned-products-reloaded.png`, fullPage: true });
    await staffPage.getByRole('link', { name: '通知の画面へ戻る' }).click();
    await expect(staffPage).toHaveURL(`${ec}/seller/notifications`);
    await staffPage.reload();
    await expect(staffPage.getByRole('heading', { name: '店舗の担当から外れました' })).toBeVisible();
    await staffPage.screenshot({ path: `${evidence}/unassigned-notifications-reloaded.png`, fullPage: true });
    await writeFile(`${evidence}/notifications.json`, JSON.stringify(notices, null, 2));
  } finally {
    for (const account of accounts) deletePasswordTestAccount(account.email);
    for (const member of members) prepareMember(member, 'USER');
    for (const context of contexts) await context.close();
  }
});
