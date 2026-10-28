import { authFetch, wasSignedIn } from './auth';

export const networkErrorMessage = 'サーバーに接続できません。接続を確認して再試行してください。';
export const sessionExpiredMessage = 'ログインの有効期限が切れました。もう一度ログインしてください。';
/** Fired when a signed-in page receives 401. Screens keep their inputs; SessionNotice offers the login. */
export const sessionExpiredEvent = 'kusakari-session-expired';

export class ApiError extends Error {
  /** @param {string} message @param {number} status @param {string} [code] @param {any} [body] */
  constructor(message, status, code = '', body = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * Turns an API response into data or an ApiError. A body that is not JSON (a proxy's 502 page, for example)
 * is reported as a communication failure with status 0, because the outcome on the server is unknown.
 * @param {Response} response @param {string} [failure]
 */
export async function readResponse(response, failure = '処理を完了できませんでした。') {
  /** @type {any} */
  let data;
  try {
    data = await response.json();
  } catch {
    if (response.status !== 401) throw new ApiError(networkErrorMessage, 0);
  }
  if (response.status === 401) {
    if (!wasSignedIn()) throw new ApiError(data?.message || 'ログインしてください。', 401, data?.code ?? '', data);
    window.dispatchEvent(new Event(sessionExpiredEvent));
    throw new ApiError(sessionExpiredMessage, 401, data?.code ?? '', data);
  }
  if (!response.ok) throw new ApiError(data?.message || failure, response.status, data?.code ?? '', data);
  return data;
}

/** @param {string} url @param {RequestInit} init */
export async function send(url, init) {
  try {
    return await authFetch(url, { ...init, credentials: 'same-origin' });
  } catch {
    throw new ApiError(networkErrorMessage, 0);
  }
}

/** @param {string} path @param {string} [method] @param {string} [body] */
export async function request(path, method = 'GET', body) {
  const response = await send(`/api${path}`, { method, body, headers: { 'Content-Type': 'application/json' } });
  return readResponse(response);
}

export const api = {
  /** @param {File} file @returns {Promise<{imageUrl:string}>} */
  uploadProductImage: async (file) => {
    const body = new FormData();
    body.append('file', file);
    const response = await send('/api/product-images', { method: 'POST', body });
    return readResponse(response, '画像を保存できませんでした。');
  },

  /** @param {import('./types').PlantSuggestionInput} input @returns {Promise<import('./types').PlantSuggestion>} */
  suggestPlantModel: (input) => request('/products/plant-model-suggestions', 'POST', JSON.stringify(input)),
  /** @returns {Promise<import('./types').ShoppingSummary[]>} */
  shoppingLists: () => request('/shopping-lists'),
  /** @param {string} id @returns {Promise<import('./types').ShoppingDetail>} */
  shoppingList: (id) => request(`/shopping-lists/${encodeURIComponent(id)}`),
  /** @param {string} gardenId @param {string} productId @returns {Promise<import('./types').ShoppingDetail>} */
  addShoppingListItem: (gardenId, productId) =>
    request(`/shopping-lists/${encodeURIComponent(gardenId)}/items/${encodeURIComponent(productId)}`, 'PUT'),
  /** @param {string} productId @returns {Promise<import('./types').ShoppingDetail>} */
  createShoppingListWithItem: (productId) => request(`/shopping-lists/items/${encodeURIComponent(productId)}`, 'POST'),
  /** @param {string} id @param {import('./types').ShoppingTransferInput} input @returns {Promise<import('./types').ShoppingTransfer>} */
  transferShoppingList: (id, input) =>
    request(`/cart/shopping-lists/${encodeURIComponent(id)}/items`, 'POST', JSON.stringify(input)),
  /** @returns {Promise<import('./types').Cart>} */
  cart: () => request('/cart'),
  /** @param {import('./types').GuestCartPlan & {revision:number}} input @returns {Promise<import('./types').Cart>} */
  mergeGuestCart: (input) => request('/cart/guest-items', 'PUT', JSON.stringify(input)),
  /** @param {number} id @returns {Promise<import('./types').Store>} */
  store: (id) => request(`/stores/${id}`),
  /** @param {number} storeId @returns {Promise<import('./types').Product[]>} */
  products: (storeId) => request(`/products?storeId=${storeId}`),
  /** @param {number} storeId @returns {Promise<import('./types').Product[]>} */
  sellerProducts: (storeId) => request(`/seller/products?storeId=${storeId}`),
  /** @param {number} storeId @param {string[]} productIds @param {string} status */
  setProductStatus: (storeId, productIds, status) =>
    request('/seller/products/status', 'PATCH', JSON.stringify({ storeId, productIds, status })),
  /** @param {number} latitude @param {number} longitude @returns {Promise<import('./types').Store[]>} */
  stores: (latitude, longitude) => request(`/stores?latitude=${latitude}&longitude=${longitude}`),
  /** @param {string} id @param {number} quantity @param {number} revision @returns {Promise<import('./types').Cart>} */
  setItem: (id, quantity, revision) =>
    request(`/cart/items/${encodeURIComponent(id)}`, 'PUT', JSON.stringify({ quantity, revision })),
  /** @param {number} storeId @param {number} revision @returns {Promise<import('./types').Cart>} */
  setStore: (storeId, revision) => request('/cart/store', 'PUT', JSON.stringify({ storeId, revision })),
  /** @param {import('./types').Checkout} payload @returns {Promise<import('./types').Order>} */
  checkout: (payload) => request('/orders', 'POST', JSON.stringify(payload)),
  /** @returns {Promise<import('./types').Order[]>} */
  orders: () => request('/orders'),
  /** @param {import('./types').ProductInput} input @returns {Promise<import('./types').Product>} */
  createProduct: (input) => request('/products', 'POST', JSON.stringify(input)),
  /** @param {string} id @param {import('./types').ProductInput} input @returns {Promise<import('./types').Product>} */
  updateProduct: (id, input) => request(`/products/${encodeURIComponent(id)}`, 'PUT', JSON.stringify(input)),
  /** @param {string} id */
  deleteProduct: (id) => request(`/products/${encodeURIComponent(id)}`, 'DELETE'),
  /** @param {string} id @param {import('./types').PickupInput} details @returns {Promise<import('./types').Order>} */
  updateOrder: (id, details) => request(`/orders/${encodeURIComponent(id)}`, 'PUT', JSON.stringify(details)),
  /** @param {string} id */
  deleteOrder: (id) => request(`/orders/${encodeURIComponent(id)}`, 'DELETE'),
  /** @param {number} storeId @param {import('./types').MaterialItem[]} items @returns {Promise<import('./types').MaterialMatch[]>} */
  materials: (storeId, items) => request('/materials/quote', 'POST', JSON.stringify({ storeId, items })),
};

/** @param {number} value */
export const yen = (value) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
