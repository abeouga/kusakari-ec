import { useEffect, useState } from 'react';

/** @param {string} path */
export function navigate(path) {
  const previousPath = window.location.pathname + window.location.search + window.location.hash;
  window.history.pushState({ kusakariPreviousPath: previousPath }, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

/**
 * Replaces the current history entry, for a page that only forwards elsewhere: Back must not land on it again.
 * @param {string} path
 */
export function redirect(path) {
  window.history.replaceState(window.history.state, '', path);
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
  // Issue #75: 出店者ダッシュボードは注文実績と重複していたため削除し、出店者画面の入口は商品管理です。
  if (window.location.pathname === '/seller' || window.location.pathname === '/seller/messages') {
    window.history.replaceState(window.history.state, '', '/seller/products');
  }
  // Issue #88: 庭専用の買い物リスト画面は削除し、カート画面の「庭に設置したものから追加」ポップアップに統一しました。
  const gardenList = window.location.pathname.match(/^\/cart\/gardens\/([^/]+)\/?$/);
  if (gardenList) {
    window.history.replaceState(window.history.state, '', `/cart?garden=${gardenList[1]}`);
  } else if (window.location.pathname === '/cart' && window.location.hash === '#garden-shopping-lists') {
    window.history.replaceState(window.history.state, '', '/cart?garden=');
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
