import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, login, prepareMember } from './business-helpers.js';

test.use({ trace: 'off' });

// Issue #23: product registration fields were centered; text must start at the left like other forms.
// Issue #46 removed the product-number input from registration.
test('product form fields are left aligned and checkboxes keep their size', async ({ page }) => {
  const dir = 'artifacts/business/product-form-alignment';
  await mkdir(dir, { recursive: true });
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  await page.goto(`${ec}/seller/products/new`);
  await page.reload();
  const form = page.locator('.product-form');
  await form.getByLabel('商品名', { exact: true }).fill('左寄せ確認');
  await form.locator('summary').getByText('詳しい情報', { exact: true }).click();
  const fields = await form.evaluate((root) => {
    const pick = (selector) => {
      const element = /** @type {HTMLElement} */ (root.querySelector(selector));
      const style = getComputedStyle(element);
      return {
        selector,
        align: style.textAlign,
        width: element.getBoundingClientRect().width,
        label: element.closest('label, .picker-field')?.getBoundingClientRect().width ?? 0,
      };
    };
    return {
      text: [
        '[name="name"]',
        '[name="priceYen"]',
        '[name="stock"]',
        // Issue #46: category and store are chosen in dialogs; their value boxes span the field.
        '.picker-field-value',
        '[name="description"]',
      ].map(pick),
      checkbox: [...root.querySelectorAll('input[type="checkbox"]')].map((box) => box.getBoundingClientRect().width),
    };
  });
  for (const field of fields.text) {
    expect(['start', 'left'], field.selector).toContain(field.align);
    expect(field.width, field.selector).toBeCloseTo(field.label, 0);
  }
  expect(fields.checkbox.length).toBeGreaterThan(0);
  for (const width of fields.checkbox) expect(width).toBeLessThan(40);
  await page.screenshot({ path: `${dir}/new-product-form.png`, fullPage: true });
  const me = await (await page.request.get(`${ec}/api/auth/me`)).json();
  expect(me.role).toBe('SELLER');
  await writeFile(`${dir}/fields.json`, JSON.stringify({ role: me.role, fields }, null, 2));
});
