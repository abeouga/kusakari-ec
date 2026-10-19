import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

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
    const result = await api.sellerProducts(storeId);
    setProducts(result);
    setLoadedStore(storeId);
  }, [storeId]);
  useEffect(() => {
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
  /** @param {string[]} ids @param {string} status */
  async function changeStatus(ids, status) {
    if (operation.current) return false;
    operation.current = true;
    setSaving(true);
    shop.setError('');
    shop.setNotice('');
    setError('');
    try {
      await api.setProductStatus(storeId, ids, status);
      await Promise.all([refresh(), shop.refreshProducts()]);
      shop.setNotice(
        `${ids.length}件の商品を${status === 'DELETED' ? '削除' : status === 'HIDDEN' ? '非表示に変更' : '再公開'}しました。`,
      );
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新に失敗しました。');
      return false;
    } finally {
      operation.current = false;
      setSaving(false);
    }
  }
  /** @param {string} id @param {import('../types').ProductInput} input */
  async function save(id, input) {
    if (operation.current) return false;
    operation.current = true;
    setSaving(true);
    shop.setError('');
    shop.setNotice('');
    try {
      setError('');
      if (id) await api.updateProduct(id, input);
      else await api.createProduct(input);
      await Promise.all([refresh(), shop.refreshProducts()]);
      shop.setNotice('商品を保存しました。');
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '一覧の取得に失敗しました。');
    } finally {
      operation.current = false;
      setSaving(false);
    }
    return false;
  }

  return {
    products: loadedStore === storeId ? products : [],
    storeId,
    busy: shop.busy || saving || settledStore !== storeId,
    error,
    refresh,
    changeStatus,
    save,
  };
}
