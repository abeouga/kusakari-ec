import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sql } from './database.js';

export const ec = process.env.KUSAKARI_ACCEPTANCE_LIVE === 'true' ? 'http://127.0.0.1:5186' : 'http://127.0.0.1:15286';
export const canvas =
  process.env.KUSAKARI_ACCEPTANCE_LIVE === 'true' ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:15273';
const accountFile = readFileSync(new URL('../../kusakari-terraform/.env.test-accounts', import.meta.url), 'utf8');
export const password = accountFile
  .match(/^KUSAKARI_TEST_PASSWORD=(.+)$/m)?.[1]
  .trim()
  .replace(/^["']|["']$/g, '');
if (!password) throw new Error('Test credentials are not configured.');

export async function call(request, path, method = 'GET', data, origin = ec) {
  const headers = {};
  if (method !== 'GET') {
    const csrf = await request.get(`${ec}/api/auth/csrf`).then((r) => r.json());
    headers[csrf.headerName] = csrf.token;
  }
  return request.fetch(`${origin}/api${path}`, { method, data, headers });
}

export async function login(page, email, secret = password) {
  const session = await page.request.get(`${ec}/api/auth/me`).then((r) => r.json());
  if (session.authenticated) expect((await call(page.request, '/auth/logout', 'POST')).status()).toBe(200);
  await page.goto(`${ec}/account/login`);
  await page.getByLabel('メールアドレス', { exact: true }).fill(email);
  await page.getByLabel('パスワード', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(`${ec}/`);
  return page.request.get(`${ec}/api/auth/me`).then((r) => r.json());
}

// PR screenshots: wait for the page data, show the top of the page (or the given element), and hide email addresses.
export async function capture(page, path, target) {
  await expect(page.locator('.workspace-main [role=status]').filter({ hasText: '読み込んでいます。' })).toHaveCount(0);
  // The site scrolls smoothly; jump instantly so the shot is not taken mid-scroll.
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  if (target) await target.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.screenshot({ path, mask: [page.locator('.workspace-main').getByText(/@/)], maskColor: '#d9ded6' });
}

// 'SELLER' is the fixture for a shop account that runs sample store 1: a staff account with the MANAGER role there.
// 'SHOP_OWNER' takes over the sample organization (id 1), which has no owner after a database reset.
const accountTypes = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SHOP_OWNER_APPLICANT: 'SHOP_OWNER_APPLICANT',
  SHOP_OWNER: 'SHOP_OWNER',
  SELLER: 'SHOP_STAFF',
};

export function prepareMember(member, role) {
  if (process.env.KUSAKARI_ACCEPTANCE_LIVE === 'true')
    throw new Error('Fixtures cannot change the development database.');
  if (!/^[a-f0-9-]{36}$/.test(member.id) || !Object.hasOwn(accountTypes, role)) throw new Error('Invalid fixture.');
  const id = member.id;
  // The foreign keys accept an owner only as SHOP_OWNER and a staff row only as SHOP_STAFF,
  // so the old ties go first and the new ones are added after the account type changes.
  const ties = {
    SELLER: `INSERT INTO organization_members(organization_id,member_id) VALUES(1,'${id}');
       INSERT INTO store_members(store_id,member_id,organization_id,role) VALUES(1,'${id}',1,'MANAGER');`,
    // A new owner starts without the previous owner's succession request (#203).
    SHOP_OWNER: `UPDATE organizations SET owner_member_id='${id}',pending_owner_member_id=NULL,pending_owner_expires_at=NULL
       WHERE id=1;`,
    // An applicant starts without an application; an approved one would refuse a new application.
    SHOP_OWNER_APPLICANT: `DELETE FROM organization_applications WHERE applicant_member_id='${id}';`,
  };
  // The owner's succession request leaves with the owner, and a successor's request with the successor (#203).
  sql(`UPDATE organizations SET owner_member_id=NULL,pending_owner_member_id=NULL,pending_owner_expires_at=NULL
        WHERE owner_member_id='${id}';
       UPDATE organizations SET pending_owner_member_id=NULL,pending_owner_expires_at=NULL
        WHERE pending_owner_member_id='${id}';
       DELETE FROM organization_members WHERE member_id='${id}';
       UPDATE members SET account_type='${accountTypes[role]}',enabled=TRUE,withdrawn_at=NULL WHERE id='${id}';
       ${ties[role] || ''}
       DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE member_id='${id}');`);
}

/**
 * Issue #111: a staff account of the sample organization with the given store roles ('NONE' = member without a role).
 * @param {{id:string}} member @param {Record<number,'MANAGER'|'STAFF'|'NONE'>} stores @param {boolean} [organizationAdmin]
 */
export function prepareStaff(member, stores, organizationAdmin = false) {
  prepareMember(member, 'USER');
  const rows = Object.entries(stores).map(([store, role]) => {
    if (![1, 2, 3].includes(Number(store)) || !['MANAGER', 'STAFF', 'NONE'].includes(role))
      throw new Error('Invalid fixture.');
    return `(${Number(store)},'${member.id}',1,${role === 'NONE' ? 'NULL' : `'${role}'`})`;
  });
  sql(`UPDATE members SET account_type='SHOP_STAFF' WHERE id='${member.id}';
       INSERT INTO organization_members(organization_id,member_id,role) VALUES(1,'${member.id}',${organizationAdmin ? "'ORG_ADMIN'" : 'NULL'});
       ${rows.length ? `INSERT INTO store_members(store_id,member_id,organization_id,role) VALUES ${rows.join(',')};` : ''}`);
}

/**
 * A staff member of the sample organization that never signs in (no Cognito account), owned by the calling test
 * (#203, #205). The row is kept for audit; the test disables it when it ends.
 * @param {string} name
 */
export function createFixtureStaff(name) {
  if (process.env.KUSAKARI_ACCEPTANCE_LIVE === 'true')
    throw new Error('Fixtures cannot change the development database.');
  const id = randomUUID();
  const member = { id, email: `succession-${id}@example.com` };
  sql(`INSERT INTO members(id,issuer,subject,email,display_name,account_type,enabled)
    VALUES('${id}','e2e-fixture','${id}','${member.email}','${name}','USER',TRUE);`);
  prepareStaff(member, { 1: 'STAFF' });
  return member;
}

/**
 * A member's owner-succession result notices, oldest first, as `title|body` (#203). All of them are personal.
 * @param {{id:string}} member
 */
export function successionResults(member) {
  const rows = sql(`SELECT CONCAT_WS('|', kind, IFNULL(store_id,'NULL'), title, body) FROM notifications
                     WHERE member_id='${member.id}' AND category='OWNER_SUCCESSION_RESULT' ORDER BY created_at, id;`);
  const notices = rows ? rows.split(/\r?\n/) : [];
  for (const notice of notices) expect(notice.startsWith('PERSONAL|NULL|')).toBe(true);
  return notices.map((notice) => notice.slice('PERSONAL|NULL|'.length));
}

/**
 * The deadline of an organization's pending request (the sample organization by default), in Japan time to the minute
 * as the notices write it.
 * @param {number} [organizationId]
 */
export const pendingDeadline = (organizationId = 1) =>
  sql(`SET time_zone='+09:00';
       SELECT DATE_FORMAT(pending_owner_expires_at,'%Y/%m/%d %H:%i') FROM organizations WHERE id=${Number(organizationId)};`);

/**
 * The result notices that the owner and the successor receive when a request of an organization (the sample
 * organization by default) ends without approval (#203, #200 の決めること 1), as `[the owner's, the successor's]` in
 * the form of successionResults. Each says why the request ended; the expired one gives its deadline (pendingDeadline,
 * read before it was invalidated). 'expelled', 'disabled' and 'withdrawn' are the successor's; 'owner-disabled' and
 * 'owner-withdrawn' are the owner's who made the request (#205).
 * @param {'refused'|'cancelled'|'expired'|'expelled'|'disabled'|'withdrawn'|'owner-disabled'|'owner-withdrawn'} ending
 * @param {{owner:string, successor:string, deadline?:string}} names the display names of the owner and the successor
 * @param {number} [organizationId]
 */
export function endingNotices(ending, { owner, successor, deadline }, organizationId = 1) {
  const request = `${sql(`SELECT name FROM organizations WHERE id=${Number(organizationId)};`)}のオーナーの譲渡の申し出`;
  const unchanged = 'オーナーは交代していません。';
  if (ending === 'refused') {
    const title = 'オーナーの譲渡の申し出が断られました';
    return [
      `${title}|${successor}さんが、あなたからの${request}を断りました。${unchanged}`,
      `${title}|${owner}さんからの${request}を断りました。${unchanged}`,
    ];
  }
  if (ending === 'cancelled') {
    const title = 'オーナーの譲渡の申し出が取り消されました';
    return [
      `${title}|${successor}さんへの${request}を取り消しました。${unchanged}`,
      `${title}|${owner}さんが、あなたへの${request}を取り消しました。${unchanged}`,
    ];
  }
  /** @param {string} successorCalled @param {string} ownerCalled the successor and the owner, as the reader calls them */
  const why = (successorCalled, ownerCalled) =>
    ({
      expired: `承認の期限（${deadline}）が過ぎたため`,
      expelled: `${successorCalled}が組織から除名されたため`,
      disabled: `${successorCalled}の利用が運営に停止されたため`,
      withdrawn: `${successorCalled}が退会したため`,
      'owner-disabled': `${ownerCalled}の利用が運営に停止されたため`,
      'owner-withdrawn': `${ownerCalled}が退会したため`,
    })[ending];
  const title = 'オーナーの譲渡の申し出が無効になりました';
  return [
    `${title}|${why('譲渡先', 'あなた')}、${successor}さんへの${request}は無効になりました。${unchanged}`,
    `${title}|${why('あなた', 'オーナー')}、${owner}さんからの${request}は無効になりました。${unchanged}`,
  ];
}

/**
 * Gives test accounts display names without an e-mail address, so the names in notices stay readable in the masked
 * screenshots (a new Cognito account is named after its address).
 * @param {Record<string,{id:string}>} named the accounts by their new names
 */
export function rename(named) {
  if (process.env.KUSAKARI_ACCEPTANCE_LIVE === 'true')
    throw new Error('Fixtures cannot change the development database.');
  for (const [name, member] of Object.entries(named)) {
    if (!/^[a-f0-9-]{36}$/.test(member.id) || /['\\]/.test(name)) throw new Error('Invalid fixture.');
    sql(`UPDATE members SET display_name='${name}' WHERE id='${member.id}';`);
  }
}

/**
 * An owner adds a store without an application; a new store is unpublished, so buyers see it only after this.
 * @param {import('@playwright/test').APIRequestContext} request the owner's session
 * @param {string} name
 */
export async function openStore(request, name) {
  const created = await call(request, '/seller/stores', 'POST', {
    revision: 0,
    name,
    contact: '',
    email: '',
    address: '東京都 検証用店舗',
    hours: '10:00-18:00',
    story: '',
  });
  expect(created.status(), await created.text()).toBe(201);
  const store = await created.json();
  const published = await call(request, `/seller/stores/${store.id}/published`, 'PUT', { published: true });
  expect(published.status(), await published.text()).toBe(200);
  return store.id;
}

export function productInput() {
  const suffix = randomUUID().slice(0, 8);
  return {
    storeId: 1,
    sku: `BUSINESS-${suffix}`,
    name: `確認用オリーブ ${suffix}`,
    latinName: '',
    category: '庭木',
    description: '実APIと専用MySQLによる業務フロー検証の商品です。',
    sizeLabel: '',
    care: '',
    priceYen: 2000,
    stock: 5,
    imageUrl: '/images/olive.png',
    badge: '',
    nurseryName: '',
    nurseryAddress: '',
    sunlight: '日なた',
    useCase: '',
    careLevel: 1,
    minTemperatureC: null,
    heatTolerant: false,
    droughtTolerant: false,
    ageYears: null,
    heightCm: 250,
    potDiameterCm: null,
    familyName: '',
    images: [],
    plantModelProfile: {
      botanicalForm: null,
      plantType: 'tree',
      heightCm: 250,
      widthCm: 140,
      crownShape: 'round',
      branchCount: 12,
      branchAngle: 45,
      trunkThicknessCm: 8,
      leafShape: 'oval',
      leafSizeCm: 12,
      leafDensity: 'medium',
      leafColor: '#4f793b',
      flowerEnabled: false,
      flowerShape: 'five',
      flowerSizeCm: 10,
      flowerColor: '#df7799',
      seed: 12345,
    },
  };
}

export async function add(request, productId, quantity = 1) {
  const opened = await call(request, '/cart');
  expect(opened.status(), await opened.text()).toBe(200);
  const cart = await opened.json();
  const result = await call(request, `/cart/items/${productId}`, 'PUT', { quantity, revision: cart.revision });
  expect(result.status(), await result.text()).toBe(200);
  return result.json();
}

export async function checkout(request) {
  const cart = await call(request, '/cart').then((r) => r.json());
  const payload = {
    requestId: randomUUID(),
    revision: cart.revision,
    expectedTotalYen: cart.totalYen,
    paymentMethod: 'PAY_AT_STORE',
  };
  const response = await call(request, '/orders', 'POST', payload);
  expect(response.status(), await response.text()).toBe(200);
  // One order per pickup store (issue #70); callers that buy from a single store use `order`.
  const { orders } = await response.json();
  return { order: orders[0], orders, payload };
}

/**
 * Confirmed photo covering the whole garden: Canvas shows the 3D garden and places items only in gardens with a photo
 * (Canvas issue #15). The photo is a plain image drawn in the page; no external image is used.
 * @param {import('@playwright/test').Page} page signed in as the garden's owner
 * @param {any} garden the saved garden document
 */
export async function seedGardenPhoto(page, garden) {
  if (!/^https?:\/\/127\.0\.0\.1:/.test(page.url())) await page.goto(`${ec}/`);
  const dataUrl = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 600;
    image.height = 400;
    const drawing = image.getContext('2d');
    drawing.fillStyle = '#b8ccb2';
    drawing.fillRect(0, 0, 600, 400);
    return image.toDataURL('image/png');
  });
  const corners = [
    { x: 0.1, y: 0.9 },
    { x: 0.9, y: 0.9 },
    { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.1 },
  ];
  const photo = { dataUrl, imageWidth: 600, imageHeight: 400, corners, boundary: corners };
  const saved = await call(page.request, `/gardens/${garden.id}`, 'PUT', { ...garden, photo }, canvas);
  expect(saved.status(), await saved.text()).toBe(200);
  return saved.json();
}

// Isolate password changes from the shared buyer/seller/administrator accounts.
function cognitoAccount(action, payload) {
  const python = fileURLToPath(new URL('../../kusakari-canvas/backend/.venv/Scripts/python.exe', import.meta.url));
  const result = spawnSync(
    python,
    [
      '-c',
      `
import sys, json
sys.path.insert(0, 'scripts')
from manage_accounts import environment, aws
from urllib.parse import urlparse
issuer = environment('.env')['KUSAKARI_COGNITO_ISSUER']
request = json.load(sys.stdin)
aws(request['action'], {'UserPoolId': issuer.rsplit('/', 1)[1], **request['payload']},
    urlparse(issuer).hostname.split('.')[1])
`,
    ],
    {
      input: JSON.stringify({ action, payload }),
      encoding: 'utf8',
      env: { ...process.env, PYTHONUTF8: '1', AWS_PROFILE: process.env.AWS_PROFILE || 'kusakari-dev' },
    },
  );
  if (result.status !== 0) throw new Error('Cognito test-account management failed: ' + action);
}

export function createPasswordTestAccount() {
  const email = `password-${randomUUID()}@example.com`;
  const secret = `Aa9!${randomUUID()}`;
  cognitoAccount('admin-create-user', {
    Username: email,
    MessageAction: 'SUPPRESS',
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
  });
  try {
    cognitoAccount('admin-set-user-password', { Username: email, Password: secret, Permanent: true });
  } catch (error) {
    deletePasswordTestAccount(email);
    throw error;
  }
  return { email, secret };
}

/**
 * Issue #111: an account registered through the real sign-up (SignUp) has an unconfirmed address. The test cannot
 * read the code sent to example.com, so the administrator API confirms it, as the code would.
 * @param {string} email
 */
export function confirmSignUpTestAccount(email) {
  if (!/^password-[a-f0-9-]{36}@example\.com$/.test(email)) throw new Error('Not an isolated password-test account.');
  cognitoAccount('admin-confirm-sign-up', { Username: email });
  cognitoAccount('admin-update-user-attributes', {
    Username: email,
    UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
  });
}

export function deletePasswordTestAccount(email) {
  if (!/^password-[a-f0-9-]{36}@example\.com$/.test(email)) throw new Error('Not an isolated password-test account.');
  cognitoAccount('admin-delete-user', { Username: email });
  // Retain dedicated-DB records for audit; never delete carts or orders here.
  sql(`UPDATE members SET enabled=FALSE WHERE email='${email}'`);
}

const applicationPdf = { name: 'application.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') };

/**
 * Walks the EC-B17 application wizard (issue #20) to its confirmation step.
 * @param {import('@playwright/test').Page} page
 * @param {{company:string,contact:string,email:string,address:string,phone:string}} input
 * @param {{file?:any}} [options]
 */
export async function fillApplication(page, input, { file = applicationPdf } = {}) {
  const next = () => page.getByRole('button', { name: '次へ', exact: true }).click();
  await page.getByLabel('会社・事業者名', { exact: true }).fill(input.company);
  await page.getByLabel('所在地', { exact: true }).fill(input.address);
  await next();
  await page.getByLabel('担当者名', { exact: true }).fill(input.contact);
  await page.getByLabel('連絡先メール', { exact: true }).fill(input.email);
  await page.getByLabel('電話番号', { exact: true }).fill(input.phone);
  await next();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '確認画面へ', exact: true }).click();
  return page.getByRole('region', { name: '入力内容の確認' });
}
