import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ec, call, login, prepareMember, capture } from './business-helpers.js';
import { sql } from './database.js';

test.use({ trace: 'retain-on-failure' });

// A withdrawn member owned by this test. Withdrawal disables the account (AuthMember.withdraw), so its button reads
// 「利用を再開」. The row is kept for audit, like the other dedicated-DB fixtures.
function createWithdrawnMember() {
  if (process.env.KUSAKARI_ACCEPTANCE_LIVE === 'true')
    throw new Error('Fixtures cannot change the development database.');
  const id = randomUUID();
  const email = `withdrawn-${id}@example.com`;
  sql(`INSERT INTO members(id,issuer,subject,email,display_name,account_type,enabled,withdrawn_at)
    VALUES('${id}','e2e-fixture','${id}','${email}','E2E退会済み会員','USER',FALSE,CURRENT_TIMESTAMP);`);
  return { id, email };
}

// Issue #78 / EC-A02 6a: the buttons of administrators and withdrawn members can be pressed, and confirming shows
// 「管理者または退会済み会員の状態は変更できません。」 without changing the account.
test('EC-A02 administrators and withdrawn members show why their status cannot change', async ({ page }) => {
  const dir = 'artifacts/business/member-status-fixed';
  await mkdir(dir, { recursive: true });
  const admin = await login(page, 'test.admin@example.com');
  prepareMember(admin, 'ADMIN');
  const withdrawn = createWithdrawnMember();
  const message = '管理者または退会済み会員の状態は変更できません。';
  const confirmStatus = page.getByRole('alertdialog', { name: '利用状況変更の確認' });
  const search = page.getByLabel('名前・メール検索');
  const cases = [
    { email: 'test.admin@example.com', id: admin.id, button: '利用を停止', confirm: '利用停止を確定', state: '利用中' },
    { email: withdrawn.email, id: withdrawn.id, button: '利用を再開', confirm: '利用再開を確定', state: '退会済み' },
  ];

  await page.goto(`${ec}/operator/members`);
  for (const [index, c] of cases.entries()) {
    await search.fill(c.email);
    const card = page.locator('section.workspace-card').filter({ hasText: c.email });
    await expect(card).toContainText(c.state);
    const button = card.getByRole('button', { name: c.button, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await confirmStatus.getByRole('button', { name: c.confirm, exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(confirmStatus).toHaveCount(0);
    await expect(card).toContainText(c.state);
    await capture(page, `${dir}/${index === 0 ? 'admin' : 'withdrawn'}-message.png`, card);
  }

  // The rejection came from the server and nothing changed: after a reload and in the API.
  const response = await call(page.request, `/operator/members/${withdrawn.id}/enabled`, 'PUT', { enabled: true });
  expect(response.status()).toBe(409);
  expect((await response.json()).message).toBe(message);
  await page.reload();
  const members = await call(page.request, '/operator/members').then((r) => r.json());
  const fixed = cases.map((c) => members.find((m) => m.id === c.id));
  expect(fixed.map((m) => m.enabled)).toEqual([true, false]);
  expect(fixed[1].withdrawnAt).toBeTruthy();
  for (const c of cases) {
    await search.fill(c.email);
    await expect(page.locator('section.workspace-card').filter({ hasText: c.email })).toContainText(c.state);
  }
  await search.fill(withdrawn.email);
  await capture(page, `${dir}/withdrawn-reloaded.png`);
  await writeFile(`${dir}/members.json`, JSON.stringify({ rejection: message, members: fixed }, null, 2));
});
