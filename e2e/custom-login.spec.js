import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ trace: 'off' });

const ec = 'http://127.0.0.1:15286';
const canvas = 'http://127.0.0.1:15273';
const accounts = readFileSync(new URL('../../kusakari-terraform/.env.test-accounts', import.meta.url), 'utf8');
const password = accounts
  .match(/^KUSAKARI_TEST_PASSWORD=(.+)$/m)?.[1]
  .trim()
  .replace(/^["']|["']$/g, '');
if (!password) throw new Error('The ignored test-account password file is required.');

test('account header link is hidden for guests and visible after login in EC and Canvas', async ({ page }) => {
  await mkdir('artifacts/account-header', { recursive: true });
  const account = page.locator('.kusakari-site-header').getByRole('link', { name: 'アカウント', exact: true });
  await page.goto(ec);
  await page.reload();
  await expect(page.locator('.login-entry')).toBeVisible();
  await expect(account).toHaveCount(0);
  const guest = await (await page.request.get(`${ec}/api/auth/me`)).json();
  expect(guest.authenticated).toBe(false);
  await page.screenshot({ path: 'artifacts/account-header/ec-guest.png' });
  await page.goto(canvas);
  await expect(page).toHaveURL(new RegExp(`${ec}/account/login\\?returnTo=`));
  await expect(account).toHaveCount(0);
  await page.getByLabel('メールアドレス', { exact: true }).fill('test.user@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(canvas + '/');
  for (const [name, url] of [['ec', ec], ['canvas', canvas]]) {
    await page.goto(url);
    await page.reload();
    await expect(account).toBeVisible();
    await expect(page.locator('.login-entry')).toHaveCount(0);
    await page.screenshot({ path: `artifacts/account-header/${name}-authenticated.png` });
  }
  const member = await (await page.request.get(`${ec}/api/auth/me`)).json();
  expect(member.authenticated).toBe(true);
  const gardens = await (await page.request.get(`${canvas}/api/gardens`)).json();
  const csrf = await (await page.request.get(`${ec}/api/auth/csrf`)).json();
  expect((await page.request.post(`${ec}/api/auth/logout`, { headers: { [csrf.headerName]: csrf.token } })).status()).toBe(200);
  await page.goto(ec);
  await expect(page.locator('.login-entry')).toBeVisible();
  await expect(account).toHaveCount(0);
  await page.goto(canvas);
  await expect(page).toHaveURL(new RegExp(`${ec}/account/login\\?returnTo=`));
  await expect(account).toHaveCount(0);
  await writeFile('artifacts/account-header/api.json', JSON.stringify({ guest, member, gardens }, null, 2));
});

test('custom EC login shares a real Cognito session with Canvas and redirects again after logout', async ({
  page,
  context,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const missingCsrf = await page.request.post('/api/auth/login', {
    data: { email: 'test.user@example.com', password },
  });
  expect(missingCsrf.status()).toBe(403);
  await page.goto(canvas);
  await expect(page).toHaveURL(`${ec}/account/login?returnTo=${encodeURIComponent(canvas + '/')}`);
  await page.getByLabel('メールアドレス', { exact: true }).fill('test.user@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill('deliberately-invalid');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('メールアドレスまたはパスワードが正しくありません。');
  const before = (await context.cookies()).find((cookie) => cookie.name === 'KUSAKARI_SESSION')?.value;
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(canvas + '/');
  const after = (await context.cookies()).find((cookie) => cookie.name === 'KUSAKARI_SESSION');
  expect(after?.value).toBeTruthy();
  expect(after?.value).not.toBe(before);
  expect(after?.httpOnly).toBe(true);
  const me = await (await page.request.get(`${ec}/api/auth/me`)).json();
  expect(me).toMatchObject({ authenticated: true, email: 'test.user@example.com', role: 'USER' });
  await page.reload();
  await expect(page.getByRole('heading', { name: '新しい庭をつくる', exact: true })).toBeVisible();
  await expect(page.locator('.kusakari-site-header')).toBeVisible();
  await expect(page.locator('.kusakari-site-header .login-entry')).toHaveCount(0);
  await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '出店者', exact: true })).toHaveCount(0);
  await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '管理者画面' })).toHaveCount(0);
  const csrf = await (await page.request.get(`${ec}/api/auth/csrf`)).json();
  const headers = { [csrf.headerName]: csrf.token };
  await page.getByLabel('庭の名前', { exact: true }).fill(`Custom login E2E ${Date.now()}`);
  await page.getByRole('button', { name: '庭を作成', exact: true }).click();
  await expect(page).toHaveURL(/\/gardens\/[a-z0-9-]+$/);
  const gardenId = new URL(page.url()).pathname.split('/').at(-1);
  await page.getByRole('button', { name: '3D庭', exact: true }).click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '3D庭', exact: true }).click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect(page.locator('.kusakari-site-header .login-entry')).toHaveCount(0);
  await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '出店者', exact: true })).toHaveCount(0);
  const saved = await page.request.get(`${canvas}/api/gardens/${gardenId}`);
  expect(saved.status()).toBe(200);
  await mkdir('artifacts/custom-login', { recursive: true });
  await page.screenshot({ path: 'artifacts/custom-login/canvas-reloaded.png' });
  await writeFile('artifacts/custom-login/garden.json', JSON.stringify(await saved.json(), null, 2));
  await writeFile('artifacts/custom-login/session.json', JSON.stringify(me, null, 2));
  await page.getByRole('button', { name: '土台設定', exact: true }).click();
  await page.getByLabel('幅 (m)', { exact: true }).fill('13');
  const denied = page.waitForResponse(
    (response) =>
      response.status() === 401 &&
      (response.url().startsWith(canvas + '/api/') || response.url().startsWith(ec + '/api/')),
  );
  expect((await page.request.post(`${ec}/api/auth/logout`, { headers })).status()).toBe(200);
  // Either an in-flight EC request or the next autosave may detect the expired session first.
  try {
    await page.getByRole('button', { name: '土台に適用', exact: true }).click({ timeout: 5000 });
  } catch {
    await expect(page).toHaveURL(new RegExp(`${ec}/account/login\\?returnTo=`));
  }
  await denied;
  await expect(page).toHaveURL(new RegExp(`${ec}/account/login\\?returnTo=`));
  await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/custom-login/login-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('custom login rejects external return targets and preserves EC sessions after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.kusakari-site-header .login-entry')).toBeVisible();
  await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '出店者', exact: true })).toHaveCount(0);
  await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '管理者画面' })).toHaveCount(0);
  await page.goto('/account/login?returnTo=https%3A%2F%2Funtrusted.example%2F');
  await page.getByLabel('メールアドレス', { exact: true }).fill('test.seller@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(ec + '/');
  await page.reload();
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me).toMatchObject({ authenticated: true, email: 'test.seller@example.com' });
  for (const path of ['/', '/cart', '/account', '/seller']) {
    await page.goto(path);
    await expect(page.locator('.kusakari-site-header')).toBeVisible();
    await expect(page.locator('.kusakari-site-header .login-entry')).toHaveCount(0);
    await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '出店者', exact: true })).toBeVisible();
    await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '管理者画面' })).toHaveCount(0);
    if (path === '/account') {
      await expect(page.locator('.workspace-main h1')).toHaveText('アカウント情報');
      await expect(page.locator('.workspace-sidebar').getByRole('link', { name: '出店申請' })).toHaveCount(0);
    }
  }
  await page.screenshot({ path: 'artifacts/custom-login/ec-authenticated-header.png', fullPage: true });
  await page.goto(canvas);
  await page.reload();
  await expect(page.locator('.kusakari-site-header').getByRole('link', { name: '出店者', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/custom-login/seller-canvas-header.png', fullPage: true });
  await page.goto(ec);
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  expect((await page.request.post('/api/auth/logout', { headers: { [csrf.headerName]: csrf.token } })).status()).toBe(
    200,
  );
  await page.goto('/');
  await expect(page.locator('.kusakari-site-header .login-entry')).toBeVisible();
  await page.goto('/account/login');
  await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/custom-login/login-desktop.png', fullPage: true });
});

test('only the designated admin sees the admin header link in EC and Canvas', async ({ page }) => {
  await page.goto('/account/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill('test.admin@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(ec + '/');
  expect(await (await page.request.get('/api/auth/me')).json()).toMatchObject({
    authenticated: true, email: 'test.admin@example.com', role: 'ADMIN',
  });
  for (const url of [ec + '/', ec + '/account', ec + '/operator', canvas + '/']) {
    await page.goto(url);
    await page.reload();
    const header = page.locator('.kusakari-site-header');
    await expect(header.getByRole('link', { name: '管理者画面' })).toBeVisible();
    await expect(header.getByRole('link', { name: '出店者', exact: true })).toBeVisible();
    await expect(header.locator('.login-entry')).toHaveCount(0);
    if (url === ec + '/account') {
      await expect(page.locator('.workspace-main h1')).toHaveText('アカウント情報');
      await expect(page.locator('.workspace-sidebar').getByRole('link', { name: '出店申請' })).toHaveCount(0);
    }
  }
  await page.screenshot({ path: 'artifacts/custom-login/admin-canvas-header.png', fullPage: true });
});

test('account entry from Canvas shows member settings without guest or technical menu items', async ({ page }) => {
  await page.goto('/account/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill('test.user@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(ec + '/');
  expect(await (await page.request.get('/api/auth/me')).json()).toMatchObject({
    authenticated: true, email: 'test.user@example.com', role: 'USER',
  });
  for (const [name, url] of [['ec', ec], ['canvas', canvas]]) {
    await page.goto(url);
    await page.reload();
    const header = page.locator('.kusakari-site-header');
    await expect(header).toBeVisible();
    await expect(header.locator('.login-entry')).toHaveCount(0);
    await expect(header.getByRole('link', { name: '出店者', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `artifacts/custom-login/user-${name}-header.png`, fullPage: true });
  }
  await page.locator('.kusakari-site-header').getByRole('link', { name: 'アカウント', exact: true }).click();
  await expect(page).toHaveURL(ec + '/account');
  const sidebar = page.locator('.workspace-sidebar');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.reload();
    await expect(page.locator('.workspace-main h1')).toHaveText('アカウント情報');
    await expect(sidebar.getByRole('navigation', { name: 'マイページ', exact: true }).getByRole('link')).toHaveText([
      'アカウント情報', '注文状況', '通知一覧',
    ]);
    await expect(sidebar.getByRole('navigation', { name: 'アカウント設定', exact: true }).getByRole('link')).toHaveText([
      '住所管理', 'パスワード変更', '退会',
    ]);
    await expect(sidebar.getByRole('link', { name: '出店申請', exact: true })).toBeVisible();
    for (const name of ['ログイン', '新規登録', 'パスワードリセット', '配置素材の商品候補']) {
      await expect(sidebar.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/custom-login/account-sidebar-${width}.png`, fullPage: true });
  }
  for (const name of ['注文状況', '通知一覧', '住所管理', 'パスワード変更', '退会', 'アカウント情報']) {
    await sidebar.getByRole('link', { name, exact: true }).click();
    await expect(page.locator('.workspace-main h1')).toHaveText(name);
    await expect(sidebar.getByRole('link', { name, exact: true })).toHaveClass('is-active');
  }
});
