import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  prepareMember,
  productInput,
  createPasswordTestAccount,
  deletePasswordTestAccount,
} from './business-helpers.js';

async function submitApplication(page, input) {
  const csrf = await call(page.request, '/auth/csrf').then((r) => r.json());
  return page.request.post(`${ec}/api/account/store-applications`, {
    headers: { [csrf.headerName]: csrf.token },
    multipart: {
      application: {
        name: 'application.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(input)),
      },
      document: { name: 'verification.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') },
    },
  });
}

test('application rejection permits resubmission and address deletion persists', async ({ browser }) => {
  const userContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const user = await userContext.newPage();
  const admin = await adminContext.newPage();
  let member;
  try {
    member = await login(user, 'test.user@example.com');
    prepareMember(member, 'USER');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    const input = {
      company: `再申請検証 ${randomUUID().slice(0, 8)}`,
      contact: '検証担当',
      email: 'test.user@example.com',
      address: '東京都 検証用',
      phone: '0312345678',
      plan: 'STANDARD',
    };
    const submit = () => submitApplication(user, input);
    const first = await submit();
    expect(first.status(), await first.text()).toBe(200);
    const application = await first.json();
    expect((await submit()).status()).toBe(409);
    expect(
      (
        await call(admin.request, `/operator/applications/${application.id}`, 'PUT', { approved: false, reason: '' })
      ).status(),
    ).toBe(400);
    expect(
      (
        await call(admin.request, `/operator/applications/${application.id}`, 'PUT', {
          approved: false,
          reason: '必要事項を補足してください',
        })
      ).status(),
    ).toBe(200);
    const next = await submit();
    expect(next.status(), await next.text()).toBe(200);
    const resubmitted = await next.json();
    expect(resubmitted.id).not.toBe(application.id);
    expect(
      (
        await call(admin.request, `/operator/applications/${resubmitted.id}`, 'PUT', {
          approved: false,
          reason: '検証完了',
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await call(user.request, '/account/address', 'PUT', {
          recipient: '検証利用者',
          postal: '100-0001',
          address: '東京都 検証住所',
        })
      ).status(),
    ).toBe(200);
    expect((await call(user.request, '/account/address', 'DELETE')).status()).toBe(200);
    await user.goto(`${ec}/account/address`);
    await expect(user.getByLabel('受取人', { exact: true })).toHaveValue('');
  } finally {
    if (member) prepareMember(member, 'USER');
    await userContext.close();
    await adminContext.close();
  }
});

test('approved applicant manages only the new store; stale stock, confirmations and category deletion', async ({
  browser,
}) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [user, admin] = await Promise.all(contexts.map((c) => c.newPage()));
  let member;
  try {
    member = await login(user, 'test.user@example.com');
    prepareMember(member, 'USER');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    const company = `新規店舗 ${randomUUID().slice(0, 8)}`;
    const submitted = await submitApplication(user, {
      company,
      contact: '新規担当',
      email: 'test.user@example.com',
      address: '東京都 新規店舗',
      phone: '0312345678',
      plan: 'STANDARD',
    });
    expect(submitted.status(), await submitted.text()).toBe(200);
    const application = await submitted.json();

    // EC-A03: pending applications are listed by default with the application date and their own reason field.
    await admin.goto(`${ec}/operator/applications`);
    await expect(admin.getByRole('combobox', { name: '表示する申請', exact: true })).toHaveValue('PENDING');
    const row = admin.locator('section').filter({ has: admin.getByRole('heading', { name: company, exact: true }) });
    await expect(row).toContainText('申請者：新規担当 / 申請日：');
    await row.getByRole('button', { name: '却下', exact: true }).click();
    await expect(row.getByRole('alert')).toContainText('却下理由を入力してください');
    const listed = await call(admin.request, '/operator/applications').then((r) => r.json());
    expect(listed.find((a) => a.id === application.id).status).toBe('PENDING');
    await row.getByRole('button', { name: '承認', exact: true }).click();
    await expect(admin.getByRole('status')).toContainText('承認しました');
    await expect(row).toHaveCount(0);
    await admin.getByRole('combobox', { name: '表示する申請', exact: true }).selectOption('ALL');
    await expect(row).toContainText('承認');

    const me = await call(user.request, '/auth/me').then((r) => r.json());
    expect(me.role).toBe('SELLER');
    const storeId = me.storeIds[0];
    expect(storeId).not.toBe(1);
    const input = { ...productInput(), storeId };
    const created = await call(user.request, '/products', 'POST', input);
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();
    expect((await call(user.request, '/seller/products?storeId=1')).status()).toBe(403);
    const current = async () =>
      (await call(user.request, `/seller/products?storeId=${storeId}`).then((r) => r.json())).find(
        (p) => p.id === product.id,
      );

    // The store selector starts at, and only offers, the seller's own store.
    await user.goto(`${ec}/seller/products`);
    const select = user.getByRole('combobox', { name: '管理する店舗', exact: true });
    await expect(select).toHaveValue(String(storeId));
    await expect(select.locator('option')).toHaveText([company]);

    // EC-S05 5b: stock changed after it was shown is not overwritten; the latest stock is shown for re-confirmation.
    const stockRow = user.getByTestId(`manage-${product.id}`);
    const stockCell = stockRow.locator('td[data-label="在庫"] .seller-stock > span');
    await expect(stockCell).toHaveText('5');
    await stockRow.getByRole('button', { name: '在庫を編集', exact: true }).click();
    await user.getByRole('spinbutton', { name: '在庫数', exact: true }).fill('7');
    const priced = await call(user.request, `/products/${product.id}`, 'PUT', { ...input, priceYen: 2500 });
    expect(priced.status(), await priced.text()).toBe(200);
    const elsewhere = await call(user.request, `/seller/products/${product.id}/stock`, 'PUT', {
      storeId,
      expectedStock: 5,
      stock: 9,
    });
    expect(elsewhere.status(), await elsewhere.text()).toBe(200);
    await user.getByRole('button', { name: '在庫を保存', exact: true }).click();
    await expect(user.getByRole('alert')).toContainText('在庫数が変更されています（現在の在庫数：9）');
    await expect(stockCell).toHaveText('9');
    await expect(user.getByRole('group', { name: '在庫数の変更' })).toContainText('変更前の在庫数 9');
    await expect(user.getByRole('spinbutton', { name: '在庫数', exact: true })).toHaveValue('7');
    expect((await current()).stock).toBe(9);
    await user.getByRole('button', { name: '在庫を保存', exact: true }).click();
    await expect(user.getByRole('status')).toContainText('在庫数を保存しました');
    await user.reload();
    await expect(stockCell).toHaveText('7');
    await mkdir('artifacts/business', { recursive: true });
    await user.screenshot({ path: 'artifacts/business/new-store-inventory-reloaded.png', fullPage: true });
    const afterInventory = await current();
    expect(afterInventory.stock).toBe(7);
    expect(afterInventory.priceYen).toBe(2500);

    // The product edit form also refuses to overwrite stock that changed while it was open.
    await user.goto(`${ec}/seller/products`);
    await user.getByTestId(`manage-${product.id}`).getByRole('button', { name: '編集', exact: true }).click();
    await user.getByLabel('税込価格（円）', { exact: true }).fill('2600');
    const changedAgain = await call(user.request, `/seller/products/${product.id}/stock`, 'PUT', {
      storeId,
      expectedStock: 7,
      stock: 8,
    });
    expect(changedAgain.status(), await changedAgain.text()).toBe(200);
    await user.getByRole('button', { name: '変更を保存', exact: true }).click();
    await expect(user.getByRole('alert')).toContainText('在庫数が変更されています（現在の在庫数：8）');
    await expect(user.getByText('変更前の在庫数：8')).toBeVisible();
    expect(await current()).toMatchObject({ stock: 8, priceYen: 2500 });
    await user.getByLabel('選択店舗の在庫', { exact: true }).fill('8');
    await user.getByRole('button', { name: '変更を保存', exact: true }).click();
    await expect(user.getByTestId(`manage-${product.id}`)).toContainText('2,600');
    const saved = await current();
    expect(saved).toMatchObject({ stock: 8, priceYen: 2600 });

    // EC-A09: deletion is confirmed; a category used by a listed product stays, one left to deleted products goes.
    const category = `削除確認${randomUUID().slice(0, 8)}`;
    await admin.goto(`${ec}/operator/categories`);
    await admin.getByLabel('カテゴリ名').fill(category);
    await admin.getByRole('button', { name: '保存', exact: true }).click();
    const categoryRow = admin.locator('section').filter({ has: admin.getByText(category, { exact: true }) });
    await expect(categoryRow).toHaveCount(1);
    const used = await call(user.request, '/products', 'POST', { ...productInput(), storeId, category });
    expect(used.status(), await used.text()).toBe(200);
    const usedId = (await used.json()).id;
    const confirmDelete = admin.getByRole('alertdialog', { name: 'カテゴリ削除の確認' });
    await categoryRow.getByRole('button', { name: '削除', exact: true }).click();
    await confirmDelete.getByRole('button', { name: '取消', exact: true }).click();
    await expect(confirmDelete).toHaveCount(0);
    await expect(categoryRow).toHaveCount(1);
    await categoryRow.getByRole('button', { name: '削除', exact: true }).click();
    await confirmDelete.getByRole('button', { name: '削除を確定', exact: true }).click();
    await expect(admin.getByRole('alert')).toContainText('商品で使用中のカテゴリは削除できません');
    await expect(categoryRow).toHaveCount(1);
    const removed = await call(user.request, '/seller/products/status', 'PATCH', {
      storeId,
      productIds: [usedId],
      status: 'DELETED',
    });
    expect(removed.status(), await removed.text()).toBe(200);
    await categoryRow.getByRole('button', { name: '削除', exact: true }).click();
    await confirmDelete.getByRole('button', { name: '削除を確定', exact: true }).click();
    await expect(admin.getByRole('status')).toContainText('カテゴリを削除しました');
    await admin.reload();
    await expect(admin.getByText(category, { exact: true })).toHaveCount(0);
    const categories = await call(admin.request, '/categories').then((r) => r.json());
    expect(categories).not.toContain(category);
    const reused = await call(user.request, '/products', 'POST', { ...productInput(), storeId, category });
    expect(reused.status()).toBe(400);

    // EC-A01/A02: a search without results, then a cancelled, confirmed suspension and a confirmed resumption.
    await admin.goto(`${ec}/operator/members`);
    const search = admin.getByLabel('名前・メール検索');
    await search.fill(`該当なし-${randomUUID()}`);
    await expect(admin.getByText('検索条件に一致する会員はありません。')).toBeVisible();
    await search.fill('test.user@example.com');
    const card = admin.locator('section.workspace-card').filter({ hasText: 'test.user@example.com' });
    const confirmStatus = admin.getByRole('alertdialog', { name: '利用状況変更の確認' });
    await card.getByRole('button', { name: '利用を停止', exact: true }).click();
    await expect(confirmStatus).toContainText('停止中はログインできません');
    await confirmStatus.getByRole('button', { name: '取消', exact: true }).click();
    await expect(card).toContainText('利用中');
    expect((await call(user.request, '/orders')).status()).toBe(200);
    await card.getByRole('button', { name: '利用を停止', exact: true }).click();
    await confirmStatus.getByRole('button', { name: '利用停止を確定', exact: true }).click();
    await expect(card).toContainText('利用停止');
    expect((await call(user.request, '/orders')).status()).toBe(403);
    await card.getByRole('button', { name: '利用を再開', exact: true }).click();
    await confirmStatus.getByRole('button', { name: '利用再開を確定', exact: true }).click();
    await expect(card).toContainText('利用中');
    await admin.reload();
    await expect(card).toContainText('利用中');
    await writeFile(
      'artifacts/business/new-store-management.json',
      JSON.stringify({ storeId, product: saved, categories }, null, 2),
    );
  } finally {
    if (member) prepareMember(member, 'USER');
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('EC-B17/B18 application is confirmed before submission, shows its review and pre-fills a re-application', async ({
  browser,
}) => {
  const account = createPasswordTestAccount();
  const userContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const user = await userContext.newPage();
  const admin = await adminContext.newPage();
  const input = {
    company: `申請確認 ${randomUUID().slice(0, 8)}`,
    contact: '確認担当',
    email: 'test.user@example.com',
    address: '東京都 申請確認',
    phone: '03-1234-5678',
  };
  const labels = {
    company: '会社・事業者名',
    contact: '担当者名',
    email: '連絡先メール',
    address: '所在地',
    phone: '電話番号',
  };
  try {
    await login(user, account.email, account.secret);
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    const sidebar = user.locator('.workspace-sidebar');
    // Direct access to the status page before applying leads to the application form.
    await user.goto(`${ec}/seller/application/status`);
    await expect(user).toHaveURL(`${ec}/seller/application`);
    await expect(user.locator('.workspace-main h1')).toHaveText('出店申請');
    await expect(sidebar.getByRole('link', { name: '出店申請', exact: true })).toBeVisible();
    for (const [name, label] of Object.entries(labels)) await user.getByLabel(label, { exact: true }).fill(input[name]);
    await user.getByLabel('希望出店プラン').selectOption('PRODUCER');
    await user
      .locator('input[type=file]')
      .setInputFiles({ name: 'application.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await user.getByRole('button', { name: '確認画面へ', exact: true }).click();
    const review = user.getByRole('region', { name: '入力内容の確認' });
    await expect(review).toContainText(input.company);
    await expect(review).toContainText('生産者直販');
    await expect(review).toContainText('application.pdf');
    // 6a: 修正する returns to the form with the input kept.
    await review.getByRole('button', { name: '修正する', exact: true }).click();
    await expect(user.getByLabel('会社・事業者名', { exact: true })).toHaveValue(input.company);
    await user.getByLabel('担当者名', { exact: true }).fill('確認担当 修正');
    await user.getByRole('button', { name: '確認画面へ', exact: true }).click();
    await expect(review).toContainText('確認担当 修正');
    const submission = user.waitForResponse(
      (r) => r.url().endsWith('/api/account/store-applications') && r.request().method() === 'POST',
    );
    await review.getByRole('button', { name: '申請する', exact: true }).click();
    expect((await submission).status()).toBe(200);
    await expect(user.getByRole('status')).toContainText('出店申請を受け付けました');
    // EC-B18: the menu switches to the status page, which is read-only while under review.
    await sidebar.getByRole('link', { name: '出店申請状況', exact: true }).click();
    const main = user.locator('.workspace-main');
    await expect(main.locator('h1')).toHaveText('出店申請状況');
    await expect(main).toContainText('審査状況：審査中');
    await expect(main).toContainText(`申請日：${new Date().toLocaleDateString('ja-JP')}`);
    await expect(main).toContainText('審査結果は通知でお知らせします。');
    await expect(main).toContainText('確認担当 修正');
    await expect(main.locator('input, select')).toHaveCount(0);
    await user.goto(`${ec}/seller/application`);
    await expect(user).toHaveURL(`${ec}/seller/application/status`);
    await user.reload();
    await expect(main).toContainText('審査中');
    await mkdir('artifacts/business', { recursive: true });
    await user.screenshot({ path: 'artifacts/business/application-pending-reloaded.png', fullPage: true });
    const [pending] = await call(user.request, '/account/store-applications').then((r) => r.json());
    expect(pending).toMatchObject({
      status: 'PENDING',
      company: input.company,
      contact: '確認担当 修正',
      plan: 'PRODUCER',
    });
    // 3a: after rejection, 再申請する opens the form with the previous content.
    const rejected = await call(admin.request, `/operator/applications/${pending.id}`, 'PUT', {
      approved: false,
      reason: '書類の記載を補足してください',
    });
    expect(rejected.status(), await rejected.text()).toBe(200);
    await user.reload();
    await expect(main).toContainText('審査状況：却下');
    await expect(main).toContainText('却下理由：書類の記載を補足してください');
    await expect(sidebar.getByRole('link', { name: '出店申請状況', exact: true })).toBeVisible();
    await main.getByRole('button', { name: '再申請する', exact: true }).click();
    await expect(user).toHaveURL(`${ec}/seller/application`);
    const previous = { ...input, contact: '確認担当 修正' };
    for (const [name, label] of Object.entries(labels))
      await expect(user.getByLabel(label, { exact: true })).toHaveValue(previous[name]);
    await expect(user.getByLabel('希望出店プラン')).toHaveValue('PRODUCER');
    await writeFile(
      'artifacts/business/application-status.json',
      JSON.stringify(await call(user.request, '/account/store-applications').then((r) => r.json()), null, 2),
    );
  } finally {
    await userContext.close();
    await adminContext.close();
    deletePasswordTestAccount(account.email);
  }
});
