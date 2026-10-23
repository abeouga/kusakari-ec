import { Clock, CreditCard, MapPin, QrCode, Store, UserRound, Wallet } from 'lucide-react';
import { yen } from '../api';
import { paymentMethods } from '../payment';
import { PageLink } from '../workspace/Common';

/** @type {Record<string, import('lucide-react').LucideIcon>} */
const paymentIcons = { PAY_AT_STORE: Store, CREDIT_CARD: CreditCard, PAYPAY: QrCode, RAKUTEN_PAY: Wallet };

/** @param {{shop:ReturnType<import('../useShop').useShop>,cart:import('../types').Cart,payment:string,onPayment:(id:string)=>void}} props */
export function CheckoutConfirm({ shop, cart, payment, onPayment }) {
  const store = shop.stores.find((candidate) => candidate.id === cart.storeId);
  const contact = cart.details;
  return (
    <div className="checkout-confirm">
      <section className="checkout-block" aria-labelledby="checkout-store-title">
        <h3 id="checkout-store-title">
          <MapPin size={18} aria-hidden="true" />
          受け取り店舗
        </h3>
        <div className="checkout-store-card" data-testid="checkout-store">
          <strong>{cart.storeName}</strong>
          {store?.address && <p>{store.address}</p>}
          {store?.hours && (
            <p>
              <Clock size={14} aria-hidden="true" />
              営業時間 {store.hours}
            </p>
          )}
          <p className="fine-print">受け取りの準備ができたら通知でお知らせします。受取料金は無料です。</p>
        </div>
      </section>

      <section className="checkout-block" aria-labelledby="checkout-contact-title">
        <h3 id="checkout-contact-title">
          <UserRound size={18} aria-hidden="true" />
          受け取る方
        </h3>
        {contact?.recipientName ? (
          <dl className="checkout-contact">
            <dt>お名前</dt>
            <dd>{contact.recipientName}</dd>
            {contact.recipientPhone && (
              <>
                <dt>電話番号</dt>
                <dd>{contact.recipientPhone}</dd>
              </>
            )}
            {contact.contactEmail && (
              <>
                <dt>連絡先</dt>
                <dd>{contact.contactEmail}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="fine-print">受取連絡先は未登録です。店頭では注文番号でお受け取りいただけます。</p>
        )}
        <PageLink className="text-link" href="/account/pickup-contact">
          受取連絡先を変更
        </PageLink>
      </section>

      <fieldset className="checkout-block payment-options">
        <legend>
          <Wallet size={18} aria-hidden="true" />
          お支払い方法
        </legend>
        {paymentMethods.map((method) => {
          const Icon = paymentIcons[method.id];
          return (
            <label key={method.id} className="payment-option" data-selected={payment === method.id}>
              <input
                type="radio"
                name="payment-method"
                value={method.id}
                checked={payment === method.id}
                disabled={shop.busy}
                onChange={() => onPayment(method.id)}
              />
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{method.label}</strong>
                <small>{method.note}</small>
              </span>
            </label>
          );
        })}
        <p className="fine-print">
          デモ決済です。カード番号などの支払い情報は入力・送信せず、実際の請求も発生しません。
        </p>
      </fieldset>

      <section className="checkout-block" aria-labelledby="checkout-items-title">
        <h3 id="checkout-items-title">ご注文商品（{cart.itemCount}点）</h3>
        <ul className="checkout-items">
          {cart.items.map((line) => (
            <li key={line.product.id}>
              <img src={line.product.imageUrl} alt="" />
              <span>
                {line.product.name}
                <small>
                  {yen(line.product.priceYen)} × {line.quantity}
                </small>
                {!line.available && <small className="error-text">在庫不足（現在 {line.product.stock} 点）</small>}
              </span>
              <strong>{yen(line.lineTotalYen)}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
