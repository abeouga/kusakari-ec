import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, request } from './api';
import { canSell, isShopAccount, login, readSession } from './auth';
import { useAuth } from './useAuth';

export function useShop() {
  const { session } = useAuth();
  const [cart, setCart] = useState(/** @type {import('./types').Cart|null} */ (null));
  const [chosenSellerStoreId, setSellerStoreId] = useState(0);
  const [ownStores, setOwnStores] = useState(/** @type {{id:number,name:string,address:string}[]|null} */ (null));
  const [products, setProducts] = useState(/** @type {import('./types').Product[]} */ ([]));
  const [stores, setStores] = useState(/** @type {import('./types').Store[]} */ ([]));
  const [orders, setOrders] = useState(/** @type {import('./types').Order[]} */ ([]));
  // One checkout saves one order per pickup store (issue #70).
  const [lastOrders, setLastOrders] = useState(/** @type {import('./types').Order[]|null} */ (null));
  const [shoppingTransfer, setShoppingTransfer] = useState(
    /** @type {import('./types').ShoppingTransfer|null} */ (null),
  );
  // Issue #10: the cart is for signed-in members only. Signed-out visitors browse the public catalog.
  const [signedOut, setSignedOut] = useState(false);
  // Issue #108: the server refuses the cart for shop accounts and applicants; they browse the catalog only.
  const [refusedBuyer, setRefusedBuyer] = useState(false);
  // Issue #119: lines the server took out of the cart because they can no longer be bought.
  const [removedLines, setRemovedLines] = useState(/** @type {import('./types').RemovedCartLine[]} */ ([]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [locationLabel, setLocationLabel] = useState('東京駅');
  const checkoutRequest = useRef(/** @type {import('./types').Checkout|null} */ (null));
  const operation = useRef(false);

  const refresh = useCallback(async () => {
    let nextCart;
    try {
      nextCart = await api.cart();
    } catch (reason) {
      const refused = reason instanceof ApiError && reason.status === 403 && reason.code === 'BUYER_REQUIRED';
      if (!(reason instanceof ApiError) || (reason.status !== 401 && !refused)) throw reason;
      setSignedOut(!refused);
      setRefusedBuyer(refused);
      setCart(null);
      setOrders([]);
      setProducts(await api.products());
      return;
    }
    setSignedOut(false);
    setRefusedBuyer(false);
    setCart(nextCart);
    if (nextCart.removedItems?.length) setRemovedLines(nextCart.removedItems);
    const nextProducts = await api.products();
    const nextOrders = await api.orders();
    setProducts(nextProducts);
    setOrders(nextOrders);
  }, []);

  const run = useCallback(
    /** @param {() => Promise<void>} action @param {boolean} [refreshOnFailure] */
    async (action, refreshOnFailure = false) => {
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
        const conflict = reason instanceof ApiError && reason.status === 409;
        if (conflict) checkoutRequest.current = null;
        // EC-B09 3a / EC-B10 2a: after any failed cart write, show the server's latest cart again.
        if (conflict || refreshOnFailure) {
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

  const sellerAccount = canSell(session);
  const reloadSellerStores = useCallback(async () => {
    if (!sellerAccount) return;
    try {
      setOwnStores(await request('/seller/stores'));
    } catch {
      // The seller pages then report that no store can be managed.
      setOwnStores([]);
    }
  }, [sellerAccount]);
  useEffect(() => {
    void reloadSellerStores();
  }, [reloadSellerStores]);

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
    }, true);
  }

  /** @param {string} id @param {number} [quantity] */
  function add(id, quantity = 1) {
    if (signedOut) {
      login();
      return;
    }
    if (!cart) {
      setError('商品と店舗を読み込んでいます。しばらくしてから再試行してください。');
      return;
    }
    let currentQuantity = 0;
    const line = cart.items.find((item) => item.product.id === id);
    if (line) currentQuantity = line.quantity;
    return setQuantity(id, currentQuantity + quantity);
  }

  async function checkoutCart() {
    const session = await readSession();
    if (!session.authenticated) {
      login();
      return null;
    }
    const current = await api.cart();
    setCart(current);
    if (current.removedItems?.length) setRemovedLines(current.removedItems);
    return current;
  }

  async function beginCheckout() {
    let ready = false;
    await run(async () => {
      ready = !!(await checkoutCart());
    });
    return ready;
  }

  /** @param {string} paymentMethod */
  function checkout(paymentMethod) {
    return run(async () => {
      const current = await checkoutCart();
      if (!current) return;
      // 応答が届かなかった場合の再試行では、同じ注文要求を送ります。支払い方法を変えた場合は別の注文要求です。
      if (checkoutRequest.current?.paymentMethod !== paymentMethod) {
        checkoutRequest.current = {
          requestId: crypto.randomUUID(),
          revision: current.revision,
          expectedTotalYen: current.totalYen,
          paymentMethod,
        };
      }
      const result = await api.checkout(checkoutRequest.current);
      setLastOrders(result.orders);
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
      const created = id ? null : await api.createProduct(input);
      await refresh();
      // Issue #46: the server assigns the product number; show it once the product is saved.
      setNotice(created ? `商品を保存しました。商品番号は ${created.sku} です。` : '商品を保存しました。');
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
  /** @param {string} id @param {import('./types').PickupInput} details */
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

  // The server lists what this account operates: the owner's stores (unpublished ones too), the staff's assigned
  // stores, or every store for the operator. The public list only adds each store's position for the map.
  /** @type {{id:number,name:string,address?:string,latitude?:number|null,longitude?:number|null}[]} */
  const sellerStores = (ownStores ?? []).map((own) => ({ ...stores.find((store) => store.id === own.id), ...own }));
  const sellerStoreId = sellerStores.some((store) => store.id === chosenSellerStoreId)
    ? chosenSellerStoreId
    : (sellerStores[0]?.id ?? 0);

  return {
    signedOut,
    buyerBlocked: refusedBuyer || isShopAccount(session),
    removedLines,
    setRemovedLines,
    beginCheckout,
    sellerStoreId,
    sellerStores,
    sellerStoresLoading: !session || (sellerAccount && ownStores === null),
    setSellerStoreId,
    reloadSellerStores,
    refreshProducts: refresh,
    transferShoppingList,
    shoppingTransfer,
    setShoppingTransfer,
    saveProduct,
    deleteProduct,
    updateOrder,
    deleteOrder,
    cart,
    products,
    stores,
    orders,
    lastOrders,
    setLastOrders,
    busy,
    error,
    setError,
    notice,
    setNotice,
    locationLabel,
    initialize,
    add,
    setQuantity,
    checkout,
    locate,
    geolocate,
  };
}
