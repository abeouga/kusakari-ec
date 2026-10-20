/** @param {string} productId */
export function productCanvasUrl(productId) {
  const url = new URL(import.meta.env.VITE_KUSAKARI_CANVAS_URL || 'http://127.0.0.1:5173/', window.location.origin);
  url.searchParams.set('productId', productId);
  return url.href;
}
