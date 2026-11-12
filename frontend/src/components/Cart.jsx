import { productCanvasUrl } from '../canvasLink';
import { useState } from 'react';
import { ShoppingCart, MapPin, Minus, Plus, Trash2, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { yen } from '../api';
import { DeliverySummary } from './DeliverySummary';
import { CheckoutConfirm } from './CheckoutConfirm';
import { paymentLabel, paymentStatus } from '../payment';
import { PageLink } from '../workspace/Common';
import { AddFromGardenCard } from './GardenItemsDialog';

/** @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function Cart({ shop }) {
  const [confirming, setConfirming] = useState(false);
  const [payment, setPayment] = useState('PAY_AT_STORE');
  const [lastLine, setLastLine] = useState(/** @type {HTMLElement|null} */ (null));
  const cart = shop.cart;
  if (shop.lastOrders) {
    return (
      <section className="cart-content cart-complete">
        <h2>注文を保存しました</h2>
        <div className="order-success">
          <CheckCircle2 size={42} />
          <h3>植物を迎える準備ができました。</h3>
        </div>
        {shop.lastOrders.length > 1 && (
          <p className="fine-print">受取店舗ごとに{shop.lastOrders.length}件の注文に分けて保存しました。</p>
        )}
        {shop.lastOrders.map((order) => (
          <OrderSummary key={order.id} order={order} />
        ))}
        <a className="primary-button full" href="/#plants">
          お買い物を続ける
        </a>
      </section>
    );
  }
  if (!cart) {
    return (
      <section className="cart-content cart-empty-state">
        <h2>ショッピングカート</h2>
        {shop.error && (
          <>
            <p className="error" role="alert">
              {shop.error}
            </p>
            <PageLink className="primary-button" href="/#plants">
              商品を探す
            </PageLink>
          </>
        )}
        {!shop.error && <p role="status">カートを読み込んでいます。</p>}
      </section>
    );
  }
  if (cart.items.length === 0) {
    return (
      <section className="cart-content cart-empty-state">
        <h2>ショッピングカート</h2>
        <RemovedNotice shop={shop} />
        {shop.error && (
          <p className="error" role="alert">
            {shop.error}
          </p>
        )}
        <div className="empty">
          <ShoppingCart size={40} />
          <h3>まだ商品が入っていません。</h3>
          <p>お気に入りのひと鉢を見つけてください。</p>
          <PageLink className="primary-button" href="/#plants">
            商品を探す
          </PageLink>
        </div>
        <AddFromGardenCard shop={shop} />
      </section>
    );
  }
  let title = `ショッピングカート (${cart.itemCount})`;
  let checkoutLabel = '注文を確定する';
  if (confirming) title = 'お支払い・受け取りの確認';
  if (shop.busy) checkoutLabel = '保存中…';
  return (
    <section className="cart-content">
      <h2>{title}</h2>
      <ol className="checkout-steps" aria-label="購入の手順">
        <li aria-current={confirming ? undefined : 'step'}>カート</li>
        <li aria-current={confirming ? 'step' : undefined}>お支払い・受け取り</li>
        <li>注文完了</li>
      </ol>
      <RemovedNotice shop={shop} />
      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      <div className="checkout-layout">
        {confirming && <CheckoutConfirm shop={shop} cart={cart} payment={payment} onPayment={setPayment} />}
        {!confirming && (
          <div>
            <div className="cart-items">
              {cart.items.map((line, index) => (
                <article
                  className="cart-line"
                  key={line.product.id}
                  ref={index === cart.items.length - 1 ? setLastLine : undefined}
                >
                  <img src={line.product.imageUrl} alt={line.product.name} />
                  <div className="cart-line-main">
                    <h3>{line.product.name}</h3>
                    <a href={productCanvasUrl(line.product.id)}>この商品を庭に配置</a>
                    <p>{yen(line.product.priceYen)} / 1鉢</p>
                    <p className="cart-line-store">
                      <MapPin size={14} aria-hidden="true" />
                      受取店舗：{line.storeName}
                    </p>
                    {line.unavailableReason && <p className="error-text">現在は購入できません</p>}
                    {!line.available && !line.unavailableReason && (
                      <p className="error-text">在庫不足（現在 {line.product.stock} 点）</p>
                    )}
                    <div className="quantity-control">
                      <button
                        aria-label={`${line.product.name}を1個減らす`}
                        disabled={shop.busy || line.quantity <= 1}
                        onClick={() => shop.setQuantity(line.product.id, line.quantity - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span aria-label="数量">{line.quantity}</span>
                      <button
                        aria-label={`${line.product.name}を1個増やす`}
                        disabled={shop.busy || line.quantity >= 99 || line.quantity >= line.product.stock}
                        onClick={() => shop.setQuantity(line.product.id, line.quantity + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="cart-line-end">
                    <strong>{yen(line.lineTotalYen)}</strong>
                    <button
                      className="icon-button"
                      aria-label={`${line.product.name}を削除`}
                      disabled={shop.busy}
                      onClick={() => shop.setQuantity(line.product.id, 0)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <AddFromGardenCard shop={shop} matchHeight={lastLine} />
          </div>
        )}
        <aside className="checkout-summary">
          <p className="eyebrow">ORDER SUMMARY</p>
          <h3>ご請求内容</h3>
          <div className="totals">
            <div>
              <span>
                商品小計（税込）<small> / 内税10%</small>
              </span>
              <span>{yen(cart.subtotalYen)}</span>
            </div>
            <div>
              <span>うち消費税（内税10%）</span>
              <span>{yen(Math.floor((cart.totalYen * 10) / 110))}</span>
            </div>
            <div className="grand-total">
              <strong>合計</strong>
              <strong>{yen(cart.totalYen)}</strong>
            </div>
          </div>
          {shop.notice && (
            <p className="success-text" role="status">
              {shop.notice}
            </p>
          )}
          {confirming && (
            <>
              <p className="checkout-payment-choice" data-testid="checkout-payment">
                お支払い方法<strong>{paymentLabel(payment)}</strong>
              </p>
              <button
                className="primary-button full"
                disabled={shop.busy || !cart.canCheckout}
                onClick={() => shop.checkout(payment)}
              >
                {checkoutLabel}
                <CheckCircle2 size={18} />
              </button>
              <button className="text-button back-button" disabled={shop.busy} onClick={() => setConfirming(false)}>
                <ArrowLeft size={16} aria-hidden />
                カートに戻る
              </button>
            </>
          )}
          {!confirming && (
            <button
              className="primary-button full"
              disabled={shop.busy || !cart.canCheckout}
              onClick={async () => {
                if (await shop.beginCheckout()) setConfirming(true);
              }}
            >
              注文内容を確認する
              <ArrowRight size={18} />
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

/**
 * Issue #119: lines removed when the cart was opened because their store closed or was suspended, the organization
 * was suspended, or the product was deleted. The server removes them once, so the note stays until it is closed.
 * @param {{shop:ReturnType<import('../useShop').useShop>}} props
 */
function RemovedNotice({ shop }) {
  if (!shop.removedLines.length) return null;
  return (
    <div className="cart-removed-notice" role="status">
      {shop.removedLines.map((line) => (
        <p key={line.productId}>{line.name}は購入できなくなったためカートから外しました。</p>
      ))}
      <button type="button" className="text-button" onClick={() => shop.setRemovedLines([])}>
        閉じる
      </button>
    </div>
  );
}

/** @param {{order:import('../types').Order}} props */
export function OrderSummary({ order }) {
  return (
    <article className="order-summary">
      <div className="order-label">
        ORDER <span>{new Date(order.createdAt).toLocaleString('ja-JP')}</span>
      </div>
      <p className="order-id">注文番号：{order.id}</p>
      <p className="order-store">
        <MapPin size={16} aria-hidden="true" />
        受取店舗：{order.storeName}
      </p>
      {order.pickupAddress && <p className="fine-print">{order.pickupAddress}</p>}
      <DeliverySummary details={order.details} />
      {order.details?.paymentMethod && order.details.paymentMethod !== 'NONE' && (
        <p data-testid="order-payment">
          お支払い方法：{paymentLabel(order.details.paymentMethod)}
          <br />
          <small>{paymentStatus(order.details.paymentMethod)}</small>
        </p>
      )}
      {order.items.map((item) => (
        <div className="order-row" key={item.productId}>
          <span>
            {item.name} × {item.quantity}
          </span>
          <strong>{yen(item.lineTotalYen)}</strong>
        </div>
      ))}
      <div className="grand-total">
        <strong>合計（税込）</strong>
        <strong>{yen(order.totalYen)}</strong>
      </div>
    </article>
  );
}
