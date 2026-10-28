import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ec,
  call,
  login,
  prepareMember,
  productInput,
  add,
  checkout,
  createPasswordTestAccount,
  deletePasswordTestAccount,
} from './business-helpers.js';
import { sql } from './database.js';

test.use({ trace: 'off' });

// Withdrawal blocks the account for good, so each run uses two dedicated Cognito accounts and a new store.
async function submitApplication(request, company) {
  const csrf = await call(request, '/auth/csrf').then((r) => r.json());
  const response = await request.post(`${ec}/api/account/store-applications`, {
    headers: { [csrf.headerName]: csrf.token },
    multipart: {
      application: {
        name: 'application.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            company,
            contact: '退会検証',
            email: 'test.seller@example.com',
            address: '東京都 退会検証',
            phone: '0312345678',
            plan: 'STANDARD',
          }),
        ),
      },
      document: { name: 'verification.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test('EC-B21 withdrawal is refused while purchases, listings or store orders are open', async ({ browser }) => {
  const buyerAccount = createPasswordTestAccount();
  const sellerAccount = createPasswordTestAccount();
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [buyer, seller, admin] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    const buyerMember = await login(buyer, buyerAccount.email, buyerAccount.secret);
    const sellerMember = await login(seller, sellerAccount.email, sellerAccount.secret);
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    // A dedicated store: an approved application makes the second account its seller.
    const application = await submitApplication(seller.request, `退会検証店舗 ${randomUUID().slice(0, 8)}`);
    const approved = await call(admin.request, `/operator/applications/${application.id}`, 'PUT', {
      approved: true,
      reason: '',
    });
    expect(approved.status(), await approved.text()).toBe(200);
    const storeId = (await call(seller.request, '/auth/me').then((r) => r.json())).storeIds[0];
    expect(storeId).toBeTruthy();
    const created = await call(seller.request, '/products', 'POST', { ...productInput(), storeId });
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();
    const cart = await call(buyer.request, '/cart').then((r) => r.json());
    expect((await call(buyer.request, '/cart/store', 'PUT', { storeId, revision: cart.revision })).status()).toBe(200);
    await add(buyer.request, product.id);
    const { order } = await checkout(buyer.request);

    // 3a / 4 / 4a: the delete button follows the consent checkbox, and 戻る leaves without deleting.
    await buyer.goto(`${ec}/account`);
    await buyer.locator('.workspace-sidebar').getByRole('link', { name: '退会', exact: true }).click();
    const consent = buyer.getByLabel('注意事項を確認し、退会することに同意します', { exact: true });
    const remove = buyer.getByRole('button', { name: 'アカウントを削除する', exact: true });
    await expect(consent).not.toBeChecked();
    await expect(remove).toBeDisabled();
    await consent.check();
    await expect(remove).toBeEnabled();
    await consent.uncheck();
    await expect(remove).toBeDisabled();
    await buyer.getByRole('button', { name: '戻る', exact: true }).click();
    await expect(buyer).toHaveURL(`${ec}/account`);

    // 7a: the buyer's order is still waiting for pickup.
    await buyer.goto(`${ec}/account/delete`);
    await consent.check();
    await remove.click();
    const buyerAlert = buyer.getByRole('alert');
    await expect(buyerAlert).toContainText('受け渡しが完了していない注文があるため退会できません。');
    await expect(buyerAlert).toContainText(`注文番号 ${order.id}（注文受付）`);
    await expect(buyerAlert.getByRole('link', { name: '注文履歴を確認する', exact: true })).toHaveAttribute(
      'href',
      '/purchases',
    );
    expect((await call(buyer.request, '/auth/me').then((r) => r.json())).authenticated).toBe(true);

    // 8a: the seller still lists a product.
    await seller.goto(`${ec}/account/delete`);
    const sellerConsent = seller.getByLabel('注意事項を確認し、退会することに同意します', { exact: true });
    const sellerRemove = seller.getByRole('button', { name: 'アカウントを削除する', exact: true });
    await sellerConsent.check();
    await sellerRemove.click();
    const sellerAlert = seller.getByRole('alert');
    await expect(sellerAlert).toContainText(
      '出品中の商品があるため退会できません。すべての商品を販売停止にしてから再度お試しください。',
    );
    await expect(sellerAlert.getByRole('link', { name: '商品一覧を確認する', exact: true })).toHaveAttribute(
      'href',
      '/seller/products',
    );

    // 8b: with the product hidden, the store's open order still blocks withdrawal.
    const hidden = await call(seller.request, '/seller/products/status', 'PATCH', {
      storeId,
      productIds: [product.id],
      status: 'HIDDEN',
    });
    expect(hidden.status(), await hidden.text()).toBe(200);
    await sellerRemove.click();
    await expect(sellerAlert).toContainText(
      '引き渡しが完了していない注文、または処理していないキャンセル申請があるため退会できません。',
    );
    await expect(
      sellerAlert.getByRole('link', { name: '注文一覧・キャンセル申請を確認する', exact: true }),
    ).toHaveAttribute('href', '/seller/orders');
    expect(sql(`SELECT enabled FROM auth_members WHERE id='${sellerMember.id}'`)).toBe('1');

    // After pickup is completed both accounts can withdraw; the accounts are disabled and the order is kept.
    for (const [expectedStatus, status] of [
      ['ACCEPTED', 'READY'],
      ['READY', 'COMPLETED'],
    ]) {
      const changed = await call(seller.request, `/seller/orders/${order.id}/status`, 'PUT', {
        expectedStatus,
        status,
      });
      expect(changed.status(), await changed.text()).toBe(200);
    }
    await sellerRemove.click();
    await expect(seller).toHaveURL(`${ec}/`);
    await expect(
      seller.getByText('退会が完了しました。ご利用ありがとうございました。', { exact: false }),
    ).toBeVisible();
    await buyer.reload();
    await consent.check();
    await remove.click();
    await expect(buyer).toHaveURL(`${ec}/`);
    await expect(buyer.getByText('退会が完了しました。ご利用ありがとうございました。', { exact: false })).toBeVisible();
    await buyer.reload();
    await expect(buyer.getByText('退会が完了しました', { exact: false })).toHaveCount(0);
    await mkdir('artifacts/business', { recursive: true });
    await buyer.screenshot({ path: 'artifacts/business/withdrawn-reloaded.png' });
    expect((await call(buyer.request, '/orders')).status()).toBe(401);
    const saved = {
      buyer: sql(`SELECT enabled, withdrawn_at IS NOT NULL FROM auth_members WHERE id='${buyerMember.id}'`),
      seller: sql(`SELECT enabled, withdrawn_at IS NOT NULL FROM auth_members WHERE id='${sellerMember.id}'`),
      order: await call(admin.request, '/operator/orders')
        .then((r) => r.json())
        .then((orders) => orders.find((o) => o.id === order.id)),
    };
    expect(saved.buyer).toBe('0\t1');
    expect(saved.seller).toBe('0\t1');
    expect(saved.order.status).toBe('COMPLETED');
    await writeFile('artifacts/business/withdrawal.json', JSON.stringify(saved, null, 2));
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    deletePasswordTestAccount(buyerAccount.email);
    deletePasswordTestAccount(sellerAccount.email);
  }
});
