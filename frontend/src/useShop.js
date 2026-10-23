import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { login, readSession } from './auth';
import { repriceGuestCart, setGuestQuantity } from './guestCart';

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
  const guestCart = useRef(/** @type {import('./types').Cart|null} */ (null));
  const guestPlan = useRef(/** @type {import('./types').GuestCartPlan|null} */ (null));

  const rememberGuest = useCallback(/** @param {import('./types').Cart} next */ (next) => {
    guestCart.current = next;
    setCart(next);
  }, []);

  const promoteGuestCart = useCallback(async () => {
    let saved = await api.cart();
    const draft = guestCart.current;
    if (draft?.items.length) {
      try {
        if (saved.items.length && saved.storeId !== draft.storeId) throw new ApiError(`保存済みカートの受取店舗は「${saved.storeName}」です。カートに戻ってこの店舗を選び直してください。`, 409);
        if (!guestPlan.current) {
          guestPlan.current = {
            revision: saved.revision,
            storeId: draft.storeId,
            items: draft.items.map((line) => ({ productId: line.product.id,
              quantity: line.quantity + (saved.items.find((item) => item.product.id === line.product.id)?.quantity ?? 0) })),
          };
        }
        const plan = guestPlan.current;
        if (plan.items.some((line) => line.quantity > 99)) throw new ApiError('保存済みの数量との合計が99点を超えます。カートの数量を減らしてください。', 400);
        const alreadyApplied = saved.storeId === plan.storeId && plan.items.every((line) =>
          saved.items.some((item) => item.product.id === line.productId && item.quantity === line.quantity));
        if (!alreadyApplied) saved = await api.mergeGuestCart(plan);
      } catch (reason) {
        // Retain absolute targets after an uncertain network response so retry cannot add the same items twice.
        if (reason instanceof ApiError && reason.status > 0) guestPlan.current = null;
        throw reason;
      }
    }
    guestPlan.current = null;
    guestCart.current = null;
    setCart(saved);
    return saved;
  }, []);

  const refresh = useCallback(async () => {
    let nextCart;
    try {
      nextCart = guestCart.current?.items.length ? await promoteGuestCart() : await api.cart();
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 401) throw reason;
      setOrders([]);
      const storeId = guestCart.current?.storeId ?? 1;
      const [nextProducts, store] = await Promise.all([api.products(storeId), api.store(storeId)]);
      setProducts(nextProducts);
      rememberGuest(repriceGuestCart(guestCart.current, store, nextProducts));
      return;
    }
    setCart(nextCart);
    const nextProducts = await api.products(nextCart.storeId);
    const nextOrders = await api.orders();
    setProducts(nextProducts);
    setOrders(nextOrders);
  }, [promoteGuestCart, rememberGuest]);

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
      if (cart.guest) {
        if (guestPlan.current) throw new Error('引き継ぎ結果を確認中です。注文手続きを再試行してください。');
        const product = products.find((item) => item.id === id) ?? cart.items.find((item) => item.product.id === id)?.product;
        if (!product) throw new Error('商品が見つかりません。商品一覧を再読み込みしてください。');
        rememberGuest(setGuestQuantity(cart, product, quantity));
      } else setCart(await api.setItem(id, quantity, cart.revision));
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
    if (!cart) {
      setError('商品と店舗を読み込んでいます。しばらくしてから再試行してください。');
      return;
    }
    let currentQuantity = 0;
    const line = cart.items.find((item) => item.product.id === id);
    if (line) currentQuantity = line.quantity;
    return setQuantity(id, currentQuantity + quantity);
  }

  /** @param {number} id */
  function selectStore(id) {
    return run(async () => {
      if (!cart) return;
      if (cart.guest) {
        if (guestPlan.current) throw new Error('引き継ぎ結果を確認中です。注文手続きを再試行してください。');
        const [nextProducts, store] = await Promise.all([api.products(id), api.store(id)]);
        rememberGuest(repriceGuestCart(cart, store, nextProducts));
        setProducts(nextProducts);
        setNotice('受取店舗を変更しました。在庫を確認してください。');
        return;
      }
      const next = await api.setStore(id, cart.revision);
      setCart(next);
      checkoutRequest.current = null;
      setProducts(await api.products(id));
      setNotice('受取店舗を変更しました。在庫を確認してください。');
    });
  }

  async function checkoutCart() {
    const session = await readSession();
    if (!session.authenticated) { login(); return null; }
    const current = cart?.guest ? await promoteGuestCart() : await api.cart();
    setCart(current);
    return current;
  }

  async function beginCheckout() {
    let ready = false;
    await run(async () => { ready = !!(await checkoutCart()); });
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

  return {
    isGuest: !!cart?.guest,
    promoteGuestCart,
    beginCheckout,
    sellerStoreId,
    setSellerStoreId,
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
