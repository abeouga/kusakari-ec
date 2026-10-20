import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  canvas,
  call,
  login,
  prepareMember,
  productInput,
  add,
  createPasswordTestAccount,
  deletePasswordTestAccount,
} from './business-helpers.js';
import { sql } from './database.js';

test.use({ trace: 'off' });

test('seller publication, buyer cart, product placement, checkout, pickup and persisted notifications', async ({
  browser,
}) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  try {
    const sellerMember = await login(seller, 'test.seller@example.com');
    const buyerMember = await login(buyer, 'test.user@example.com');
    prepareMember(sellerMember, 'SELLER');
    prepareMember(buyerMember, 'USER');
    const input = productInput();
    const created = await call(seller.request, '/products', 'POST', input);
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();
    await seller.goto(`${ec}/seller/products`);
    const row = seller.getByTestId(`manage-${product.id}`);
    await expect(row).toContainText(input.name);
    await row.getByRole('button', { name: '公開中：非表示にする', exact: true }).click();
    await expect(row).toContainText('非表示');
    await seller.reload();
    await expect(row).toContainText('非表示');
    await row.getByRole('button', { name: '非表示：再公開する', exact: true }).click();
    await expect(row).toContainText('公開中');
    await buyer.goto(ec);
    await buyer.getByRole('button', { name: `${input.name}の詳細`, exact: true }).click();
    await buyer.getByRole('dialog').getByRole('button', { name: 'カートに追加', exact: true }).click();
    await expect.poll(async () => (await call(buyer.request, '/cart').then((r) => r.json())).itemCount).toBe(1);
    await buyer.getByRole('link', { name: 'Canvasでイメージする' }).click();
    await expect(buyer).toHaveURL(new RegExp(`productId=${product.id}`));
    await buyer.locator('#garden-name').fill(`購入確認 ${randomUUID().slice(0, 8)}`);
    await buyer.getByRole('button', { name: '庭を作成', exact: true }).click();
    await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(buyer.getByTestId('garden-canvas')).toBeVisible();
    const gardenId = new URL(buyer.url()).pathname.split('/').pop();
    await expect(buyer.getByTestId(`asset-product:${product.id}`)).toHaveAttribute('aria-pressed', 'true');
    const surface = buyer.locator('[data-testid="garden-canvas"] canvas');
    const box = await surface.boundingBox();
    await surface.click({ position: { x: box.width * 0.5, y: box.height * 0.55 } });
    await expect
      .poll(async () => {
        const garden = await call(buyer.request, `/gardens/${gardenId}`, 'GET', undefined, canvas).then((r) =>
          r.json(),
        );
        return garden.objects.length;
      })
      .toBe(1);
    await buyer.reload();
    await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(buyer.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
    const garden = await call(buyer.request, `/gardens/${gardenId}`, 'GET', undefined, canvas).then((r) => r.json());
    expect(garden.objects[0].productId).toBe(product.id);
    expect((await call(seller.request, `/gardens/${gardenId}`, 'GET', undefined, canvas)).status()).toBe(404);
    await mkdir('artifacts/business', { recursive: true });
    await buyer.screenshot({ path: 'artifacts/business/placed-reloaded.png' });
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    try {
      prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
      expect(
        (
          await call(admin.request, `/operator/products/${product.id}/moderation`, 'PUT', {
            suspended: true,
            reason: '保存済み配置の確認',
          })
        ).status(),
      ).toBe(200);
      await buyer.reload();
      await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
      await expect(buyer.getByTestId('model-loaded')).toHaveText('読み込み済み: 1 / 1');
      await buyer.getByRole('tab', { name: '買い物リスト（1）', exact: true }).click();
      await expect(
        buyer.getByText('この店舗の販売対象ではないため購入できません。保存済みの配置は維持されます。'),
      ).toBeVisible();
      await buyer.screenshot({ path: 'artifacts/business/suspended-garden.png' });
    } finally {
      expect(
        (
          await call(admin.request, `/operator/products/${product.id}/moderation`, 'PUT', {
            suspended: false,
            reason: '確認完了',
          })
        ).status(),
      ).toBe(200);
      await adminContext.close();
    }

    await buyer.goto(`${ec}/cart`);
    await buyer.getByRole('button', { name: '注文内容を確認する' }).click();
    const ordered = buyer.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await buyer.getByRole('button', { name: '注文を確定する', exact: true }).click();
    const response = await ordered;
    expect(response.status()).toBe(200);
    const order = await response.json();
    const stock = () =>
      call(buyer.request, '/products?storeId=1')
        .then((r) => r.json())
        .then((ps) => ps.find((p) => p.id === product.id).stock);
    expect(await stock()).toBe(4);
    const replay = await call(buyer.request, '/orders', 'POST', response.request().postDataJSON());
    expect((await replay.json()).id).toBe(order.id);
    expect(await stock()).toBe(4);
    expect((await call(buyer.request, '/cart').then((r) => r.json())).itemCount).toBe(0);
    await login(buyer, 'test.user@example.com');
    await buyer.goto(`${ec}/purchases`);
    await expect(buyer.getByTestId(`order-${order.id}`)).toContainText(input.name);
    await seller.goto(`${ec}/seller/orders`);
    const received = seller.getByTestId(`order-${order.id}`);
    await received.getByRole('button', { name: '受取準備完了にする' }).click();
    await expect(received).toContainText('受取準備完了');
    await received.getByRole('button', { name: '引き渡し完了にする' }).click();
    await expect(received).toContainText('引き渡し完了');
    await seller.reload();
    await expect(received).toContainText('引き渡し完了');
    await buyer.goto(`${ec}/notifications`);
    await buyer.getByRole('button', { name: '既読にする' }).first().click();
    await buyer.reload();
    await expect(buyer.getByText('既読', { exact: true }).first()).toBeVisible();
    await buyer.goto(`${ec}/purchases`);
    await buyer.screenshot({ path: 'artifacts/business/purchases-reloaded.png', fullPage: true });
    await seller.screenshot({ path: 'artifacts/business/seller-orders-reloaded.png', fullPage: true });
    await writeFile(
      'artifacts/business/flow.json',
      JSON.stringify(
        { order: await call(buyer.request, `/orders/${order.id}`).then((r) => r.json()), garden, stock: await stock() },
        null,
        2,
      ),
    );
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});

test('concurrent final stock, cancellation locking, access control and catalog moderation', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [buyer, seller, admin] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    for (const [page, email, role] of [
      [buyer, 'test.user@example.com', 'USER'],
      [seller, 'test.seller@example.com', 'SELLER'],
      [admin, 'test.admin@example.com', 'ADMIN'],
    ])
      prepareMember(await login(page, email), role);
    const input = { ...productInput(), stock: 1 };
    const result = await call(seller.request, '/products', 'POST', input);
    expect(result.status(), await result.text()).toBe(200);
    const product = await result.json();
    const carts = await Promise.all([add(buyer.request, product.id), add(seller.request, product.id)]);
    const results = await Promise.all(
      [buyer, seller].map((p, i) =>
        call(p.request, '/orders', 'POST', {
          requestId: randomUUID(),
          revision: carts[i].revision,
          expectedTotalYen: carts[i].totalYen,
        }),
      ),
    );
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
    const winning = results[0].ok() ? buyer : seller;
    const losing = winning === buyer ? seller : buyer;
    const order = await results.find((r) => r.ok()).json();
    expect((await call(losing.request, `/orders/${order.id}`)).status()).toBe(404);
    expect((await call(buyer.request, '/operator/members')).status()).toBe(403);
    expect((await call(buyer.request, '/seller/orders?storeId=1')).status()).toBe(403);
    expect(
      (await call(winning.request, `/orders/${order.id}/cancellation`, 'POST', { reason: '数量変更' })).status(),
    ).toBe(200);
    expect(
      (
        await call(seller.request, `/seller/orders/${order.id}/status`, 'PUT', {
          expectedStatus: 'ACCEPTED',
          status: 'READY',
        })
      ).status(),
    ).toBe(409);
    const approvals = await Promise.all(
      [1, 2].map(() =>
        call(seller.request, `/seller/orders/${order.id}/cancellation`, 'PUT', { approved: true, reason: '' }),
      ),
    );
    expect(approvals.map((r) => r.status()).sort()).toEqual([200, 409]);
    const stock = await call(buyer.request, '/products?storeId=1')
      .then((r) => r.json())
      .then((ps) => ps.find((p) => p.id === product.id).stock);
    expect(stock).toBe(1);
    expect(
      (
        await call(admin.request, `/operator/products/${product.id}/moderation`, 'PUT', {
          suspended: true,
          reason: '確認のため停止',
        })
      ).status(),
    ).toBe(200);
    expect(
      (await call(buyer.request, '/products?storeId=1').then((r) => r.json())).some((p) => p.id === product.id),
    ).toBe(false);
    const suspendedCart = await add(losing.request, product.id, 0);
    expect(suspendedCart).toBeTruthy();
    expect(
      (
        await call(admin.request, `/operator/products/${product.id}/moderation`, 'PUT', {
          suspended: false,
          reason: '確認完了',
        })
      ).status(),
    ).toBe(200);
    await writeFile(
      'artifacts/business/conflicts.json',
      JSON.stringify(
        {
          orderId: order.id,
          concurrent: results.map((r) => r.status()),
          cancellation: approvals.map((r) => r.status()),
          restocked: stock,
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('account, applications with private documents, store profile, categories and suspension persist', async ({
  browser,
}) => {
  const userContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const user = await userContext.newPage();
  const admin = await adminContext.newPage();
  let member;
  try {
    member = await login(user, 'test.user@example.com');
    prepareMember(member, 'USER');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    await user.goto(`${ec}/account/address`);
    await user.getByLabel('受取人', { exact: true }).fill('検証利用者');
    await user.getByLabel('郵便番号', { exact: true }).fill('100-0001');
    await user.getByLabel('住所', { exact: true }).fill('東京都 検証用住所');
    await user.getByRole('button', { name: '住所を保存' }).click();
    await expect(user.getByRole('status')).toContainText('保存しました');
    await user.reload();
    await expect(user.getByLabel('受取人', { exact: true })).toHaveValue('検証利用者');
    await user.goto(`${ec}/seller/application`);
    await user.getByLabel('会社・事業者名').fill(`検証店舗 ${randomUUID().slice(0, 8)}`);
    await user.getByLabel('担当者名').fill('担当者');
    await user.getByLabel('連絡先メール').fill('test.user@example.com');
    await user.getByLabel('所在地').fill('東京都 検証用店舗');
    await user.getByLabel('電話番号').fill('0312345678');
    await user
      .locator('input[type=file]')
      .setInputFiles({ name: 'application.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\\n%%EOF') });
    const submission = user.waitForResponse(
      (r) => r.url().endsWith('/api/account/store-applications') && r.request().method() === 'POST',
    );
    await user.getByRole('button', { name: '出店を申請', exact: true }).click();
    const submitted = await submission;
    expect(submitted.status(), await submitted.text()).toBe(200);
    const application = await submitted.json();
    await admin.goto(`${ec}/operator/applications`);
    const row = admin
      .locator('section')
      .filter({ has: admin.getByRole('heading', { name: application.company, exact: true }) });
    const approval = admin.waitForResponse(
      (r) => r.url().endsWith(`/api/operator/applications/${application.id}`) && r.request().method() === 'PUT',
    );
    await row.getByRole('button', { name: '承認', exact: true }).click();
    const approved = await approval;
    expect(approved.status(), await approved.text()).toBe(200);
    await expect(row.getByRole('button', { name: '承認', exact: true })).toHaveCount(0);
    const me = await call(user.request, '/auth/me').then((r) => r.json());
    expect(me.role).toBe('SELLER');
    await user.goto(`${ec}/seller/profile`);
    await user.getByLabel('店舗紹介').fill('保存した店舗紹介');
    await user.getByRole('button', { name: '店舗情報を保存' }).click();
    await expect(user.getByRole('status')).toContainText('保存しました');
    await user.goto(`${ec}/store/${me.storeIds[0]}`);
    await expect(user.getByText('保存した店舗紹介')).toBeVisible();
    const name = `検証分類${randomUUID().slice(0, 8)}`;
    await admin.goto(`${ec}/operator/categories`);
    await admin.getByLabel('カテゴリ名').fill(name);
    await admin.getByRole('button', { name: '保存', exact: true }).click();
    await expect(admin.getByText(name, { exact: true })).toBeVisible();
    await admin.reload();
    await expect(admin.getByText(name, { exact: true })).toBeVisible();
    expect((await call(admin.request, '/operator/categories/庭木', 'DELETE')).status()).toBe(409);
    expect(
      (await call(admin.request, `/operator/members/${member.id}/enabled`, 'PUT', { enabled: false })).status(),
    ).toBe(200);
    expect((await call(user.request, '/orders')).status()).toBe(403);
    expect(
      (await call(admin.request, `/operator/members/${member.id}/enabled`, 'PUT', { enabled: true })).status(),
    ).toBe(200);
    await login(user, 'test.user@example.com');
    expect((await call(user.request, '/orders')).status()).toBe(200);
    expect((await call(user.request, '/account', 'DELETE')).status()).toBe(200);
    expect((await call(user.request, '/orders')).status()).toBe(401);
    expect(sql(`SELECT enabled FROM auth_members WHERE id='${member.id}'`)).toBe('0');
    await admin.screenshot({ path: 'artifacts/business/categories-reloaded.png', fullPage: true });
  } finally {
    if (member) prepareMember(member, 'USER'); // Restore only this dedicated database's fixture identity.
    await userContext.close();
    await adminContext.close();
  }
});

test('Cognito password change requires current credentials and supports re-login', async ({ page }) => {
  const account = createPasswordTestAccount();
  const changed = `Aa9!${randomUUID()}`;
  try {
    await login(page, account.email, account.secret);
    expect(
      (
        await call(page.request, '/account/password', 'PUT', {
          currentPassword: 'Incorrect-Password-123!',
          newPassword: changed,
        })
      ).status(),
    ).toBe(401);
    const response = await call(page.request, '/account/password', 'PUT', {
      currentPassword: account.secret,
      newPassword: changed,
    });
    expect(response.status(), await response.text()).toBe(200);
    await login(page, account.email, changed);
    expect((await call(page.request, '/auth/me').then((r) => r.json())).authenticated).toBe(true);
  } finally {
    deletePasswordTestAccount(account.email);
  }
});
