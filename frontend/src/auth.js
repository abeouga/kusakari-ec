import { navigate, redirect } from './workspace/navigation';

/**
 * accountType is USER, SHOP_OWNER_APPLICANT, SHOP_OWNER, SHOP_STAFF or ADMIN.
 * storeIds are the stores the account may operate: every store of the owner's organization, or the staff's assigned stores.
 * @typedef {{mode:'demo'|'cognito',authenticated:boolean,id:string|null,email:string|null,name:string|null,accountType:string|null,organizationId:number|null,organizationRole:string|null,storeIds:number[]}} AuthSession
 */

/** Accounts that may open the seller pages: the shop's owner and staff, and the operator. @param {AuthSession|null} session */
export const canSell = (session) =>
  !!session?.authenticated && ['SHOP_OWNER', 'SHOP_STAFF', 'ADMIN'].includes(session.accountType || '');

/**
 * Issue #108: shop accounts (owner and staff) and applicants cannot use the cart, orders or garden shopping lists.
 * Buyers (USER) and the operator (ADMIN) can. @param {AuthSession|null} session
 */
export const isShopAccount = (session) =>
  !!session?.authenticated && ['SHOP_OWNER', 'SHOP_STAFF', 'SHOP_OWNER_APPLICANT'].includes(session.accountType || '');

export const buyerOnlyMessage =
  '店舗・出店申請用のアカウントでは購入できません。購入は購入者のアカウントでご利用ください。';

let signedIn = false;

/** A later 401 means the login expired only if this page had a signed-in session; signed-out visitors just are not logged in. */
export const wasSignedIn = () => signedIn;

/** @returns {Promise<AuthSession>} */
export async function readSession() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('ログイン状態を確認できません。');
  /** @type {AuthSession} */
  const session = await response.json();
  if (session.authenticated) signedIn = true;
  return session;
}

/** @param {string} url @param {RequestInit} [init] */
export async function authFetch(url, init = {}) {
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes((init.method || 'GET').toUpperCase())) {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('操作の確認情報を取得できません。画面を再読み込みしてください。');
    const csrf = await response.json();
    if (csrf.headerName && csrf.token) headers.set(csrf.headerName, csrf.token);
  }
  return fetch(url, { ...init, headers, credentials: 'same-origin' });
}

function loginPath() {
  const returnTo =
    window.location.pathname === '/account/login'
      ? new URLSearchParams(window.location.search).get('returnTo') || '/'
      : window.location.href.split('#')[0];
  return `/account/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function login() {
  navigate(loginPath());
}

/** For pages that cannot be shown signed out: the login page takes their place in the browser history. */
export function redirectToLogin() {
  redirect(loginPath());
}

/** An API failure that keeps the server's error code so the login card can choose its next step. */
export class AuthError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** @param {string} url @param {Record<string,string|boolean|null>} body @param {string} fallback */
async function postAuth(url, body, fallback) {
  const response = await authFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new AuthError(result?.message || fallback, result?.code || '');
  return result;
}

/** @param {string} email @param {string} password @param {string} returnTo */
export async function passwordLogin(email, password, returnTo) {
  const result = await postAuth(
    '/api/auth/login',
    { email, password, returnTo },
    'ログインできませんでした。時間をおいて再試行してください。',
  );
  window.dispatchEvent(new Event('kusakari-auth-changed'));
  return String(result.returnTo);
}

/**
 * Issue #87: Cognito sends a confirmation code to the address; the card then asks for it.
 * A business sign-up creates the account that may apply to open a shop. Issue #111: a store's invitation key
 * creates a staff account of that store (without a role until a manager assigns one).
 * @param {string} email @param {string} password @param {string} confirmPassword @param {boolean} business
 * @param {string|null} [invitationKey]
 */
export async function signUp(email, password, confirmPassword, business, invitationKey = null) {
  await postAuth(
    '/api/auth/signup',
    { email, password, confirmPassword, business, invitationKey },
    '登録できませんでした。時間をおいて再試行してください。',
  );
}

/** @param {string} email @param {string} code */
export async function confirmSignUp(email, code) {
  await postAuth('/api/auth/signup/confirm', { email, code }, '確認できませんでした。時間をおいて再試行してください。');
}

/** @param {string} email */
export async function resendSignUpCode(email) {
  await postAuth('/api/auth/signup/resend', { email }, '確認コードを再送できませんでした。');
}

export async function logout() {
  /** @type {Response} */
  let response;
  try {
    response = await authFetch('/api/auth/logout', { method: 'POST' });
  } catch (reason) {
    // fetch rejects with a browser-language TypeError when the request never reaches the server.
    if (reason instanceof TypeError)
      throw new Error('通信できないためログアウトできませんでした。接続を確認してもう一度お試しください。', {
        cause: reason,
      });
    throw reason;
  }
  if (!response.ok) throw new Error('ログアウトできませんでした。');
  const result = await response.json();
  window.location.assign(result.logoutUrl);
}
