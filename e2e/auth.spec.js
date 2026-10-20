import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('anonymous catalog remains usable; personal EC and Canvas data is denied', async ({ request }) => {
  expect((await request.get('/api/products?storeId=1')).status()).toBe(200);
  expect((await request.get('/api/stores?latitude=35&longitude=139')).status()).toBe(200);
  expect((await request.post('/api/products/references', { data: { productIds: ['olive'] } })).status()).toBe(200);
  expect(
    (
      await request.post('/api/materials/quote', {
        data: { storeId: 1, items: [{ materialCode: 'plant.oak', quantity: 1, unit: 'piece' }] },
      })
    ).status(),
  ).toBe(200);
  for (const path of ['/cart', '/orders', '/shopping-lists', '/seller/products?storeId=1']) {
    expect((await request.get(`/api${path}`)).status(), path).toBe(401);
  }
  const csrf = await (await request.get('/api/auth/csrf')).json();
  expect((await request.post('/api/products', { data: {}, headers: { [csrf.headerName]: csrf.token } })).status()).toBe(
    401,
  );
  expect((await request.post('/api/auth/logout')).status()).toBe(403);
  const canvas = 'http://127.0.0.1:18280';
  expect((await request.get(`${canvas}/api/assets`)).status()).toBe(200);
  expect((await request.get(`${canvas}/api/gardens`)).status()).toBe(401);
  expect(
    (
      await request.get(`${canvas}/api/gardens`, {
        headers: { Cookie: 'KUSAKARI_SESSION=forged', 'X-User-Id': 'other-user' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(`${canvas}/api/gardens`, { headers: { Cookie: 'KUSAKARI_SESSION=forged' }, data: {} })
    ).status(),
  ).toBe(403);
});

test('authorization start uses code and S256 PKCE; invalid callback cannot authenticate', async ({ request }) => {
  const first = await request.get('/api/auth/login?signup=true&returnTo=https%3A%2F%2Funtrusted.example%2F', {
    maxRedirects: 0,
  });
  expect(first.status()).toBe(302);
  const second = await request.get(first.headers().location, { maxRedirects: 0 });
  expect(second.status()).toBe(302);
  const provider = new URL(second.headers().location);
  expect(provider.origin).toBe('https://kusakari-offline-test.auth.ap-northeast-1.amazoncognito.com');
  expect(provider.searchParams.get('response_type')).toBe('code');
  expect(provider.searchParams.get('code_challenge_method')).toBe('S256');
  expect(provider.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(provider.searchParams.get('state')).toBeTruthy();
  expect(provider.searchParams.get('nonce')).toBeTruthy();
  expect(provider.searchParams.get('screen_hint')).toBe('signup');
  expect(provider.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:15286/api/auth/callback/cognito');
  const cookie = (await request.storageState()).cookies.find((value) => value.name === 'KUSAKARI_SESSION');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe('/');
  expect(cookie?.sameSite).toBe('Lax');
  const invalid = await request.get('/api/auth/callback/cognito?code=invalid&state=not-the-issued-state', {
    maxRedirects: 0,
  });
  expect(invalid.status()).toBe(302);
  expect(invalid.headers().location).toBe('http://127.0.0.1:15286/account/login?auth=failed');
  expect((await (await request.get('/api/auth/me')).json()).authenticated).toBe(false);
});

test('real EC and Canvas screens request login and retain that result after reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/account/login');
  await expect(page.getByRole('main').getByRole('button', { name: 'ログイン', exact: true })).toBeVisible();
  await expect(page.getByLabel('メールアドレス', { exact: true })).toBeVisible();
  await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByRole('button', { name: 'ログイン', exact: true })).toBeVisible();
  await mkdir('artifacts/auth', { recursive: true });
  await page.screenshot({ path: 'artifacts/auth/ec-reloaded.png', fullPage: true });
  await writeFile(
    'artifacts/auth/session.json',
    JSON.stringify(await (await page.request.get('/api/auth/me')).json(), null, 2),
  );
  await page.goto('http://127.0.0.1:15273/');
  await expect(page).toHaveURL('http://127.0.0.1:15286/account/login?returnTo=http%3A%2F%2F127.0.0.1%3A15273%2F');
  await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByRole('button', { name: 'ログイン', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/auth/canvas-reloaded.png', fullPage: true });
  for (const path of ['/gardens/00000000-0000-0000-0000-000000000000', '/model-preview']) {
    await page.goto(`http://127.0.0.1:15273${path}`);
    await expect(page).toHaveURL(
      `http://127.0.0.1:15286/account/login?returnTo=${encodeURIComponent('http://127.0.0.1:15273' + path)}`,
    );
  }
  expect(errors).toEqual([]);
});
