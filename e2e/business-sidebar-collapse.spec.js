import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, capture, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

const sellerMenu = ['商品管理', '店舗受け取り', '注文実績', '店舗一覧', '店舗プロフィール', '出店者通知'];
const operatorMenu = ['会員管理', '商品管理', 'カテゴリ管理', '出店審査', '店舗管理', '全注文管理'];

// Issue #27: seller and operator sidebars can be folded so wide tables get the full width.
// Issue #43: every item carries an icon, and the folded sidebar keeps the icons as a working menu.
// Issue #75: the seller dashboard is gone; /seller opens product management, the first seller page.
for (const [role, email, group, labels, entry, start, startTitle, next, title] of [
  [
    'SELLER',
    'test.seller@example.com',
    '出店者メニュー',
    sellerMenu,
    '/seller',
    '/seller/products',
    '商品管理',
    '/seller/orders',
    '店舗受け取り',
  ],
  [
    'ADMIN',
    'test.admin@example.com',
    '運営者メニュー',
    operatorMenu,
    '/operator',
    '/operator/members',
    '会員管理',
    '/operator/categories',
    'カテゴリ管理',
  ],
]) {
  test(`${role} sidebar can be closed and used from its icons across pages`, async ({ page }) => {
    const dir = 'artifacts/business/sidebar';
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mkdir(dir, { recursive: true });
    prepareMember(await login(page, email), role);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${ec}${entry}`);
      await expect(page).toHaveURL(`${ec}${start}`);
      const sidebar = page.locator('.workspace-sidebar');
      const main = page.locator('.workspace-main');
      const nav = sidebar.getByRole('navigation', { name: group, exact: true });
      const links = nav.getByRole('link');
      const back = sidebar.getByRole('link', { name: '商品一覧へ戻る', exact: true });
      const close = sidebar.getByRole('button', { name: 'メニューを閉じる', exact: true });
      await expect(main.locator('h1')).toHaveText(startTitle);
      await expect(close).toHaveAttribute('aria-expanded', 'true');

      // Open: icon and text side by side for every item, including the link back to the shop.
      await expect(links).toHaveText(labels);
      await expect(nav.locator('a svg')).toHaveCount(labels.length);
      for (const link of await links.all()) await expect(link.locator('svg')).toBeVisible();
      await expect(back.locator('svg')).toBeVisible();
      await expect(nav.getByRole('link', { name: startTitle, exact: true })).toHaveAttribute('aria-current', 'page');

      // The close button sits in the menu header row, borderless and right-aligned with the menu.
      const head = sidebar.locator('.workspace-sidebar-head');
      await expect(head).toContainText(group);
      await expect(head.getByRole('button', { name: 'メニューを閉じる', exact: true })).toBeVisible();
      expect(await close.evaluate((button) => getComputedStyle(button).borderTopWidth)).toBe('0px');
      const closeBox = await close.boundingBox();
      const navBox = await nav.boundingBox();
      const headBox = await head.boundingBox();
      if (!closeBox || !navBox || !headBox) throw new Error('Sidebar layout is not rendered.');
      expect(Math.abs(closeBox.x + closeBox.width - (navBox.x + navBox.width))).toBeLessThanOrEqual(1);
      expect(Math.abs(closeBox.y + closeBox.height / 2 - (headBox.y + headBox.height / 2))).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await capture(page, `${dir}/${role}-open-${width}.png`);
      const openWidth = (await main.boundingBox())?.width ?? 0;

      // Closed from the keyboard: Enter folds the menu and the focus stays on the same button.
      // Text hidden, icons stay, each named by aria-label and title; the current page stays marked.
      await close.focus();
      await page.keyboard.press('Enter');
      const reopen = sidebar.getByRole('button', { name: 'メニューを開く', exact: true });
      await expect(reopen).toHaveAttribute('aria-expanded', 'false');
      await expect(reopen).toBeFocused();
      await expect(head).not.toContainText(group);
      await expect(links).toHaveCount(labels.length);
      for (const [index, label] of labels.entries()) {
        const link = links.nth(index);
        await expect(link).toHaveAttribute('aria-label', label);
        await expect(link).toHaveAttribute('title', label);
        await expect(link.locator('svg')).toBeVisible();
        await expect(link.getByText(label, { exact: true })).toBeHidden();
      }
      await expect(back).toHaveAttribute('title', '商品一覧へ戻る');
      await expect(back.locator('svg')).toBeVisible();
      const current = nav.getByRole('link', { name: startTitle, exact: true });
      await expect(current).toHaveClass('is-active');
      await expect(current).toHaveAttribute('aria-current', 'page');
      if (width === 1440) expect((await main.boundingBox())?.width ?? 0).toBeGreaterThan(openWidth + 100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      // Tab walks from the fold button through the back link and every icon in menu order. On a wide screen the
      // focused icon shows its name beside the column; on a phone the name stays in aria-label and title.
      for (const link of [back, ...(await links.all())]) {
        await page.keyboard.press('Tab');
        await expect(link).toBeFocused();
        const name = link.locator('.workspace-sidebar-label');
        if (width === 1440) await expect(name).toBeVisible();
        else await expect(name).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await capture(page, `${dir}/${role}-focus-${width}.png`);

      // Pressing an icon moves to that page; the sidebar stays closed and marks the new page.
      await nav.getByRole('link', { name: title, exact: true }).click();
      await expect(page).toHaveURL(`${ec}${next}`);
      await expect(main.locator('h1')).toHaveText(title);
      await expect(reopen).toBeVisible();
      await expect(nav.getByRole('link', { name: title, exact: true })).toHaveClass('is-active');
      await expect(nav.getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(current).not.toHaveAttribute('aria-current', 'page');
      await expect(nav.getByText(title, { exact: true })).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await capture(page, `${dir}/${role}-closed-${width}.png`);

      // Enter on a focused icon moves as well.
      await current.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${ec}${start}`);
      await expect(main.locator('h1')).toHaveText(startTitle);
      await expect(current).toHaveAttribute('aria-current', 'page');
      await expect(reopen).toBeVisible();

      await reopen.click();
      await expect(close).toBeVisible();
      await expect(nav.getByText(startTitle, { exact: true })).toBeVisible();
      await expect(current).not.toHaveAttribute('title');

      await page.reload();
      await expect(main.locator('h1')).toHaveText(startTitle);
      await expect(current).toHaveAttribute('aria-current', 'page');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await capture(page, `${dir}/${role}-reloaded-${width}.png`);
    }
    const me = await (await page.request.get(`${ec}/api/auth/me`)).json();
    expect(me.accountType).toBe(role === 'SELLER' ? 'SHOP_STAFF' : role);
    await writeFile(`${dir}/${role}-auth-me.json`, JSON.stringify({ accountType: me.accountType }, null, 2));
    expect(errors).toEqual([]);
  });
}
