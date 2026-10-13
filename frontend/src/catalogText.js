// 既存の商品データに含まれる試作用の注記を表示時だけ整えます。
// APIのデータ、商品ID、価格、在庫は変更しません。
/** @param {string} value */
export function catalogText(value) {
  return value
    .replaceAll('鉢付きのデモ商品です。', '鉢付きです。')
    .replaceAll(
      'Canvasの配置モデルに対応する架空のデモ商品です。実商品の販売ではありません。',
      'Canvasの配置モデルに対応する商品です。',
    )
    .replaceAll('Kusakari デモ出店者', 'Kusakari')
    .replaceAll('（デモ）', '')
    .replaceAll('・デモ規格', '');
}
