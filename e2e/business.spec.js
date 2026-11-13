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
  fillApplication,
  openStore,
} from './business-helpers.js';

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
    await buyer.getByLabel('植物を検索', { exact: true }).fill(input.sku);
    await buyer.getByRole('button', { name: `${input.name}の詳細`, exact: true }).click();
    await buyer.getByRole('dialog').getByRole('button', { name: 'カートに追加', exact: true }).click();
    await expect.poll(async () => (await call(buyer.request, '/cart').then((r) => r.json())).itemCount).toBe(1);
    await buyer.getByRole('link', { name: 'Canvasでイメージする' }).click();
    await expect(buyer).toHaveURL(new RegExp(`productId=${product.id}`));
    // Canvas creates a garden from the list's first card; its name is edited later in the editor.
    await buyer.getByRole('button', { name: '新しい庭をつくる', exact: true }).click();
    await expect(buyer).toHaveURL(new RegExp(`/gardens/[a-z0-9-]+\\?productId=${product.id}$`));
    const gardenId = new URL(buyer.url()).pathname.split('/').pop();
    await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
    await expect(buyer.getByTestId('garden-canvas')).toBeVisible();
    // Canvas places products only after a garden photo is uploaded and its outline is confirmed.
    await buyer.getByTestId('photo-required').getByRole('button', { name: '写真をアップロード', exact: true }).click();
    const photo = await buyer.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 400;
      const context = canvas.getContext('2d');
      context.fillStyle = '#b7d0dc';
      context.fillRect(0, 0, 600, 400);
      context.fillStyle = '#8eaa71';
      context.fillRect(0, 180, 600, 220);
      return canvas.toDataURL('image/png');
    });
    await buyer
      .getByLabel('庭の写真を選択')
      .setInputFiles({ name: 'garden.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
    for (const [x, y] of [
      [0.15, 0.8],
      [0.85, 0.8],
      [0.8, 0.2],
      [0.2, 0.2],
    ]) {
      const point = await buyer.locator('.photo-stage').evaluate(
        (node, target) => {
          const screen = new DOMPoint(target.x * 600, target.y * 400).matrixTransform(node.getScreenCTM());
          return { x: screen.x, y: screen.y };
        },
        { x, y },
      );
      await buyer.mouse.click(point.x, point.y);
    }
    await buyer.getByRole('button', { name: '始点につないで輪郭を確定', exact: true }).click();
    await expect(buyer.getByTestId('save-status')).toHaveText('保存済み');
    // Opening the garden again with the product id selects the product that came from the EC product page.
    await buyer.reload();
    await buyer.getByRole('button', { name: '3D庭', exact: true }).click();
    await buyer.getByRole('button', { name: '上から見る', exact: true }).click();
    await buyer.waitForTimeout(400); // Orbit controls settle after the explicit top-view command.
    await expect(buyer.getByTestId('photo-required')).toHaveCount(0);
    await expect(buyer.getByTestId(`browse-${product.id}`)).toHaveClass(/is-selected/);
    const box = await buyer.getByTestId('garden-canvas').locator('canvas').boundingBox();
    await buyer.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
    // A shop account cannot use Canvas at all (canvas#71), so another member's garden is refused before ownership.
    expect((await call(seller.request, `/gardens/${gardenId}`, 'GET', undefined, canvas)).status()).toBe(403);
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
        buyer.getByText('現在は販売されていないため購入できません。保存済みの配置は維持されます。'),
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
    // The confirmation step replaces the editable cart with the pickup store and a demo payment choice.
    await expect(buyer.getByRole('heading', { name: 'お支払い・受け取りの確認' })).toBeVisible();
    // The pickup store is the store of the product in the cart.
    await expect(buyer.getByTestId('checkout-store')).toContainText(
      (await call(buyer.request, '/cart').then((r) => r.json())).items[0].storeName,
    );
    await expect(buyer.getByRole('button', { name: /を1個増やす$/ })).toHaveCount(0);
    await expect(buyer.getByRole('radio', { name: /店舗でお支払い/ })).toBeChecked();
    // Issue #132: pay-at-store keeps working without a payment provider; PayPay and Rakuten Pay are gone.
    await expect(buyer.getByRole('radio', { name: /PayPay|楽天ペイ/ })).toHaveCount(0);
    await expect(buyer.getByTestId('checkout-payment')).toContainText('店舗でお支払い');
    await buyer.screenshot({ path: 'artifacts/business/checkout-confirm.png', fullPage: true });
    const ordered = buyer.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await buyer.getByRole('button', { name: '注文を確定する', exact: true }).click();
    const response = await ordered;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON().paymentMethod).toBe('PAY_AT_STORE');
    const { orders: [order], payment } = await response.json();
    expect(payment).toBeNull();
    expect([order.status, order.details.paymentMethod, order.paymentStatus]).toEqual(['ACCEPTED', 'PAY_AT_STORE', null]);
    await expect(buyer.getByTestId('order-payment')).toContainText('店舗でお支払い');
    const changedPayment = { ...response.request().postDataJSON(), paymentMethod: 'CARD' };
    expect((await call(buyer.request, '/orders', 'POST', changedPayment)).status()).toBe(409);
    const stock = () =>
      call(buyer.request, '/products?storeId=1')
        .then((r) => r.json())
        .then((ps) => ps.find((p) => p.id === product.id).stock);
    expect(await stock()).toBe(4);
    const replay = await call(buyer.request, '/orders', 'POST', response.request().postDataJSON());
    expect((await replay.json()).orders[0].id).toBe(order.id);
    expect(await stock()).toBe(4);
    expect((await call(buyer.request, '/cart').then((r) => r.json())).itemCount).toBe(0);
    await login(buyer, 'test.user@example.com');
    await buyer.goto(`${ec}/purchases`);
    await expect(buyer.getByTestId(`order-${order.id}`)).toContainText(input.name);
    await seller.goto(`${ec}/seller/orders`);
    const received = seller.getByTestId(`order-${order.id}`);
    // EC-S09/S10: each status change is confirmed before it is saved.
    await received.getByRole('button', { name: '受取準備完了にする' }).click();
    await seller.getByRole('alertdialog').getByRole('button', { name: '受取準備完了を確定', exact: true }).click();
    await expect(received).toContainText('注文状態：受取準備完了');
    await received.getByRole('button', { name: '引き渡し完了にする' }).click();
    await seller.getByRole('alertdialog').getByRole('button', { name: '引き渡し完了を確定', exact: true }).click();
    await expect(received).toContainText('注文状態：引き渡し完了');
    await seller.reload();
    await expect(received).toContainText('引き渡し完了');
    await buyer.goto(`${ec}/notifications`);
    await buyer.getByRole('button', { name: '既読にする' }).first().click();
    await buyer.reload();
    await expect(buyer.getByText('既読', { exact: true }).first()).toBeVisible();
    await buyer.goto(`${ec}/purchases`);
    await buyer.screenshot({ path: 'artifacts/business/purchases-reloaded.png', fullPage: true });
    await seller.screenshot({ path: 'artifacts/business/seller-orders-reloaded.png', fullPage: true });
    const persistedOrder = await call(buyer.request, `/orders/${order.id}`).then((r) => r.json());
    expect(persistedOrder.details.paymentMethod).toBe('PAY_AT_STORE');
    await writeFile(
      'artifacts/business/flow.json',
      JSON.stringify({ order: persistedOrder, garden, stock: await stock() }, null, 2),
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
    // Issue #108: shop accounts cannot buy, so the operator is the second buyer in the race.
    const carts = await Promise.all([add(buyer.request, product.id), add(admin.request, product.id)]);
    const results = await Promise.all(
      [buyer, admin].map((p, i) =>
        call(p.request, '/orders', 'POST', {
          requestId: randomUUID(),
          revision: carts[i].revision,
          expectedTotalYen: carts[i].totalYen,
          paymentMethod: 'PAY_AT_STORE',
        }),
      ),
    );
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
    const winning = results[0].ok() ? buyer : admin;
    const losing = winning === buyer ? admin : buyer;
    const [order] = (await results.find((r) => r.ok()).json()).orders;
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
    // Only an account from the business sign-up applies; the fixture marks the shared buyer as one.
    prepareMember(member, 'SHOP_OWNER_APPLICANT');
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    await user.goto(`${ec}/seller/application`);
    await fillApplication(user, {
      company: `検証店舗 ${randomUUID().slice(0, 8)}`,
      contact: '担当者',
      email: 'test.user@example.com',
      address: '東京都 検証用店舗',
      phone: '0312345678',
    });
    const submission = user.waitForResponse(
      (r) => r.url().endsWith('/api/account/store-applications') && r.request().method() === 'POST',
    );
    await user.getByRole('button', { name: '申請する', exact: true }).click();
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
    // The approval creates the organization; the owner then opens a store without another review.
    expect(me).toMatchObject({ accountType: 'SHOP_OWNER', storeIds: [] });
    const storeId = await openStore(user.request, application.company);
    await user.goto(`${ec}/seller/profile`);
    await user.getByLabel('店舗紹介').fill('保存した店舗紹介');
    await user.getByRole('button', { name: '店舗情報を保存' }).click();
    await expect(user.getByRole('status')).toContainText('保存しました');
    await user.goto(`${ec}/store/${storeId}`);
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
    // Issue #108: the new owner is a shop account, so the buyer APIs refuse it; a disabled account is refused anywhere.
    const disabled = await call(user.request, '/notifications');
    expect(disabled.status()).toBe(403);
    expect((await disabled.json()).code).toBe('ACCOUNT_DISABLED');
    expect(
      (await call(admin.request, `/operator/members/${member.id}/enabled`, 'PUT', { enabled: true })).status(),
    ).toBe(200);
    await login(user, 'test.user@example.com');
    expect((await call(user.request, '/notifications')).status()).toBe(200);
    expect((await call(user.request, '/orders').then((r) => r.json())).code).toBe('BUYER_REQUIRED');
    // Withdrawal is verified with dedicated accounts in business-account.spec.js: this shared buyer keeps
    // open orders from other specs, which now correctly block withdrawal (EC-B21 7a).
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
          currentPassword: account.secret,
          newPassword: changed,
          confirmPassword: `${changed}x`,
        })
      ).status(),
    ).toBe(400);
    const wrong = await call(page.request, '/account/password', 'PUT', {
      currentPassword: 'Incorrect-Password-123!',
      newPassword: changed,
      confirmPassword: changed,
    });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).message).toBe('現在のパスワードが正しくありません。');
    expect((await call(page.request, '/auth/me').then((r) => r.json())).authenticated).toBe(true);
    // EC-B19 through the screen: confirmation mismatch is caught before sending; success lands on the login page.
    await page.goto(`${ec}/account/password`);
    await page.getByLabel('現在のパスワード', { exact: true }).fill(account.secret);
    await page.getByLabel('新しいパスワード（8文字以上）', { exact: true }).fill(changed);
    await page.getByLabel('確認用パスワード', { exact: true }).fill(`${changed}x`);
    await page.getByRole('button', { name: 'パスワードを変更', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('新しいパスワードと確認用パスワードが一致しません。');
    await page.getByLabel('確認用パスワード', { exact: true }).fill(changed);
    const change = page.waitForResponse((r) => r.url().endsWith('/api/account/password'));
    await page.getByRole('button', { name: 'パスワードを変更', exact: true }).click();
    expect((await change).status()).toBe(200);
    await expect(page).toHaveURL(`${ec}/account/login`);
    await expect(page.getByRole('status')).toHaveText(
      'パスワードを変更しました。新しいパスワードでログインしてください。',
    );
    await page.reload();
    await expect(page.getByText('パスワードを変更しました', { exact: false })).toHaveCount(0);
    await mkdir('artifacts/business', { recursive: true });
    await page.screenshot({ path: 'artifacts/business/password-changed-login.png' });
    await login(page, account.email, changed);
    expect((await call(page.request, '/auth/me').then((r) => r.json())).authenticated).toBe(true);
  } finally {
    deletePasswordTestAccount(account.email);
  }
});
