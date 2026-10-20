import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { ec, call, login, prepareMember } from './business-helpers.js';

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
    async function submit() {
      const csrf = await call(user.request, '/auth/csrf').then((r) => r.json());
      return user.request.post(`${ec}/api/account/store-applications`, {
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
