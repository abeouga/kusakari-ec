import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';

/** @param {string} gardenId */
export function useShoppingData(gardenId) {
  const [lists, setLists] = useState(/** @type {import('../types').ShoppingSummary[]} */ ([]));
  const [detail, setDetail] = useState(/** @type {import('../types').ShoppingDetail|null} */ (null));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useRef(async () => {});
  useEffect(() => {
    let cancelled = false;
    let running = false;
    let removed = false;
    async function load() {
      if (cancelled || running || removed) return;
      running = true;
      try {
        if (gardenId) {
          const next = await api.shoppingList(gardenId);
          if (!cancelled) setDetail(next);
        } else {
          const next = await api.shoppingLists();
          if (!cancelled) setLists(next);
        }
        if (!cancelled) setError('');
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '買い物リストを取得できません。');
          if (reason instanceof ApiError && reason.status === 404) { removed = true; setDetail(null); }
        }
      } finally {
        running = false;
        if (!cancelled) setLoading(false);
      }
    }
    refresh.current = async () => { removed = false; await load(); };
    function focus() { void load(); }
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 3000);
    window.addEventListener('focus', focus);
    void load();
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [gardenId]);
  return { lists, detail, error, loading, reload: () => refresh.current() };
}
