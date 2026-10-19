export class ApiError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** @param {string} path @param {string} [method] @param {string} [body] */
async function request(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      body,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new ApiError('サーバーに接続できません。接続を確認して再試行してください。', 0);
  }
  const data = await response.json();
  if (!response.ok) {
    let message = '処理を完了できませんでした。';
    if (data.message) message = data.message;
    throw new ApiError(message, response.status);
  }
  return data;
}

export const api = {
  /** @param {File} file @returns {Promise<{imageUrl:string}>} */
  uploadProductImage: async (file) => {
    const body = new FormData();
    body.append('file', file);
    let response;
    try {
      response = await fetch('/api/product-images', { method: 'POST', body, credentials: 'same-origin' });
    } catch {
      throw new ApiError('画像を保存できません。接続を確認して再試行してください。', 0);
    }
    const result = await response.json();
    if (!response.ok) throw new ApiError(result.message || '画像を保存できませんでした。', response.status);
    return result;
  },
  /** @param {string} id @returns {Promise<import('./types').ProductTips>} */
  productTips: (id) => request(`/products/${encodeURIComponent(id)}/tips`),
  /** @param {string} id @param {import('./types').ProductTips} tips @returns {Promise<import('./types').ProductTips>} */
  saveProductTips: (id, tips) => request(`/products/${encodeURIComponent(id)}/tips`, 'PUT', JSON.stringify(tips)),

  /** @param {import('./types').PlantSuggestionInput} input @returns {Promise<import('./types').PlantSuggestion>} */
  suggestPlantModel: (input) => request('/products/plant-model-suggestions', 'POST', JSON.stringify(input)),
  /** @returns {Promise<import('./types').ShoppingSummary[]>} */
  shoppingLists: () => request('/shopping-lists'),
  /** @param {string} id @returns {Promise<import('./types').ShoppingDetail>} */
  shoppingList: (id) => request(`/shopping-lists/${encodeURIComponent(id)}`),
  /** @param {string} id @param {import('./types').ShoppingTransferInput} input @returns {Promise<import('./types').ShoppingTransfer>} */
  transferShoppingList: (id, input) =>
    request(`/cart/shopping-lists/${encodeURIComponent(id)}/items`, 'POST', JSON.stringify(input)),
  /** @returns {Promise<import('./types').Cart>} */
  cart: () => request('/cart'),
  /** @param {number} storeId @returns {Promise<import('./types').Product[]>} */
  products: (storeId) => request(`/products?storeId=${storeId}`),
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
  /** @param {import('./types').DeliveryDetails} details @param {number} revision @returns {Promise<import('./types').Cart>} */
  saveDetails: (details, revision) => request('/cart/details', 'PUT', JSON.stringify({ details, revision })),
  /** @param {number} revision @returns {Promise<import('./types').Cart>} */
  clearDetails: (revision) => request(`/cart/details?revision=${revision}`, 'DELETE'),
  /** @param {string} id @param {import('./types').DeliveryDetails} details @returns {Promise<import('./types').Order>} */
  updateOrder: (id, details) => request(`/orders/${encodeURIComponent(id)}`, 'PUT', JSON.stringify(details)),
  /** @param {string} id */
  deleteOrder: (id) => request(`/orders/${encodeURIComponent(id)}`, 'DELETE'),
  /** @param {number} storeId @param {import('./types').MaterialItem[]} items @returns {Promise<import('./types').MaterialMatch[]>} */
  materials: (storeId, items) => request('/materials/quote', 'POST', JSON.stringify({ storeId, items })),
};

/** @param {number} value */
export const yen = (value) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
