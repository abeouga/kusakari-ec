import { useEffect, useState } from 'react';
import { request } from './api';

/**
 * 支払方法は、カード（Stripe のテストモード）と店頭払いの2つ（#132）。カードは鍵がそろったときだけ出す。
 * 店頭払いは決済を作らず、注文を作った時点で注文受付になる。
 */
export const paymentMethods = [
  {
    id: 'CARD',
    label: 'クレジットカード',
    note: 'カード情報は決済会社（Stripe）の入力欄に入れます。注文時に支払います。',
  },
  { id: 'PAY_AT_STORE', label: '店舗でお支払い', note: '受け取り時に店頭レジで現金・カード・電子マネーで支払います。' },
];

/** 画面用の公開鍵。テスト用（pk_test_）でなければカードを出さない。 */
export const stripePublishableKey = (() => {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  return typeof key === 'string' && key.startsWith('pk_test_') ? key : '';
})();

/** @type {Record<string,string>} */
export const paymentStatusLabels = {
  PENDING: '支払い待ち',
  SUCCEEDED: '支払い済み',
  FAILED: '支払いの失敗',
  EXPIRED: '期限切れ',
};

/** @type {Record<string,string>} */
export const refundStatusLabels = { REQUESTED: '返金の処理中', SUCCEEDED: '返金済み', FAILED: '返金の失敗' };

/** @param {string|undefined} id */
export function paymentLabel(id) {
  return paymentMethods.find((method) => method.id === id)?.label ?? '未選択';
}

/** 画面の公開鍵と、サーバーの鍵の両方がそろっているときだけ、カードを選べる。 */
export function useCardAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!stripePublishableKey) return;
    let active = true;
    request('/payments/config')
      .then((/** @type {{cardAvailable:boolean}} */ config) => {
        if (active) setAvailable(config.cardAvailable === true);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return available;
}
