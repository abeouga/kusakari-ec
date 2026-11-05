import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Issue #27: seller and operator sidebars can be folded so wide tables get the full width.
test('seller and operator sidebars can be closed and reopened across pages', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('artifacts/e2e', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [start, next, title] of [
      ['/seller', '/seller/orders', '店舗受け取り'],
      ['/operator/members', '/operator/categories', 'カテゴリ管理'],
    ]) {
      await page.goto(start);
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
      await page.screenshot({ path: `artifacts/e2e/sidebar-closed${start.replaceAll('/', '-')}-${width}.png` });

      // In-app navigation keeps the closed state.
      await page.evaluate((url) => {
        history.pushState(null, '', url);
        dispatchEvent(new PopStateEvent('popstate'));
      }, next);
      await expect(main.locator('h1')).toHaveText(title);
      await expect(reopen).toBeVisible();
      await expect(sidebar.locator('nav a').first()).toBeHidden();

      await reopen.click();
      await expect(close).toBeVisible();
      await expect(sidebar.getByRole('link', { name: title, exact: true })).toBeVisible();
    }
  }
  await page.goto('/account');
  await expect(page.locator('.workspace-sidebar').getByRole('button', { name: /メニューを/ })).toHaveCount(0);
  await page.goto('/seller');
  await page.reload();
  await page.screenshot({ path: 'artifacts/e2e/sidebar-collapse-reloaded.png', fullPage: true });
  const session = await (await page.request.get('/api/session')).json();
  await writeFile('artifacts/e2e/sidebar-collapse-api.json', JSON.stringify(session, null, 2));
  expect(errors).toEqual([]);
});
