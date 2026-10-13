/** @param {unknown} value @returns {import('../types').MaterialItem[]} */
export function validateMaterials(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50)
    throw new Error('材料は1〜50種類で指定してください。');
  const items = [];
  const seen = new Set();
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).some((key) => !['materialCode', 'quantity', 'unit'].includes(key))
    )
      throw new Error('材料データの項目が不正です。');
    if (typeof item.materialCode !== 'string' || !/^[a-z][a-z0-9._-]{0,79}$/.test(item.materialCode))
      throw new Error('材料コードが不正です。');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || item.unit !== 'piece')
      throw new Error('数量は1〜99の整数、単位はpieceで指定してください。');
    if (seen.has(item.materialCode)) throw new Error('同じ材料コードはまとめて指定してください。');
    seen.add(item.materialCode);
    items.push({ materialCode: item.materialCode, quantity: item.quantity, unit: item.unit });
  }
  return items;
}

export function readIncomingMaterials() {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const source = parameters.get('canvas-items');
  if (source === null) return { items: /** @type {import('../types').MaterialItem[]|null} */ (null), error: '' };
  try {
    if (source.length > 12000) throw new Error('材料データが大きすぎます。');
    return { items: validateMaterials(JSON.parse(source)), error: '' };
  } catch (reason) {
    let error = 'Canvasからのデータを読み込めませんでした。';
    if (reason instanceof Error) error = reason.message;
    return { items: null, error };
  }
}
