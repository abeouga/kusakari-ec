import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ trace: 'off' });

const out = 'artifacts/signup-card';

// Issue #87: sign-up stays in the same login card and talks to real Cognito through the EC API.
// New accounts are not created here: Cognito would send a real confirmation mail (out of scope).
test('sign-up opens inside the login card without leaving the page and reports real Cognito errors', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const documents = [];
  page.on('framenavigated', (frame) => frame === page.mainFrame() && documents.push(frame.url()));
  await mkdir(out, { recursive: true });
  await page.goto('/account/login?returnTo=%2Fcart');
  const card = page.locator('main.login-card');
  await expect(card.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible();
  const loginBox = await card.boundingBox();
  await page.screenshot({ path: `${out}/login-card.png`, fullPage: true });
  const navigations = documents.length;

  await card.getByRole('button', { name: '新規登録', exact: true }).click();
  await expect(card.getByRole('heading', { name: '新規登録', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/login\?returnTo=%2Fcart$/);
  expect(documents.length).toBe(navigations);
  const signupBox = await card.boundingBox();
  expect(signupBox?.x).toBe(loginBox?.x);
  expect(signupBox?.width).toBe(loginBox?.width);
  await expect(card.getByText('KUSAKARI ACCOUNT', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/signup-card.png`, fullPage: true });

  const email = card.getByLabel('メールアドレス', { exact: true });
  const password = card.getByLabel('パスワード（8文字以上）', { exact: true });
  const confirmPassword = card.getByLabel('パスワード（確認）', { exact: true });
  await email.fill('test.user@example.com');
  await password.fill('signup-card-e2e-1');
  await confirmPassword.fill('signup-card-e2e-2');
  await card.getByRole('button', { name: '確認コードを送信', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveText('パスワードと確認用パスワードが一致しません。');

  await confirmPassword.fill('signup-card-e2e-1');
  const response = page.waitForResponse((value) => value.url().endsWith('/api/auth/signup'));
  await card.getByRole('button', { name: '確認コードを送信', exact: true }).click();
  const existing = await response;
  expect(existing.status()).toBe(409);
  const body = await existing.json();
  expect(body).toEqual({
    code: 'EMAIL_IN_USE',
    message: 'このメールアドレスは既に登録されています。ログインしてください。',
  });
  await expect(card.getByRole('alert')).toHaveText(body.message);
  await expect(card.getByRole('heading', { name: '新規登録', exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/signup-email-in-use.png`, fullPage: true });

  await card.getByRole('button', { name: 'アカウントをお持ちの方はログイン', exact: true }).click();
  await expect(card.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible();
  await expect(card.getByRole('alert')).toHaveCount(0);
  expect(documents.length).toBe(navigations);

  const missingCsrf = await page.request.post('/api/auth/signup', {
    data: { email: 'x@example.com', password: 'abcdefgh', confirmPassword: 'abcdefgh' },
  });
  expect(missingCsrf.status()).toBe(403);
  const hosted = await page.request.get('/api/auth/login?signup=true&returnTo=%2F', { maxRedirects: 0 });
  expect(new URL(hosted.headers().location).pathname).toBe('/account/login');

  await card.getByRole('button', { name: '新規登録', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card.getByRole('heading', { name: '新規登録', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${out}/signup-card-mobile.png`, fullPage: true });

  await page.reload();
  await expect(card.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/reloaded.png`, fullPage: true });
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.authenticated).toBe(false);
  await writeFile(`${out}/api.json`, JSON.stringify({ me, signupEmailInUse: body }, null, 2));
  expect(errors).toEqual([]);
});
