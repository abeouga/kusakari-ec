import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

/** In-app navigation (same as navigation.js) so the Workspace component stays mounted. */
async function go(page, url) {
  await page.evaluate((next) => {
    history.pushState(null, '', next);
    dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

// Issue #27: seller and operator sidebars can be folded so wide tables get the full width.
for (const [role, email, start, next, title] of [
  ['SELLER', 'test.seller@example.com', '/seller', '/seller/orders', '店舗受け取り'],
  ['ADMIN', 'test.admin@example.com', '/operator/members', '/operator/categories', 'カテゴリ管理'],
]) {
  test(`${role} sidebar can be closed and reopened across pages`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mkdir('artifacts/business/sidebar', { recursive: true });
    prepareMember(await login(page, email), role);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${ec}${start}`);
      const sidebar = page.locator('.workspace-sidebar');
      const main = page.locator('.workspace-main');
      const close = sidebar.getByRole('button', { name: 'メニューを閉じる', exact: true });
      await expect(close).toHaveAttribute('aria-expanded', 'true');
      await expect(sidebar.locator('nav a').first()).toBeVisible();
      const openWidth = (await main.boundingBox())?.width ?? 0;

      await close.click();
      const reopen = sidebar.getByRole('button', { name: 'メニューを開く', exact: true });
      await expect(reopen).toHaveAttribute('aria-expanded', 'false');
      await expect(sidebar.locator('nav a').first()).toBeHidden();
      if (width === 1440) expect((await main.boundingBox())?.width ?? 0).toBeGreaterThan(openWidth + 100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/business/sidebar/${role}-closed-${width}.png` });

      await go(page, next);
      await expect(main.locator('h1')).toHaveText(title);
      await expect(reopen).toBeVisible();
      await expect(sidebar.locator('nav a').first()).toBeHidden();

      await reopen.click();
      await expect(close).toBeVisible();
      await expect(sidebar.getByRole('link', { name: title, exact: true })).toBeVisible();
    }
    await page.reload();
    await expect(page.locator('.workspace-main h1')).toHaveText(title);
    await page.screenshot({ path: `artifacts/business/sidebar/${role}-reloaded.png`, fullPage: true });
    const me = await (await page.request.get(`${ec}/api/auth/me`)).json();
    expect(me.role).toBe(role);
    await writeFile(`artifacts/business/sidebar/${role}-auth-me.json`, JSON.stringify({ role: me.role }, null, 2));
    expect(errors).toEqual([]);
  });
}
