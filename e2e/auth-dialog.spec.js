import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('header opens the dedicated EC login page', async ({ page }) => {
  await page.goto('/');
  await page.locator('.kusakari-site-header').getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/login\?returnTo=/);
  await expect(page.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const session = await (await page.request.get('/api/auth/me')).json();
  if (session.mode === 'cognito') {
    await expect(page.getByLabel('メールアドレス', { exact: true })).toBeVisible();
    await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'パスワードを忘れた方・追加の本人確認' })).toHaveAttribute(
      'href',
      /managed=true/,
    );
  } else {
    await expect(page.getByText('Cognitoが未設定のため、ログイン・新規登録は利用できません。')).toBeVisible();
  }
});

test('login page retains its layout after reload on desktop and mobile', async ({ page }) => {
  await mkdir('artifacts/e2e', { recursive: true });
  for (const width of [1600, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/account/login');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/e2e/login-page-${width}.png`, fullPage: true });
  }
  await writeFile(
    'artifacts/e2e/login-page-session.json',
    JSON.stringify(await (await page.request.get('/api/auth/me')).json(), null, 2),
  );
});
