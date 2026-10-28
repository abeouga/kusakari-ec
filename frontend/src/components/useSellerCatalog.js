import { useCallback, useEffect, useRef, useState } from 'react';
import { api, request } from '../api';

/** @typedef {{saved:boolean,latest:import('../types').Product|null}} SaveResult */

/** @param {ReturnType<import('../useShop').useShop>} shop */
export function useSellerCatalog(shop) {
  const storeId = shop.sellerStoreId;
  const [products, setProducts] = useState(/** @type {import('../types').Product[]} */ ([]));
  const [loadedStore, setLoadedStore] = useState(0);
  const [settledStore, setSettledStore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(false);
  const refresh = useCallback(async () => {
    if (!storeId) return [];
    const result = await api.sellerProducts(storeId);
    setProducts(result);
    setLoadedStore(storeId);
    return result;
  }, [storeId]);
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    api
      .sellerProducts(storeId)
      .then((result) => {
        if (!cancelled) {
          setProducts(result);
          setLoadedStore(storeId);
          setError('');
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setSettledStore(storeId);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  /**
   * Runs one write at a time. On failure (EC-S05 5b, EC-S06 4a) the list is fetched again so the
   * screen shows the latest stock and sales state; the caller receives the refreshed product.
   * @param {string} id @param {()=>Promise<unknown>} action @param {string} message @returns {Promise<SaveResult>}
   */
  async function write(id, action, message) {
    if (operation.current) return { saved: false, latest: null };
    operation.current = true;
    setSaving(true);
    shop.setError('');
    shop.setNotice('');
    setError('');
    try {
      await action();
      await Promise.all([refresh(), shop.refreshProducts()]);
      shop.setNotice(message);
      return { saved: true, latest: null };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新に失敗しました。');
      const latest = await refresh().catch(() => null);
      return { saved: false, latest: latest?.find((product) => product.id === id) ?? null };
    } finally {
      operation.current = false;
      setSaving(false);
    }
  }

  /** @param {string[]} ids @param {string} status */
  async function changeStatus(ids, status) {
    const label = status === 'DELETED' ? '削除' : status === 'HIDDEN' ? '非表示に変更' : '再公開';
    const result = await write(
      ids[0] ?? '',
      () => api.setProductStatus(storeId, ids, status),
      `${ids.length}件の商品を${label}しました。`,
    );
    return result.saved;
  }

  /**
   * Product edits carry the stock shown when editing started, so a stale form cannot overwrite it.
   * @param {string} id @param {import('../types').ProductInput & {expectedStock:number}} input
   */
  function save(id, input) {
    return write(id, () => api.updateProduct(id, input), '商品を保存しました。');
  }

  /** @param {string} id @param {number} expectedStock @param {number} stock */
  function saveStock(id, expectedStock, stock) {
    return write(
      id,
      () =>
        request(
          `/seller/products/${encodeURIComponent(id)}/stock`,
          'PUT',
          JSON.stringify({ storeId, expectedStock, stock }),
        ),
      '在庫数を保存しました。',
    );
  }

  return {
    products: loadedStore === storeId ? products : [],
    storeId,
    busy: shop.busy || saving || settledStore !== storeId,
    error,
    refresh,
    changeStatus,
    save,
    saveStock,
  };
}
