import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const dir = 'artifacts/sticky-header';

// Issue #31: after scrolling, the header (cart and login) stays on screen without scrolling back up.
for (const width of [1440, 390]) {
  test(`header stays at the top while scrolling the catalog at ${width}px`, async ({ page }) => {
    await mkdir(dir, { recursive: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const sticky = page.locator('.ec-sticky-header');
    const cart = sticky.getByRole('link', { name: /カート/ });
    await expect(page.locator('#catalog-product-grid .product-card').first()).toBeVisible();

    await page.locator('#catalog-product-grid .product-card').last().scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(800);
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      return {
        band: box('.kusakari-site-chrome .announcement')?.bottom,
        header: box('.kusakari-site-chrome .site-header')?.top,
        offset: getComputedStyle(document.documentElement).getPropertyValue('--ec-header-offset'),
        stuck: box('.ec-sticky-header')?.bottom,
        wide: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    // The announcement band scrolls away; the header row itself sits at the viewport top.
    expect(layout.band).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.header ?? NaN)).toBeLessThanOrEqual(1);
    expect(parseFloat(layout.offset)).toBeCloseTo(layout.stuck ?? NaN, 0);
    expect(layout.wide).toBe(true);
    await expect(cart).toBeInViewport();
    await page.screenshot({ path: `${dir}/scrolled-${width}.png` });

    // Anchors land below the header, not under it.
    await page.goto('/#plants');
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.getElementById('plants').getBoundingClientRect().top -
            document.querySelector('.ec-sticky-header').getBoundingClientRect().bottom,
        ),
      )
      .toBeGreaterThanOrEqual(-1);
    await page.screenshot({ path: `${dir}/reloaded-${width}.png` });

    await cart.click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(sticky).toBeVisible();
    const products = await (await page.request.get('/api/products')).json();
    expect(Array.isArray(products) ? products.length : products.items?.length).toBeGreaterThan(0);
    await writeFile(
      `${dir}/products-${width}.json`,
      JSON.stringify({ count: products.length ?? products.items?.length, layout }, null, 2),
    );
    expect(errors).toEqual([]);
  });
}
