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
} from './business-helpers.js';
import { sql } from './database.js';

const evidence = 'artifacts/business/notice-category';

// Issue #202: every notice has a category, and only an owner-succession request is marked 重要.
// The request itself is sent by #203, so this test inserts its own notices of each category.
test('only the owner-succession request notice is marked important', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const account = createPasswordTestAccount();
  const context = await browser.newContext();
  /** @type {{id:string}|undefined} */ let member;
  try {
    const page = await context.newPage();
    member = await login(page, account.email, account.secret);
    // The successor is a member of the organization; the request reaches it as a notice to itself.
    prepareStaff(member, { 1: 'STAFF' });
    const tag = randomUUID();
    const notices = {
      OWNER_SUCCESSION_REQUEST: { kind: 'PERSONAL', storeId: 'NULL', title: `オーナーの譲渡の申し出 ${tag}` },
      OWNER_SUCCESSION_RESULT: { kind: 'PERSONAL', storeId: 'NULL', title: `オーナーの譲渡の結果 ${tag}` },
      ORDER: { kind: 'STORE', storeId: '1', title: `新しい注文の試験通知 ${tag}` },
    };
    sql(
      Object.entries(notices)
        .map(
          ([category, n]) => `INSERT INTO notifications(id,member_id,kind,store_id,category,title,body)
            VALUES('${randomUUID()}','${member.id}','${n.kind}',${n.storeId},'${category}','${n.title}','E2E');`,
        )
        .join('\n'),
    );

    // The API returns each notice with its category.
    const listed = async () => call(page.request, '/notifications').then((r) => r.json());
    const categories = (list) => Object.fromEntries(list.map((n) => [n.title, n.category]));
    const expected = Object.fromEntries(Object.entries(notices).map(([category, n]) => [n.title, category]));
    expect(categories(await listed())).toEqual(expected);

    // The notices page marks the request only.
    /** @param {string} title */
    const card = (title) =>
      page.locator('.workspace-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const marked = async () => {
      for (const n of Object.values(notices)) await expect(card(n.title)).toBeVisible();
      await expect(card(notices.OWNER_SUCCESSION_REQUEST.title).getByText('重要', { exact: true })).toBeVisible();
      await expect(card(notices.OWNER_SUCCESSION_RESULT.title).getByText('重要', { exact: true })).toHaveCount(0);
      await expect(card(notices.ORDER.title).getByText('重要', { exact: true })).toHaveCount(0);
      await expect(page.locator('.workspace-main').getByText('重要', { exact: true })).toHaveCount(1);
    };
    await page.goto(`${ec}/seller/notifications`);
    await marked();

    // Reading the request keeps the mark: it comes from the category, not from the read state.
    await card(notices.OWNER_SUCCESSION_REQUEST.title).getByRole('button', { name: '既読にする' }).click();
    await expect(card(notices.OWNER_SUCCESSION_REQUEST.title).getByText('既読', { exact: true })).toBeVisible();
    await page.reload();
    await marked();
    await expect(card(notices.OWNER_SUCCESSION_REQUEST.title).getByText('既読', { exact: true })).toBeVisible();
    await capture(page, `${evidence}/notices-reloaded.png`);
    const persisted = await listed();
    expect(categories(persisted)).toEqual(expected);
    await writeFile(`${evidence}/notifications.json`, JSON.stringify(persisted, null, 2));
  } finally {
    deletePasswordTestAccount(account.email);
    if (member) prepareMember(member, 'USER');
    await context.close();
  }
});
