import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput } from './business-helpers.js';
import { addImages } from './product-images.js';

test.use({ trace: 'off' });

const noSideScroll = () => document.documentElement.scrollWidth <= innerWidth;

// Issue #44: the product pages show a real heading and an arrow "戻る" button named for screen readers.
// The wizard's own step-back button is "前の手順へ", so the two never read the same.
test('seller returns from product registration and product editing with the back button', async ({ page }) => {
  const dir = 'artifacts/business/product-back';
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  prepareMember(await login(page, 'test.seller@example.com'), 'SELLER');
  const created = await call(page.request, '/products', 'POST', productInput());
  expect(created.status(), await created.text()).toBe(200);
  const product = await created.json();
  const heading = page.locator('.workspace-main h1');
  const form = page.locator('.product-form');
  const back = page.getByRole('button', { name: '商品一覧へ戻る', exact: true });
  const stepBack = form.getByRole('button', { name: '前の手順へ', exact: true });
  const productsLink = page.locator('.workspace-sidebar').getByRole('link', { name: '商品管理', exact: true });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${ec}/seller/products/new`);
    await expect(heading).toHaveText('商品登録');
    await expect(page.locator('.workspace-main')).not.toContainText('Kusakari');
    await expect(form).toBeVisible();
    await expect(back).toHaveText('戻る');
    await expect(back.locator('svg.lucide-arrow-left')).toBeVisible();
    // The bordered green button wins over the generic workspace button style.
    expect(
      await back.evaluate((button) => {
        const style = getComputedStyle(button);
        return [style.color, style.borderTopColor, style.fontSize];
      }),
    ).toEqual(['rgb(41, 76, 62)', 'rgb(203, 211, 199)', '13px']);
    // The new-product page sits under 商品管理, so that menu item stays marked.
    await expect(productsLink).toHaveClass('is-active');
    await expect(productsLink).toHaveAttribute('aria-current', 'true');
    expect(await page.evaluate(noSideScroll)).toBe(true);
    await page.reload();
    await expect(back).toBeVisible();
    await page.screenshot({ path: `${dir}/create-${width}.png`, fullPage: true });

    if (width === 1440) {
      // On step 2 the page-level back button and the wizard's step-back button are told apart.
      await form.getByLabel('商品名', { exact: true }).fill('戻るボタン確認用の商品');
      await form.getByLabel('商品説明', { exact: true }).fill('戻るボタンの区別を確認します。');
      await addImages(form);
      await form.getByLabel('税込価格（円）', { exact: true }).fill('1500');
      await form.getByLabel('選択店舗の在庫', { exact: true }).fill('2');
      await form.getByRole('button', { name: '次へ', exact: true }).click();
      await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
      await expect(back).toHaveText('戻る');
      await expect(stepBack).toBeVisible();
      await expect(form.getByRole('button', { name: '戻る', exact: true })).toHaveCount(0);
      await page.screenshot({ path: `${dir}/create-step2-${width}.png`, fullPage: true });
      await stepBack.click();
      await expect(form.locator('.wizard-heading')).toHaveText('商品情報');
      await expect(form.getByLabel('商品名', { exact: true })).toHaveValue('戻るボタン確認用の商品');
      await expect(page).toHaveURL(`${ec}/seller/products/new`);
    }

    await back.click();
    await expect(page).toHaveURL(`${ec}/seller/products`);
    await expect(heading).toHaveText('商品管理');
    await expect(productsLink).toHaveAttribute('aria-current', 'page');

    await page.getByPlaceholder('商品名・商品番号').fill(product.sku);
    const row = page.getByTestId(`manage-${product.id}`);
    await row.getByRole('button', { name: '編集', exact: true }).click();
    await expect(form).toBeVisible();
    await expect(back).toHaveText('戻る');
    await expect(back.locator('svg.lucide-arrow-left')).toBeVisible();
    expect(await page.evaluate(noSideScroll)).toBe(true);
    await page.screenshot({ path: `${dir}/edit-${width}.png`, fullPage: true });

    // The second edit tab offers "前の手順へ", which stays in the form, next to the page-level "戻る".
    await form
      .getByRole('navigation', { name: '商品編集のタブ' })
      .getByRole('button', { name: '庭オブジェクト' })
      .click();
    await expect(form.locator('.wizard-heading')).toHaveText('庭オブジェクト');
    await expect(stepBack).toBeVisible();
    await expect(back).toBeVisible();
    await stepBack.click();
    await expect(form.locator('.wizard-heading')).toHaveText('商品情報');
    await expect(form).toBeVisible();

    await back.click();
    await expect(form).toHaveCount(0);
    await expect(row).toBeVisible();
    await page.reload();
    await expect(heading).toHaveText('商品管理');
    await page.screenshot({ path: `${dir}/list-after-reload-${width}.png`, fullPage: true });
  }
  const listed = await (await call(page.request, '/seller/products?storeId=1')).json();
  const saved = listed.find((item) => item.id === product.id);
  expect(saved?.sku).toBe(product.sku);
  await writeFile(`${dir}/product.json`, JSON.stringify({ id: saved.id, sku: saved.sku, name: saved.name }, null, 2));
  expect(errors).toEqual([]);
});
