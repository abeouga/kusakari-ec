import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput, add } from './business-helpers.js';

test.use({ trace: 'off' });

const dir = 'artifacts/business/issue-47';

/**
 * Issue #47: the page background, the card that groups a form, and each field must be told apart.
 * Reads the colors the browser actually paints around one field: the page and card it is really
 * inside, the nearest painted background behind it, and the WCAG contrast of its border and text.
 * @param {import('@playwright/test').Locator} field
 * @param {{pageSelector:string,cardSelector:string}} selectors
 */
async function formColors(field, selectors) {
  return field.evaluate((element, { pageSelector, cardSelector }) => {
    const numbers = (value) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const opaque = (value) => numbers(value).length > 0 && (numbers(value)[3] ?? 1) > 0;
    const luminance = (value) => {
      const [r, g, b] = numbers(value)
        .slice(0, 3)
        .map((c) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const card = element.closest(cardSelector);
    if (!card) throw new Error(`The field is not inside ${cardSelector}`);
    const pageElement = card.closest(pageSelector);
    if (!pageElement) throw new Error(`The card is not inside ${pageSelector}`);
    let behind = element.parentElement;
    while (behind && !opaque(getComputedStyle(behind).backgroundColor)) behind = behind.parentElement;
    if (!behind) throw new Error('No painted background behind the field');
    const fieldStyle = getComputedStyle(element);
    const cardStyle = getComputedStyle(card);
    const page = getComputedStyle(pageElement).backgroundColor;
    const backdrop = getComputedStyle(behind).backgroundColor;
    return {
      page,
      card: cardStyle.backgroundColor,
      cardBorder: cardStyle.borderTopColor,
      backdrop,
      field: fieldStyle.backgroundColor,
      fieldBorder: fieldStyle.borderTopColor,
      pageToCard: ratio(page, cardStyle.backgroundColor),
      cardBorderOnPage: ratio(cardStyle.borderTopColor, page),
      fieldBorderOnField: ratio(fieldStyle.borderTopColor, fieldStyle.backgroundColor),
      fieldBorderOnCard: ratio(fieldStyle.borderTopColor, cardStyle.backgroundColor),
      fieldBorderOnBackdrop: ratio(fieldStyle.borderTopColor, backdrop),
      fieldText: ratio(fieldStyle.color, fieldStyle.backgroundColor),
    };
  }, selectors);
}

/** Field border and text meet WCAG AA (UI parts 3:1, text 4.5:1) against everything they sit on. */
function expectFieldContrast(colors) {
  const detail = JSON.stringify(colors);
  expect(colors.fieldBorderOnField, detail).toBeGreaterThanOrEqual(3);
  expect(colors.fieldBorderOnCard, detail).toBeGreaterThanOrEqual(3);
  expect(colors.fieldBorderOnBackdrop, detail).toBeGreaterThanOrEqual(3);
  expect(colors.fieldText, detail).toBeGreaterThanOrEqual(4.5);
}

/**
 * The three tiers differ and the card edge is visible against the page. Storefront pages keep their
 * off-white page background, so there the card is told apart by its border alone.
 */
async function expectTiers(page, name, width, field, selectors, { storePage = false, fullPage = true } = {}) {
  const colors = await formColors(field, selectors);
  const detail = JSON.stringify(colors);
  expect(new Set([colors.page, colors.card, colors.field]).size, detail).toBe(3);
  expect(colors.cardBorderOnPage, detail).toBeGreaterThanOrEqual(1.2);
  if (!storePage) expect(colors.pageToCard, detail).toBeGreaterThanOrEqual(1.1);
  expectFieldContrast(colors);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `${dir}/after-reload-${name}-${width}.png`,
    fullPage,
    mask: [page.locator('input[type="email"]')],
  });
  return colors;
}

const workspace = { pageSelector: '.workspace-shell', cardSelector: '.workspace-card' };
/** Waits until the hover transition on the element has finished. */
const settled = (locator) => locator.evaluate((element) => Promise.all(element.getAnimations().map((a) => a.finished)));

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
      const email = guest.page.getByLabel('メールアドレス', { exact: true });
      await expect(email).toBeVisible();
      report[`login-${width}`] = await expectTiers(guest.page, 'login', width, email, {
        pageSelector: '.login-page',
        cardSelector: '.login-card',
      });
    }

    prepareMember(await login(seller.page, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(admin.page, 'test.admin@example.com'), 'ADMIN');
    prepareMember(await login(buyer.page, 'test.user@example.com'), 'USER');
    const created = await call(seller.page.request, '/products', 'POST', productInput());
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();
    await add(buyer.page.request, product.id, 1);

    /** @type {[import('@playwright/test').Page, string, string, (page: import('@playwright/test').Page) => import('@playwright/test').Locator, boolean?][]} */
    const screens = [
      [seller.page, 'seller-product-new', '/seller/products/new', (p) => p.locator('input[name="name"]')],
      [seller.page, 'seller-products', '/seller/products', (p) => p.locator('.seller-filters input')],
      // The moderation row of the product created above; the list holds every product, so only the viewport is saved.
      [
        admin.page,
        'operator-products',
        '/operator/products',
        (p) =>
          p
            .locator('.workspace-card')
            .filter({ has: p.getByRole('heading', { name: product.name, exact: true }) })
            .getByLabel('理由・コメント'),
        false,
      ],
      [buyer.page, 'buyer-address', '/account/address', (p) => p.locator('input[name="recipient"]')],
      [buyer.page, 'buyer-pickup-contact', '/account/pickup-contact', (p) => p.locator('input[name="recipientName"]')],
    ];
    for (const width of [1440, 390]) {
      for (const [page, name, path, locate, fullPage = true] of screens) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${ec}${path}`);
        await page.reload();
        const field = locate(page).first();
        await expect(field).toBeVisible();
        await field.scrollIntoViewIfNeeded();
        report[`${name}-${width}`] = await expectTiers(page, name, width, field, workspace, { fullPage });
      }

      // The category name form sits directly on the page, outside any card, so it is kept as a screenshot only.
      await admin.page.setViewportSize({ width, height: 900 });
      await admin.page.goto(`${ec}/operator/categories`);
      await admin.page.reload();
      await expect(admin.page.locator('.workspace-form input[name="name"]')).toBeVisible();
      await admin.page.screenshot({ path: `${dir}/after-reload-operator-categories-${width}.png`, fullPage: true });

      // The pickup confirmation is a step inside the cart page, so it is reopened after the reload.
      await buyer.page.setViewportSize({ width, height: 900 });
      await buyer.page.goto(`${ec}/cart`);
      await buyer.page.reload();
      await buyer.page.getByRole('button', { name: '注文内容を確認する', exact: true }).click();
      await expect(buyer.page.getByRole('radio', { name: /店舗でお支払い/ })).toBeChecked();
      const store = { pageSelector: 'html', cardSelector: '.checkout-block' };
      const unselected = buyer.page.locator('.payment-option[data-selected="false"]').first();
      await expect(unselected).toBeVisible();
      report[`checkout-confirm-${width}`] = await expectTiers(
        buyer.page,
        'checkout-confirm',
        width,
        unselected,
        store,
        {
          storePage: true,
        },
      );
      const selected = await formColors(buyer.page.locator('.payment-option[data-selected="true"]'), store);
      expectFieldContrast(selected);
      report[`checkout-selected-${width}`] = selected;
      await unselected.hover();
      await settled(unselected);
      const hovered = await formColors(unselected, store);
      expectFieldContrast(hovered);
      expect(hovered.fieldBorder).not.toBe(report[`checkout-confirm-${width}`].fieldBorder);
      report[`checkout-hover-${width}`] = hovered;
      await buyer.page.mouse.move(0, 0);
    }

    const cart = await call(buyer.page.request, '/cart').then((r) => r.json());
    expect(cart.items.some((line) => line.product.id === product.id)).toBe(true);
    const moderation = await call(admin.page.request, '/operator/products').then((r) => r.json());
    const listed = moderation.find((row) => row.id === product.id);
    expect(listed?.name).toBe(product.name);
    const roles = {};
    for (const [name, { page }] of Object.entries({ seller, admin, buyer }))
      roles[name] = (await page.request.get(`${ec}/api/auth/me`).then((r) => r.json())).role;
    expect(roles).toEqual({ seller: 'SELLER', admin: 'ADMIN', buyer: 'USER' });
    await writeFile(
      `${dir}/api.json`,
      JSON.stringify(
        {
          roles,
          cart: { storeName: cart.storeName, itemCount: cart.items.length },
          moderatedProduct: { name: listed.name, suspended: listed.suspended },
          colors: report,
        },
        null,
        2,
      ),
    );
    for (const { errors } of [guest, seller, admin, buyer]) expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
