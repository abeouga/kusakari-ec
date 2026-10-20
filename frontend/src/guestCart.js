/**
 * A guest's selections live only in React memory. Prices are estimates from the public catalog;
 * authenticated import and checkout always validate the current server data.
 * @param {number} storeId
 * @param {string} storeName
 * @param {import('./types').CartLine[]} [lines]
 * @param {number} [revision]
 * @returns {import('./types').Cart}
 */
export function createGuestCart(storeId, storeName, lines = [], revision = 0) {
  const items = lines.map(({ product, quantity }) => ({
    product, quantity, lineTotalYen: product.priceYen * quantity,
    available: product.active && product.stock >= quantity,
  }));
  const subtotalYen = items.reduce((total, item) => total + item.lineTotalYen, 0);
  return {
    guest: true, revision, storeId, storeName, items, subtotalYen, totalYen: subtotalYen, shippingFeeYen: 0,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    canCheckout: items.length > 0 && items.every((item) => item.available),
    details: { fulfillmentMethod: 'STORE_PICKUP', paymentMethod: '', recipientName: '', recipientPhone: '',
      contactEmail: '', postalCode: '', addressLine1: '', addressLine2: '', requestedDate: '', timeSlot: '' },
  };
}

/** @param {import('./types').Cart} cart @param {import('./types').Product} product @param {number} quantity */
export function setGuestQuantity(cart, product, quantity) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) throw new Error('数量は0〜99点で指定してください。');
  if (quantity > 0 && (!product.active || quantity > product.stock)) throw new Error('選択した店舗の在庫が不足しています。');
  const items = cart.items.flatMap((item) => item.product.id !== product.id ? [item]
    : quantity > 0 ? [{ ...item, product, quantity }] : []);
  if (quantity > 0 && !cart.items.some((item) => item.product.id === product.id)) {
    items.push({ product, quantity, lineTotalYen: 0, available: true });
  }
  if (items.length > 50) throw new Error('カートは50種類までです。');
  return createGuestCart(cart.storeId, cart.storeName, items, cart.revision + 1);
}

/** @param {import('./types').Cart|null} cart @param {import('./types').Store} store @param {import('./types').Product[]} products */
export function repriceGuestCart(cart, store, products) {
  const lines = (cart?.items ?? []).map((line) => ({
    ...line, product: products.find((product) => product.id === line.product.id) ?? { ...line.product, active: false, stock: 0 },
  }));
  return createGuestCart(store.id, store.name, lines, (cart?.revision ?? -1) + 1);
}
