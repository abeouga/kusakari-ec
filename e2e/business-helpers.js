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

export function prepareMember(member, role) {
  if (process.env.KUSAKARI_ACCEPTANCE_LIVE === 'true')
    throw new Error('Fixtures cannot change the development database.');
  if (!/^[a-f0-9-]{36}$/.test(member.id) || !['USER', 'SELLER', 'ADMIN'].includes(role))
    throw new Error('Invalid fixture.');
  sql(`UPDATE auth_members SET role='${role}',store_id=${role === 'SELLER' ? 1 : 'NULL'},enabled=TRUE,withdrawn_at=NULL WHERE id='${member.id}';
       UPDATE carts SET member_id=NULL WHERE member_id='${member.id}';`);
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
  const cart = await call(request, '/cart').then((r) => r.json());
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
  return { order: await response.json(), payload };
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

export function deletePasswordTestAccount(email) {
  if (!/^password-[a-f0-9-]{36}@example\.com$/.test(email)) throw new Error('Not an isolated password-test account.');
  cognitoAccount('admin-delete-user', { Username: email });
  // Retain dedicated-DB records for audit; never delete carts or orders here.
  sql(`UPDATE auth_members SET enabled=FALSE WHERE email='${email}'`);
}
