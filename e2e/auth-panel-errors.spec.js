import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ trace: 'off' });

const dir = 'artifacts/auth-panel-errors';

function password() {
  if (process.env.KUSAKARI_TEST_PASSWORD) return process.env.KUSAKARI_TEST_PASSWORD;
  const accounts = readFileSync(new URL('../../kusakari-terraform/.env.test-accounts', import.meta.url), 'utf8');
  const value = accounts.match(/^KUSAKARI_TEST_PASSWORD=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
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
  await writeFile(`${dir}/form.json`, JSON.stringify({ layout, session: await (await page.request.get('/api/auth/me')).json() }, null, 2));
});

test('signed-in panel shows a logout failure above the account details', async ({ page }) => {
  await page.goto('/account/login');
  await submitLogin(page, password());
  await expect(page).toHaveURL(/127\.0\.0\.1:15286\/$/);
  await page.goto('/account');
  await page.reload();
  await page.route('**/api/auth/logout', (route) => route.abort());
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ログアウト', exact: true })).toBeEnabled();
  const layout = await expectErrorAtTop(page, 'signed-in');
  await writeFile(`${dir}/signed-in.json`, JSON.stringify({ layout, session: await (await page.request.get('/api/auth/me')).json() }, null, 2));
});

test('cart handoff panel shows the handoff failure above the retry message', async ({ page }) => {
  await page.goto('/account/login');
  const guestCart = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/cart');
  await page.reload();
  // A 401 here makes the shop build the browser-side guest cart that login hands off.
  expect((await guestCart).status()).toBe(401);
  // Fail only the cart read that promoteGuestCart makes after Cognito accepts the login.
  await page.route('**/api/cart', (route) => route.abort());
  await submitLogin(page, password());
  await expect(page.getByRole('button', { name: 'カートを引き継いで続ける', exact: true })).toBeEnabled();
  const layout = await expectErrorAtTop(page, 'cart-handoff');
  await writeFile(`${dir}/cart-handoff.json`, JSON.stringify({ layout, session: await (await page.request.get('/api/auth/me')).json() }, null, 2));
});
