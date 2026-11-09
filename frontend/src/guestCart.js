/**
 * Issue #10 removed guest carts. Only `selectStore` in useShop still reaches this file; delete it together with that guest branch.
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

/** @param {import('./types').Cart|null} cart @param {import('./types').Store} store @param {import('./types').Product[]} products */
export function repriceGuestCart(cart, store, products) {
  const lines = (cart?.items ?? []).map((line) => ({
    ...line, product: products.find((product) => product.id === line.product.id) ?? { ...line.product, active: false, stock: 0 },
  }));
  return createGuestCart(store.id, store.name, lines, (cart?.revision ?? -1) + 1);
}
