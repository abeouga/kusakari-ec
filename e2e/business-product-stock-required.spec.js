import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, capture, login, prepareMember, productInput } from './business-helpers.js';
import { sql } from './database.js';
import { addImages } from './product-images.js';

test.use({ trace: 'off' });

/** Labels in the visible wizard step, each with whether it shows the red ※. */
async function marks(form) {
  return form.locator('section[data-step]:not([hidden])').evaluate((section) =>
    [...section.querySelectorAll('label, .picker-field-label, .product-image-label')]
      .filter((label) => label.getClientRects().length && !label.closest('[hidden]'))
      .filter((label) => !label.querySelector('label, .picker-field-label'))
      .map((label) => {
        const head = (label.matches('label') && label.querySelector(':scope > span')) || label;
        const after = getComputedStyle(head, '::after');
        const mark = after.content.startsWith('"※"');
        return {
          label: [...head.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent.trim())
            .join(''),
          mark,
          color: mark ? after.color : null,
        };
      })
      .filter((item) => item.label),
  );
}

// Issue #72: a new product needs at least one in stock, and only required fields show a red ※.
test('new product stock must be 1 or more in the wizard and the API, and only required labels show ※', async ({
  page,
}) => {
  test.setTimeout(240000);
  const dir = 'artifacts/business/product-stock-required';
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ec}/seller/products/new`);
  await page.reload();
  const form = page.locator('.product-form');
  const info = form.getByRole('region', { name: '商品情報', exact: true });
  await expect(info.getByRole('button', { name: '在庫を登録する店舗を選ぶ', exact: true })).toBeVisible();

  // Required fields keep `required`; the ※ is hidden from the accessible name and the label still matches exactly.
  for (const name of ['商品名', '商品説明', '税込価格（円）', '選択店舗の在庫']) {
    await expect(info.getByLabel(name, { exact: true })).toHaveAttribute('required', '');
    await expect(info.getByLabel(name, { exact: true })).toHaveAccessibleName(name);
  }
  for (const summary of ['サイズ', '詳しい情報']) await form.locator('summary').getByText(summary).click();
  const infoMarks = await marks(form);
  const required = ['商品名', 'カテゴリー', '商品説明', '税込価格（円）', '選択店舗の在庫', '在庫を登録する店舗'];
  const optional = ['樹齢目安（年）', '鉢径（cm）', '生産者名', '学名', '科名・属名'];
  expect(infoMarks.filter((item) => item.mark).map((item) => item.label)).toEqual(required);
  for (const label of optional) expect(infoMarks.find((item) => item.label === label)?.mark, label).toBe(false);
  for (const item of infoMarks.filter((entry) => entry.mark)) expect(item.color).toBe('rgb(198, 40, 40)');
  // The pickers have no required input, so screen readers hear 「必須」 instead of the hidden ※.
  await expect(info.locator('.picker-field-label .required-mark-text')).toHaveText(['必須', '必須']);
  await expect(info.locator('label .required-mark-text')).toHaveCount(0);
  for (const summary of ['サイズ', '詳しい情報']) await form.locator('summary').getByText(summary).click();

  const name = `在庫必須確認 ${Date.now()}`;
  await info.getByLabel('商品名', { exact: true }).fill(name);
  await info.getByLabel('商品説明', { exact: true }).fill('在庫0では次の手順へ進めないことを確認します。');
  await info.getByLabel('税込価格（円）', { exact: true }).fill('1800');
  const stock = info.getByLabel('選択店舗の在庫', { exact: true });
  await expect(stock).toHaveValue('0');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('商品情報');
  await expect(stock).toBeFocused();
  await expect(stock).toHaveAttribute('aria-invalid', 'true');
  await expect(stock).toHaveAccessibleDescription('在庫は1以上にしてください。');
  await expect(info.locator('.stock-field .field-error')).toHaveText('在庫は1以上にしてください。');
  await expect(form.locator('.wizard-footer [role="alert"]')).toHaveText('在庫は1以上にしてください。');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `${dir}/stock-zero-blocked.png` });

  await stock.fill('1');
  await expect(info.locator('.stock-field .field-error')).toHaveCount(0);
  await expect(stock).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('画像');
  const imageMarks = await marks(form);
  expect(imageMarks.filter((item) => item.mark)).toEqual([
    { label: '商品画像', mark: true, color: 'rgb(198, 40, 40)' },
  ]);
  expect(imageMarks.find((item) => item.label === '商品の写真を選択')?.mark).toBe(false);
  await expect(form.locator('.product-image-label .required-mark-text')).toHaveText('必須');
  await page.screenshot({ path: `${dir}/images-step.png` });
  await addImages(form);
  await form.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
  // Every visible number field shows ※ exactly when its input is required.
  const garden = await form.locator('section[data-step]:not([hidden]) .range-field').evaluateAll((fields) =>
    fields
      .filter((field) => field.getClientRects().length && !field.closest('[hidden]'))
      .map((field) => ({
        label: field.querySelector('label')?.childNodes[0]?.textContent ?? '',
        mark: getComputedStyle(field.querySelector('.range-field-head label'), '::after').content.startsWith('"※"'),
        required: !!field.querySelector('input[type="number"]')?.required,
        // The ※ stays on the label's line instead of wrapping below it.
        lines: Math.round(
          field.querySelector('.range-field-head label').getBoundingClientRect().height /
            parseFloat(getComputedStyle(field.querySelector('.range-field-head label')).fontSize),
        ),
      })),
  );
  expect(garden.length).toBeGreaterThan(0);
  expect(garden.find((field) => field.label === '植物の高さ')).toMatchObject({ mark: true, required: true });
  await expect(form.getByRole('spinbutton', { name: '植物の高さ', exact: true })).toHaveAccessibleName('植物の高さ');
  for (const field of garden) {
    expect(field.mark, field.label).toBe(field.required);
    expect(field.lines, field.label).toBeLessThan(3);
  }
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `${dir}/garden-step.png` });

  // The API refuses a new product with 0 in stock and stores nothing; the error names no stored value.
  const rejected = productInput();
  const refused = await call(page.request, '/products', 'POST', { ...rejected, stock: 0 });
  expect(refused.status()).toBe(400);
  const refusal = await refused.json();
  expect(refusal).toEqual({ code: 'STOCK_REQUIRED', message: '在庫は1以上にしてください。' });
  expect(sql(`SELECT COUNT(*) FROM products WHERE sku='${rejected.sku}';`)).toBe('0');

  // One in stock registers; an edit may still set 0 to mark the product sold out.
  const accepted = productInput();
  const created = await call(page.request, '/products', 'POST', { ...accepted, stock: 1 });
  expect(created.status()).toBe(200);
  const product = await created.json();
  expect(product.stock).toBe(1);
  const soldOut = await call(page.request, `/products/${product.id}`, 'PUT', {
    ...accepted,
    sku: product.sku,
    stock: 0,
    expectedStock: 1,
  });
  expect(soldOut.status()).toBe(200);

  await page.goto(`${ec}/seller/products`);
  await page.reload();
  await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
  const card = page.getByTestId(`manage-${product.id}`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '編集', exact: true }).click();
  const edit = page.locator('.product-form');
  await expect(edit.getByLabel('選択店舗の在庫', { exact: true })).toHaveValue('0');
  await expect(edit.getByLabel('選択店舗の在庫', { exact: true })).toHaveAttribute('min', '0');
  await edit.getByLabel('選択店舗の在庫', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/edit-sold-out.png` });
  await page.reload();
  // The edit form is not part of the URL, so the reloaded list shows the sold-out product.
  await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
  await expect(page.getByTestId(`manage-${product.id}`)).toBeVisible();
  await capture(page, `${dir}/edit-sold-out-reloaded.png`);
  const stored = (await call(page.request, '/seller/products?storeId=1').then((r) => r.json())).find(
    (item) => item.id === product.id,
  );
  expect(stored.stock).toBe(0);
  await writeFile(
    `${dir}/stock-required.json`,
    JSON.stringify({ refusal, refusedSkuStored: 0, created: product, afterSoldOutEdit: stored }, null, 2),
  );
  expect(errors).toEqual([]);
});
