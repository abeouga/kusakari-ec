import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, capture, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

// Issue #75: the seller dashboard repeated the sales page, so it is gone. Every way into the seller screen
// (the footer "出店者ポータル" link, /seller and the old /seller/messages) opens product management.
test('seller screen opens on product management without a dashboard', async ({ page }) => {
  const dir = 'artifacts/business/seller-entry';
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir(dir, { recursive: true });
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const sidebar = page.locator('.workspace-sidebar');
  const nav = sidebar.getByRole('navigation', { name: '出店者メニュー', exact: true });
  const heading = page.locator('.workspace-main h1');
  const products = nav.getByRole('link', { name: '商品管理', exact: true });

  await page.goto(`${ec}/`);
  await page.locator('.site-footer').getByRole('link', { name: '出店者ポータル', exact: true }).click();
  await expect(page).toHaveURL(`${ec}/seller/products`);
  await expect(heading).toHaveText('商品管理');
  await expect(products).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link')).toHaveText([
    '商品管理',
    '店舗受け取り',
    '注文実績',
    '店舗一覧',
    '店舗プロフィール',
    '出店者通知',
    // Issue #111: the SELLER fixture is a MANAGER, so the personnel pages follow.
    'アカウント',
    '招待キー',
  ]);
  await expect(sidebar.getByText('ダッシュボード', { exact: true })).toHaveCount(0);

  for (const entry of ['/seller', '/seller/messages']) {
    await page.goto(`${ec}${entry}`);
    await expect(page).toHaveURL(`${ec}/seller/products`);
    await expect(heading).toHaveText('商品管理');
    await expect(products).toHaveAttribute('aria-current', 'page');
  }
  await page.reload();
  await expect(heading).toHaveText('商品管理');
  await expect(products).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.workspace-main').getByText(/^[1-9]\d*件の商品/)).toBeVisible();
  await capture(page, `${dir}/seller-products-reloaded.png`);

  // The sales page stays as it was.
  await nav.getByRole('link', { name: '注文実績', exact: true }).click();
  await expect(page).toHaveURL(`${ec}/seller/sales`);
  await page.reload();
  await expect(heading).toHaveText('注文実績');
  await expect(nav.getByRole('link', { name: '注文実績', exact: true })).toHaveAttribute('aria-current', 'page');
  // Issue #130: the report's heading is the store name; the page heading above stays '注文実績'.
  await expect(page.getByTestId('sales-report')).toBeVisible();
  await expect(page.locator('.workspace-main')).toContainText('注文数：');
  await capture(page, `${dir}/seller-sales-reloaded.png`);

  const me = await (await page.request.get(`${ec}/api/auth/me`)).json();
  expect(me.accountType).toBe('SHOP_STAFF');
  const storeId = me.storeIds[0];
  const productsResponse = await call(page.request, `/seller/products?storeId=${storeId}`);
  const ordersResponse = await call(page.request, `/seller/orders?storeId=${storeId}`);
  expect(productsResponse.status()).toBe(200);
  expect(ordersResponse.status()).toBe(200);
  const sellerProducts = await productsResponse.json();
  const orders = await ordersResponse.json();
  await writeFile(
    `${dir}/seller-api.json`,
    JSON.stringify(
      {
        accountType: me.accountType,
        storeId,
        products: sellerProducts.map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
        orders: orders.map((o) => ({ id: o.id, status: o.status })),
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
