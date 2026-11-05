import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

// Issue #11: purchases are picked up at the store, so address management is gone from the account.
test('account settings have no address management and the other settings still open', async ({ page }) => {
  const dir = 'artifacts/business/account-no-address';
  await mkdir(dir, { recursive: true });
  prepareMember(await login(page, 'test.user@example.com'), 'USER');
  await page.goto(`${ec}/account`);
  await page.reload();
  const settings = page.locator('.workspace-sidebar').getByRole('navigation', { name: 'アカウント設定', exact: true });
  await expect(settings.getByRole('link')).toHaveText(['受取連絡先', 'パスワード変更', '退会']);
  await page.screenshot({ path: `${dir}/account-reloaded.png`, fullPage: true });

  await page.goto(`${ec}/account/address`);
  await expect(page.locator('.workspace-main')).toContainText('ページが見つかりません。');
  await expect(page.getByLabel('郵便番号', { exact: true })).toHaveCount(0);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await call(page.request, '/account/address', method, method === 'PUT' ? {} : undefined);
    expect(response.status(), `${method} /api/account/address`).toBe(404);
  }

  // The remaining settings still use their own APIs.
  await settings.getByRole('link', { name: 'パスワード変更', exact: true }).click();
  await expect(page.getByLabel('現在のパスワード', { exact: true })).toBeVisible();
  await settings.getByRole('link', { name: '受取連絡先', exact: true }).click();
  const contact = await call(page.request, '/account/pickup-contact');
  expect(contact.status()).toBe(200);
  await writeFile(`${dir}/pickup-contact-keys.json`, JSON.stringify(Object.keys(await contact.json()), null, 2));
});
