/** @typedef {{mode:'demo'|'cognito',authenticated:boolean,id:string|null,email:string|null,name:string|null,role:string|null,storeIds:number[]}} AuthSession */

/** @returns {Promise<AuthSession>} */
export async function readSession() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('ログイン状態を確認できません。');
  return response.json();
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

/** @param {boolean} [signup] */
export function login(signup = false) {
  const returnTo =
    window.location.pathname === '/account/login'
      ? new URLSearchParams(window.location.search).get('returnTo') || '/'
      : window.location.href.split('#')[0];
  window.location.assign(
    `${signup ? '/api/auth/login?signup=true&' : '/account/login?'}returnTo=${encodeURIComponent(returnTo)}`,
  );
}

/** @param {string} email @param {string} password @param {string} returnTo */
export async function passwordLogin(email, password, returnTo) {
  const response = await authFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnTo }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || 'ログインできませんでした。時間をおいて再試行してください。');
  window.location.replace(result.returnTo);
}

export async function logout() {
  const response = await authFetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('ログアウトできませんでした。');
  const result = await response.json();
  window.location.assign(result.logoutUrl);
}
