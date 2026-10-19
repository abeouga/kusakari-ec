import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

export function useShop() {
  const [cart, setCart] = useState(/** @type {import('./types').Cart|null} */ (null));
  const [sellerStoreId, setSellerStoreId] = useState(1);
  const [products, setProducts] = useState(/** @type {import('./types').Product[]} */ ([]));
  const [stores, setStores] = useState(/** @type {import('./types').Store[]} */ ([]));
  const [orders, setOrders] = useState(/** @type {import('./types').Order[]} */ ([]));
  const [lastOrder, setLastOrder] = useState(/** @type {import('./types').Order|null} */ (null));
  const [shoppingTransfer, setShoppingTransfer] = useState(
    /** @type {import('./types').ShoppingTransfer|null} */ (null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [locationLabel, setLocationLabel] = useState('東京駅');
  const checkoutRequest = useRef(/** @type {import('./types').Checkout|null} */ (null));
  const operation = useRef(false);

  const refresh = useCallback(async () => {
    const nextCart = await api.cart();
    setCart(nextCart);
    const nextProducts = await api.products(nextCart.storeId);
    const nextOrders = await api.orders();
    setProducts(nextProducts);
    setOrders(nextOrders);
  }, []);

  const run = useCallback(
    /** @param {() => Promise<void>} action */ async (action) => {
      if (operation.current) return;
      operation.current = true;
      setBusy(true);
      setError('');
      setNotice('');
      try {
        await action();
        return true;
      } catch (reason) {
        let message = '処理に失敗しました。';
        if (reason instanceof Error) message = reason.message;
        setError(message);
        if (reason instanceof ApiError && reason.status === 409) {
          checkoutRequest.current = null;
          try {
            await refresh();
          } catch {
            /* Keep the original conflict visible. */
          }
        }
        return false;
      } finally {
        operation.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );

  const initialize = useCallback(
    () =>
      run(async () => {
        await refresh();
        setStores(await api.stores(35.6812, 139.7671));
      }),
    [run, refresh],
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  /** @param {string} id @param {number} quantity */
  function setQuantity(id, quantity) {
    return run(async () => {
      if (!cart) return;
      setCart(await api.setItem(id, quantity, cart.revision));
      checkoutRequest.current = null;
      if (quantity === 0) {
        setNotice('カートから削除しました。');
      } else {
        setNotice('カートを更新しました。');
      }
    });
  }

  /** @param {string} id @param {number} [quantity] */
  function add(id, quantity = 1) {
    if (!cart) return;
    let currentQuantity = 0;
    const line = cart.items.find((item) => item.product.id === id);
    if (line) currentQuantity = line.quantity;
    return setQuantity(id, currentQuantity + quantity);
  }

  /** @param {number} id */
  function selectStore(id) {
    return run(async () => {
      if (!cart) return;
      const next = await api.setStore(id, cart.revision);
      setCart(next);
      checkoutRequest.current = null;
      setProducts(await api.products(id));
      setNotice('受取店舗を変更しました。在庫を確認してください。');
    });
  }

  function checkout() {
    return run(async () => {
      if (!cart) return;
      // 応答が届かなかった場合の再試行では、同じ注文要求を送ります。
      if (!checkoutRequest.current) {
        checkoutRequest.current = {
          requestId: crypto.randomUUID(),
          revision: cart.revision,
          expectedTotalYen: cart.totalYen,
        };
      }
      const order = await api.checkout(checkoutRequest.current);
      setLastOrder(order);
      checkoutRequest.current = null;
      await refresh();
    });
  }

  /** @param {number} lat @param {number} lon @param {string} label */
  function locate(lat, lon, label) {
    return run(async () => {
      setStores(await api.stores(lat, lon));
      setLocationLabel(label);
    });
  }

  function geolocate() {
    if (!navigator.geolocation) {
      setError('このブラウザーは現在地の取得に対応していません。');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locate(position.coords.latitude, position.coords.longitude, '現在地');
      },
      () => setError('現在地を取得できませんでした。基準地点を選択してください。'),
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  /** @param {string} id @param {import('./types').ProductInput} input */
  function saveProduct(id, input) {
    return run(async () => {
      if (id) await api.updateProduct(id, input);
      else await api.createProduct(input);
      await refresh();
      setNotice('商品を保存しました。');
    });
  }
  /** @param {string} id */
  function deleteProduct(id) {
    return run(async () => {
      await api.deleteProduct(id);
      await refresh();
      setNotice('商品を一覧から削除しました。');
    });
  }
  /** @param {import('./types').DeliveryDetails} details */
  function saveDetails(details) {
    return run(async () => {
      if (!cart) return;
      setCart(await api.saveDetails(details, cart.revision));
      checkoutRequest.current = null;
      setNotice('受取・配送情報を保存しました。');
    });
  }
  function clearDetails() {
    return run(async () => {
      if (!cart) return;
      setCart(await api.clearDetails(cart.revision));
      checkoutRequest.current = null;
      setNotice('入力情報を削除しました。');
    });
  }
  /** @param {string} id @param {import('./types').DeliveryDetails} details */
  function updateOrder(id, details) {
    return run(async () => {
      await api.updateOrder(id, details);
      await refresh();
      setNotice('注文情報を更新しました。');
    });
  }
  /** @param {string} id */
  function deleteOrder(id) {
    return run(async () => {
      await api.deleteOrder(id);
      await refresh();
      setNotice('注文を履歴から削除しました。');
    });
  }

  /** @param {string} gardenId @param {import('./types').ShoppingTransferInput} input */
  async function transferShoppingList(gardenId, input) {
    let result = /** @type {import('./types').ShoppingTransfer|null} */ (null);
    await run(async () => {
      result = await api.transferShoppingList(gardenId, input);
      setCart(result.cart);
      setShoppingTransfer(result);
      checkoutRequest.current = null;
    });
    return result;
  }

  return {
    sellerStoreId,
    setSellerStoreId,
    refreshProducts: refresh,
    transferShoppingList,
    shoppingTransfer,
    setShoppingTransfer,
    saveProduct,
    deleteProduct,
    saveDetails,
    clearDetails,
    updateOrder,
    deleteOrder,
    cart,
    products,
    stores,
    orders,
    lastOrder,
    setLastOrder,
    busy,
    error,
    setError,
    notice,
    setNotice,
    locationLabel,
    initialize,
    add,
    setQuantity,
    selectStore,
    checkout,
    locate,
    geolocate,
  };
}
