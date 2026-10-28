import { useEffect, useState } from 'react';

/** @param {string} path */
export function navigate(path) {
  const previousPath = window.location.pathname + window.location.search + window.location.hash;
  window.history.pushState({ kusakariPreviousPath: previousPath }, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function goBack() {
  const previousPath = window.history.state?.kusakariPreviousPath;
  if (typeof previousPath === 'string' && previousPath.startsWith('/') && !previousPath.startsWith('//')) {
    window.history.back();
    return;
  }
  // 直接開いた画面では、外部サイトへ戻さず購入者トップを表示します。
  navigate('/');
}

function currentPath() {
  if (window.location.pathname === '/operator' || window.location.pathname === '/operator/settlements') {
    window.history.replaceState(window.history.state, '', '/operator/members');
  }
  // 旧ヘッダーの注文履歴ダイアログ（?panel=orders）はアカウントの注文履歴へ移しました。
  if (new URLSearchParams(window.location.search).get('panel') === 'orders') {
    window.history.replaceState(window.history.state, '', '/purchases');
  }
  if (window.location.pathname === '/seller/messages') {
    window.history.replaceState(window.history.state, '', '/seller');
  }
  return window.location.pathname + window.location.hash;
}

export function usePath() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    function changed() {
      setPath(currentPath());
    }
    window.addEventListener('popstate', changed);
    window.addEventListener('hashchange', changed);
    return () => {
      window.removeEventListener('popstate', changed);
      window.removeEventListener('hashchange', changed);
    };
  }, []);
  return path;
}
