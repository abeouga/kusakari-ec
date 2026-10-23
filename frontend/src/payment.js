/** Demo payment choices. No payment provider is called; the choice is stored on the order. */
export const paymentMethods = [
  { id: 'PAY_AT_STORE', label: '店舗でお支払い', note: '受け取り時に店頭レジで現金・カード・電子マネーで支払います。' },
  { id: 'CREDIT_CARD', label: 'クレジットカード', note: 'VISA / Mastercard / JCB / AMEX。注文確定時に決済します。' },
  { id: 'PAYPAY', label: 'PayPay', note: '注文確定後にPayPayアプリで支払いを承認します。' },
  { id: 'RAKUTEN_PAY', label: '楽天ペイ', note: '楽天IDで支払います。楽天ポイントも使えます。' },
];

/** @param {string|undefined} id */
export function paymentLabel(id) {
  return paymentMethods.find((method) => method.id === id)?.label ?? '未選択';
}

/** @param {string|undefined} id */
export function paymentStatus(id) {
  if (id === 'PAY_AT_STORE') return '受け取り時に店頭でお支払いください。';
  if (id && id !== 'NONE')
    return `${paymentLabel(id)}でのお支払いを受け付けました（デモ決済のため実際の請求はありません）。`;
  return '';
}
