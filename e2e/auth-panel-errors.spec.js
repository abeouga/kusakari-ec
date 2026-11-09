import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ trace: 'off' });

const dir = 'artifacts/auth-panel-errors';

function password() {
  if (process.env.KUSAKARI_TEST_PASSWORD) return process.env.KUSAKARI_TEST_PASSWORD;
  const accounts = readFileSync(new URL('../../kusakari-terraform/.env.test-accounts', import.meta.url), 'utf8');
  const value = accounts
    .match(/^KUSAKARI_TEST_PASSWORD=(.+)$/m)?.[1]
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!value) throw new Error('The ignored test-account password file is required.');
  return value;
}

/** @param {import('@playwright/test').Page} page @param {string} secret */
async function submitLogin(page, secret) {
  await page.getByLabel('メールアドレス', { exact: true }).fill('test.user@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
}

/** The alert must be the panel's first child and keep 16px above the content that follows it. */
async function expectErrorAtTop(page, name) {
  const alert = page.locator('section.workspace-card > p.auth-error[role="alert"]');
  await expect(alert).toBeVisible();
  const layout = await alert.evaluate((element) => {
    const next = /** @type {HTMLElement} */ (element.nextElementSibling);
    return {
      first: element.parentElement?.firstElementChild === element,
      next: `${next.tagName.toLowerCase()}${next.className ? '.' + next.className : ''}`,
      gap: next.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
      text: element.textContent,
    };
  });
  expect(layout.first).toBe(true);
  expect(layout.gap).toBeCloseTo(16, 0);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  return layout;
}

test('login form shows the Cognito error above the form after reload', async ({ page }) => {
  await mkdir(dir, { recursive: true });
  await page.goto('/account/login');
  await page.reload();
  await submitLogin(page, 'deliberately-invalid');
  const layout = await expectErrorAtTop(page, 'form');
  expect(layout.next).toBe('form.auth-form');
  expect(layout.text).toBe('メールアドレスまたはパスワードが正しくありません。');
  await writeFile(
    `${dir}/form.json`,
    JSON.stringify({ layout, session: await (await page.request.get('/api/auth/me')).json() }, null, 2),
  );
});

test('signed-in panel shows a logout failure above the account details', async ({ page }) => {
  await page.goto('/account/login');
  await submitLogin(page, password());
  await expect(page).toHaveURL(/127\.0\.0\.1:15286\/$/);
  await page.goto('/account');
  await page.reload();
  const message = '通信できないためログアウトできませんでした。接続を確認してもう一度お試しください。';
  // Issue #8: a dropped connection must show a Japanese message, not the browser's "Failed to fetch".
  // Offline fails the CSRF read that comes first; a blocked logout request fails the second request.
  for (const blocked of ['**/api/auth/csrf', '**/api/auth/logout']) {
    await page.route(blocked, (route) => route.abort());
    await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
    await expect(page.getByRole('button', { name: 'ログアウト', exact: true })).toBeEnabled();
    await expect(page.locator('p.auth-error[role="alert"]')).toHaveText(message);
    await page.unroute(blocked);
  }
  await page.route('**/api/auth/logout', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  const layout = await expectErrorAtTop(page, 'signed-in');
  expect(layout.text).toBe(message);
  expect((await (await page.request.get('/api/auth/me')).json()).authenticated).toBe(true);
  await writeFile(
    `${dir}/signed-in.json`,
    JSON.stringify({ layout, session: await (await page.request.get('/api/auth/me')).json() }, null, 2),
  );
});
