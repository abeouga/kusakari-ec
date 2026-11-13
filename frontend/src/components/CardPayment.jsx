import { useEffect, useState } from 'react';
// pure: Stripe.js is loaded only when the card step opens, not on every page.
import { loadStripe } from '@stripe/stripe-js/pure';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CreditCard, Loader2 } from 'lucide-react';
import { request, yen } from '../api';
import { stripePublishableKey } from '../payment';
import { PageLink } from '../workspace/Common';

/** @type {Promise<import('@stripe/stripe-js').Stripe|null>|null} */
let stripePromise = null;
function stripe() {
  stripePromise ??= loadStripe(stripePublishableKey);
  return stripePromise;
}

const pollIntervalMs = 1500;
const pollLimitMs = 90000;

/**
 * カードの支払い（#132）。カード情報は Stripe の入力欄（Payment Element）に入れ、このサイトのサーバーを通らない。
 * 画面での支払いの成功は信用せず、Webhook で注文受付になったことを注文の API で確かめてから完了にする。
 * @param {{pending:import('../types').PendingCardPayment,onAccepted:(orders:import('../types').Order[])=>void}} props
 */
export function CardPaymentStep({ pending, onAccepted }) {
  return (
    <section className="cart-content card-payment" aria-labelledby="card-payment-title">
      <h2 id="card-payment-title">
        <CreditCard size={20} aria-hidden="true" />
        カードでのお支払い
      </h2>
      <p className="fine-print">
        お支払い金額 <strong data-testid="card-payment-amount">{yen(pending.payment.amountYen)}</strong>
        （受取店舗ごとの注文 {pending.orders.length} 件の合計）。テストモードのため、実際の請求はありません。
      </p>
      <Elements stripe={stripe()} options={{ clientSecret: pending.payment.clientSecret ?? undefined, locale: 'ja' }}>
        <CardForm pending={pending} onAccepted={onAccepted} />
      </Elements>
    </section>
  );
}

/** @param {{pending:import('../types').PendingCardPayment,onAccepted:(orders:import('../types').Order[])=>void}} props */
function CardForm({ pending, onAccepted }) {
  const stripeApi = useStripe();
  const elements = useElements();
  const [phase, setPhase] = useState(/** @type {'input'|'paying'|'confirming'|'cancelled'|'slow'} */ ('input'));
  const [error, setError] = useState('');

  useEffect(() => {
    if (phase !== 'confirming') return;
    let active = true;
    const started = Date.now();
    async function poll() {
      while (active) {
        try {
          const orders = await Promise.all(
            pending.orders.map((order) =>
              request(`/orders/${encodeURIComponent(order.id)}`).then((/** @type {import('../types').Order} */ o) => o),
            ),
          );
          if (!active) return;
          if (orders.every((order) => order.status === 'ACCEPTED')) {
            onAccepted(orders);
            return;
          }
          if (orders.some((order) => order.status === 'CANCELLED')) {
            setPhase('cancelled');
            return;
          }
        } catch {
          /* 通信の失敗は、次の確認でやり直す。 */
        }
        if (Date.now() - started > pollLimitMs) {
          if (active) setPhase('slow');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
    void poll();
    return () => {
      active = false;
    };
  }, [phase, pending, onAccepted]);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function pay(event) {
    event.preventDefault();
    if (!stripeApi || !elements || phase !== 'input') return;
    setPhase('paying');
    setError('');
    const result = await stripeApi.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/purchases` },
    });
    if (result.error && (result.error.type === 'card_error' || result.error.type === 'validation_error')) {
      setError(result.error.message ?? 'カードで支払えませんでした。');
      // 入力の不備はその場で直せる。カードが断られたときは、サーバーが注文を取り消すのを確かめる。
      setPhase(result.error.type === 'validation_error' ? 'input' : 'confirming');
      return;
    }
    if (result.error) {
      setError(result.error.message ?? 'カードで支払えませんでした。');
      setPhase('input');
      return;
    }
    setPhase('confirming');
  }

  if (phase === 'cancelled') {
    return (
      <div className="card-payment-result" role="alert">
        {error && <p className="error">{error}</p>}
        <p>お支払いができなかったため、注文を取り消しました。商品の在庫は元に戻しています。</p>
        <PageLink className="primary-button" href="/#plants">
          商品を探す
        </PageLink>
      </div>
    );
  }
  if (phase === 'slow') {
    return (
      <div className="card-payment-result" role="status">
        <p>お支払いの確認に時間がかかっています。注文の状態は購入履歴で確認できます。</p>
        <PageLink className="primary-button" href="/purchases">
          購入履歴を開く
        </PageLink>
      </div>
    );
  }
  return (
    <form className="card-payment-form" onSubmit={pay}>
      <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {phase === 'confirming' ? (
        <p className="card-payment-confirming" role="status">
          <Loader2 size={18} aria-hidden="true" className="spin" />
          支払いを確認しています
        </p>
      ) : (
        <button className="primary-button full" disabled={!stripeApi || !elements || phase !== 'input'}>
          {phase === 'paying' ? '支払い中…' : `${yen(pending.payment.amountYen)}を支払う`}
        </button>
      )}
    </form>
  );
}
