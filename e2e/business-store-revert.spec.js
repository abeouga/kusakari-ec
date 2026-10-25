import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { sql } from './database.js';
import { call, ec, login, prepareMember, productInput } from './business-helpers.js';

const python =
  process.env.KUSAKARI_CANVAS_PYTHON ||
  new URL('../../kusakari-canvas/backend/.venv/Scripts/python.exe', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

function revert(email, apply, backup) {
  const args = [
    'scripts/revert_store_approval.py',
    '--env-file',
    '.env',
    '--database',
    'kusakari_e2e',
    '--canvas-env-file',
    '../kusakari-canvas/.env.e2e',
    '--canvas-database',
    'kusakari_canvas_e2e',
    '--member',
    email,
    ...(apply ? ['--apply', '--backup', backup] : []),
  ];
  const result = spawnSync(python, args, { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  return { status: result.status, output: result.stdout ? JSON.parse(result.stdout) : null, error: result.stderr };
}

async function selectStore(request, storeId) {
  const cart = await call(request, '/cart').then((r) => r.json());
  const response = await call(request, '/cart/store', 'PUT', { storeId, revision: cart.revision });
  expect(response.status(), await response.text()).toBe(200);
}

test('reverting an approved store application restores the applicant and removes what the approval created', async ({
  browser,
}) => {
  const userContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const user = await userContext.newPage();
  const admin = await adminContext.newPage();
  const email = 'test.user@example.com';
  let member;
  try {
    member = await login(user, email);
    prepareMember(member, 'USER');
    sql(`UPDATE store_applications SET status='REJECTED' WHERE member_id='${member.id}' AND status='PENDING';`);
    prepareMember(await login(admin, 'test.admin@example.com'), 'ADMIN');
    const company = `取消検証店舗 ${randomUUID().slice(0, 8)}`;

    await user.goto(`${ec}/seller/application`);
    await user.getByLabel('会社・事業者名').fill(company);
    await user.getByLabel('担当者名').fill('担当者');
    await user.getByLabel('連絡先メール').fill(email);
    await user.getByLabel('所在地').fill('東京都 取消検証用店舗');
    await user.getByLabel('電話番号').fill('0312345678');
    await user
      .locator('input[type=file]')
      .setInputFiles({ name: 'application.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\\n%%EOF') });
    const submission = user.waitForResponse(
      (r) => r.url().endsWith('/api/account/store-applications') && r.request().method() === 'POST',
    );
    await user.getByRole('button', { name: '出店を申請', exact: true }).click();
    const application = await (await submission).json();
    await admin.goto(`${ec}/operator/applications`);
    const row = admin.locator('section').filter({ has: admin.getByRole('heading', { name: company, exact: true }) });
    const approval = admin.waitForResponse(
      (r) => r.url().endsWith(`/api/operator/applications/${application.id}`) && r.request().method() === 'PUT',
    );
    await row.getByRole('button', { name: '承認', exact: true }).click();
    expect((await approval).status()).toBe(200);
    const seller = await call(user.request, '/auth/me').then((r) => r.json());
    expect(seller.role).toBe('SELLER');
    const storeId = seller.storeIds[0];

    // What a new seller typically adds: an uploaded image and a product stocked at the new store.
    const csrf = await user.request.get(`${ec}/api/auth/csrf`).then((r) => r.json());
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = await user.request.post(`${ec}/api/product-images`, {
      headers: { [csrf.headerName]: csrf.token },
      multipart: { file: { name: 'product.png', mimeType: 'image/png', buffer: png } },
    });
    expect(upload.status(), await upload.text()).toBe(200);
    const { imageUrl } = await upload.json();
    const created = await call(user.request, '/products', 'POST', { ...productInput(), storeId, imageUrl });
    expect(created.status(), await created.text()).toBe(200);
    const product = await created.json();

    // Another member's cart at the store blocks the revert and leaves every row in place.
    await selectStore(admin.request, storeId);
    const blocked = revert(email, true, `artifacts/business/revert-blocked-${randomUUID()}.json`);
    expect(blocked.status, blocked.error).toBe(2);
    expect(blocked.output.blockers).toEqual(['carts use the store: 1']);
    expect((await call(user.request, '/auth/me').then((r) => r.json())).role).toBe('SELLER');
    await selectStore(admin.request, 1);

    const preview = revert(email, false);
    expect(preview.status, preview.error).toBe(0);
    expect(preview.output).toMatchObject({
      dryRun: true,
      storeId,
      applications: 1,
      notifications: 2,
      products: [product.name],
      inventoryRows: 1,
      productMedia: 1,
      blockers: [],
    });
    const applied = revert(email, true, `artifacts/business/revert-backup-${randomUUID()}.json`);
    expect(applied.status, applied.error).toBe(0);
    expect(applied.output.applied).toBe(true);

    const restored = await call(user.request, '/auth/me').then((r) => r.json());
    expect(restored).toMatchObject({ role: 'USER', storeIds: [] });
    expect((await call(user.request, `/stores/${storeId}`)).status()).toBe(404);
    expect((await user.request.get(`${ec}${imageUrl}`)).status()).toBe(404);
    expect(sql(`SELECT COUNT(*) FROM products WHERE id='${product.id}'`)).toBe('0');
    const own = await call(user.request, '/account/store-applications').then((r) => r.json());
    expect(own.map((a) => a.id)).not.toContain(application.id);
    const notices = await call(user.request, '/notifications').then((r) => r.json());
    expect(JSON.stringify(notices)).not.toContain(company);
    expect((await call(user.request, '/stores/1')).status()).toBe(200);

    // The applicant is back to the pre-application state: the application form accepts a new request.
    await user.goto(`${ec}/seller/application`);
    await user.reload();
    await expect(user.getByRole('button', { name: '出店を申請', exact: true })).toBeVisible();
    await user.screenshot({ path: 'artifacts/business/store-revert-reloaded.png', fullPage: true });
    writeFileSync('artifacts/business/store-revert-member.json', JSON.stringify(restored, null, 2));
  } finally {
    if (member) prepareMember(member, 'USER');
    await userContext.close();
    await adminContext.close();
  }
});
