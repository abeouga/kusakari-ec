import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, call, login, prepareMember, productInput } from './business-helpers.js';

test.use({ trace: 'off' });

// Issue #6: the operator's product tab shows name, category and description, searches, and opens details.
test('operator product list shows product details, searches and filters by state', async ({ browser }) => {
  const sellerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  const admin = await adminContext.newPage();
  const dir = 'artifacts/business/operator-products';
  await mkdir(dir, { recursive: true });
  try {
    prepareMember(await login(seller, 'test.seller@example.com'), 'SELLER');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    const input = { ...productInput(), description: '管理画面の検索と詳細表示を確認する説明文です。' };
    const created = await call(seller.request, '/products', 'POST', input);
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();

    await admin.goto(`${ec}/operator/products`);
    await admin.getByLabel('キーワード', { exact: true }).fill(input.sku);
    await expect(admin.getByRole('status').filter({ hasText: '件 / 全' })).toContainText('1件 / 全');
    const card = admin.getByTestId(`operator-product-${product.id}`);
    await expect(card).toContainText(input.name);
    await expect(card).toContainText(`${input.category} / 商品番号 ${input.sku} / `);
    await expect(card).toContainText(input.description);
    await expect(card.locator('img.operator-product-thumb')).toHaveAttribute('src', input.imageUrl);

    await card.getByRole('button', { name: input.name, exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '商品の詳細' });
    await expect(dialog).toContainText(input.description);
    await expect(dialog).toContainText(input.sku);
    await expect(dialog).toContainText('公開可能');
    await admin.screenshot({ path: `${dir}/detail.png` });
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).toHaveCount(0);

    await card.getByLabel('理由・コメント', { exact: true }).fill('E2Eの公開停止確認');
    await card.getByRole('button', { name: '公開を停止', exact: true }).click();
    await expect(card).toContainText('公開停止中');
    await admin.reload();
    await admin.getByLabel('状態', { exact: true }).selectOption('公開停止中');
    await admin.getByLabel('キーワード', { exact: true }).fill(input.description.slice(0, 8));
    await expect(card).toContainText('公開停止中');
    await admin.getByLabel('状態', { exact: true }).selectOption('公開可能');
    await expect(card).toHaveCount(0);
    await admin.getByLabel('状態', { exact: true }).selectOption('公開停止中');
    await admin.screenshot({ path: `${dir}/reloaded.png`, fullPage: true });

    const rows = await call(admin.request, '/operator/products').then((r) => r.json());
    const row = rows.find((p) => p.id === product.id);
    expect(row).toMatchObject({ name: input.name, sku: input.sku, category: input.category, suspended: true });
    await writeFile(`${dir}/operator-product.json`, JSON.stringify(row, null, 2));
  } finally {
    await sellerContext.close();
    await adminContext.close();
  }
});
