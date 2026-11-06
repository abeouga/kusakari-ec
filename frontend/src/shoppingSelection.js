// Rules shared by the garden shopping list page and the cart's "add from garden" dialog.

/** @param {import('./types').Cart|null} cart @param {string} productId */
export function quantityInCart(cart, productId) {
  return cart?.items.find((item) => item.product.id === productId)?.quantity ?? 0;
}

/** EC-B24: stock is short when it is below the cart's quantity plus the list's quantity. The server checks the same.
 * @param {import('./types').ShoppingProduct} product @param {number} quantity @param {number} inCart */
export function unavailableReason(product, quantity, inCart) {
  if (!product.active) return '販売終了';
  const total = inCart + quantity;
  if (total > 99) return 'カートの数量と合わせると上限99点を超えます';
  if (product.stock < total) return '在庫不足';
  return '';
}

/** A line with one sale product uses it; a line with several needs the buyer's choice.
 * @param {import('./types').ShoppingLine} line @param {string|undefined} choice */
export function chosenProduct(line, choice) {
  return line.products.find((p) => p.id === choice) ?? (line.products.length === 1 ? line.products[0] : null);
}

/** @param {import('./types').ShoppingLine} line @param {import('./types').ShoppingProduct|null} product @param {number} inCart */
export function lineReason(line, product, inCart) {
  if (product) return unavailableReason(product, line.quantity, inCart);
  return line.products.length ? '購入商品を選択してください' : '対応する販売商品がありません';
}
