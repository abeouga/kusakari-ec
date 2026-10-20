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
  window.location.assign(`/api/auth/login?signup=${signup}&returnTo=${encodeURIComponent(window.location.href.split('#')[0])}`);
}

export async function logout() {
  const response = await authFetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('ログアウトできませんでした。');
  const result = await response.json();
  window.location.assign(result.logoutUrl);
}
