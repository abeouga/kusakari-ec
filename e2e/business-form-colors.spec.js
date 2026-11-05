import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add } from './business-helpers.js';

test.use({ trace: 'off' });

const dir = 'artifacts/business/issue-47';

/**
 * Issue #47: the page background, the card that groups a form, and each field must be told apart.
 * Reads the colors the browser actually paints and the WCAG contrast of the field border and text.
 */
async function formColors(page, selectors) {
  return page.evaluate(({ pageSelector, cardSelector, fieldSelector }) => {
    const rgb = (value) =>
      value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const luminance = (value) => {
      const [r, g, b] = rgb(value).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const style = (selector) => {
      const element = selector === 'html' ? document.documentElement : document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      return getComputedStyle(element);
    };
    const field = style(fieldSelector);
    const card = style(cardSelector).backgroundColor;
    return {
      page: style(pageSelector).backgroundColor,
      card,
      field: field.backgroundColor,
      fieldBorderOnField: ratio(field.borderTopColor, field.backgroundColor),
      fieldBorderOnCard: ratio(field.borderTopColor, card),
      fieldText: ratio(field.color, field.backgroundColor),
    };
  }, selectors);
}

async function expectTiers(page, name, width, selectors) {
  const colors = await formColors(page, selectors);
  expect(new Set([colors.page, colors.card, colors.field]).size, JSON.stringify(colors)).toBe(3);
  expect(colors.fieldBorderOnField).toBeGreaterThanOrEqual(3);
  expect(colors.fieldBorderOnCard).toBeGreaterThanOrEqual(3);
  expect(colors.fieldText).toBeGreaterThanOrEqual(4.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `${dir}/after-reload-${name}-${width}.png`,
    fullPage: true,
    mask: [page.locator('input[type="email"]')],
  });
  return colors;
}

const workspace = { pageSelector: '.workspace-shell', cardSelector: '.workspace-card' };

test('login, seller, operator and buyer forms separate page, card and field colors', async ({ browser }) => {
  await mkdir(dir, { recursive: true });
  const report = {};
  const contexts = [];
  const open = async () => {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    return { page, errors };
  };
  try {
    const guest = await open();
    const seller = await open();
    const admin = await open();
    const buyer = await open();

    for (const width of [1440, 390]) {
      await guest.page.setViewportSize({ width, height: 900 });
      await guest.page.goto(`${ec}/account/login`);
      await guest.page.reload();
      await expect(guest.page.getByLabel('メールアドレス', { exact: true })).toBeVisible();
      report[`login-${width}`] = await expectTiers(guest.page, 'login', width, {
        pageSelector: '.login-page',
        cardSelector: '.login-card',
        fieldSelector: '.auth-form input',
      });
    }

    prepareMember(await login(seller.page, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(admin.page, 'test.admin@example.com'), 'ADMIN');
    prepareMember(await login(buyer.page, 'test.user@example.com'), 'USER');
    const created = await call(seller.page.request, '/products', 'POST', productInput());
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();
    await add(buyer.page.request, product.id, 1);

    const screens = [
      [seller.page, 'seller-product-new', '/seller/products/new', 'input[name="name"]', '.workspace-card'],
      [seller.page, 'seller-products', '/seller/products', '.seller-filters input', '.workspace-card'],
      [admin.page, 'operator-categories', '/operator/categories', 'input[name="name"]', '.workspace-card'],
      [buyer.page, 'buyer-address', '/account/address', 'input[name="recipient"]', '.workspace-card'],
      [buyer.page, 'buyer-pickup-contact', '/account/pickup-contact', 'input[name="recipientName"]', '.workspace-card'],
    ];
    for (const width of [1440, 390]) {
      for (const [page, name, path, field, card] of screens) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${ec}${path}`);
        await page.reload();
        await expect(page.locator(field).first()).toBeVisible();
        await expect(page.locator(card).first()).toBeVisible();
        report[`${name}-${width}`] = await expectTiers(page, name, width, {
          ...workspace,
          cardSelector: card,
          fieldSelector: field,
        });
      }

      // The pickup confirmation is a step inside the cart page, so it is reopened after the reload.
      await buyer.page.setViewportSize({ width, height: 900 });
      await buyer.page.goto(`${ec}/cart`);
      await buyer.page.reload();
      await buyer.page.getByRole('button', { name: '注文内容を確認する', exact: true }).click();
      await expect(buyer.page.getByRole('radio', { name: /店舗でお支払い/ })).toBeChecked();
      report[`checkout-confirm-${width}`] = await expectTiers(buyer.page, 'checkout-confirm', width, {
        pageSelector: 'html',
        cardSelector: '.checkout-block',
        fieldSelector: '.payment-option',
      });
    }

    const cart = await call(buyer.page.request, '/cart').then((r) => r.json());
    expect(cart.items.some((line) => line.product.id === product.id)).toBe(true);
    const roles = {};
    for (const [name, { page }] of Object.entries({ seller, admin, buyer }))
      roles[name] = (await page.request.get(`${ec}/api/auth/me`).then((r) => r.json())).role;
    expect(roles).toEqual({ seller: 'SELLER', admin: 'ADMIN', buyer: 'USER' });
    await writeFile(
      `${dir}/api.json`,
      JSON.stringify(
        { roles, cart: { storeName: cart.storeName, itemCount: cart.items.length }, colors: report },
        null,
        2,
      ),
    );
    for (const { errors } of [guest, seller, admin, buyer]) expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
