import { useState } from 'react';
import { ShoppingCart, MapPin, Minus, Plus, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { yen } from '../api';
import { DeliveryForm } from './DeliveryForm';
import { DeliverySummary } from './DeliverySummary';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onStores:()=>void}} props */
export function Cart({ shop, onStores }) {
  const [confirming, setConfirming] = useState(false);
  const cart = shop.cart;
  if (shop.lastOrder) {
    return (
      <section className="cart-content cart-complete">
        <h1>注文を保存しました</h1>
        <div className="order-success">
          <CheckCircle2 size={42} />
          <h3>植物を迎える準備ができました。</h3>
        </div>
        <OrderSummary order={shop.lastOrder} />
        <a className="primary-button full" href="/#plants">
          お買い物を続ける
        </a>
      </section>
    );
  }
  if (!cart) {
    return (
      <section className="cart-content cart-empty-state">
        <p className="eyebrow">YOUR SHOPPING CART</p>
        <h1>ショッピングカート</h1>
        {shop.error && (
          <>
            <p className="error" role="alert">
              {shop.error}
            </p>
            <a className="primary-button" href="/#plants">
              植物を探す
            </a>
          </>
        )}
        {!shop.error && <p role="status">カートを読み込んでいます。</p>}
      </section>
    );
  }
  if (cart.items.length === 0) {
    return (
      <section className="cart-content cart-empty-state">
        <p className="eyebrow">YOUR SHOPPING CART</p>
        <h1>ショッピングカート</h1>
        {shop.error && (
          <p className="error" role="alert">
            {shop.error}
          </p>
        )}
        <div className="empty">
          <ShoppingCart size={40} />
          <h3>まだ植物が入っていません。</h3>
          <p>お気に入りのひと鉢を見つけてください。</p>
          <a className="primary-button" href="/#plants">
            植物を探す
          </a>
        </div>
      </section>
    );
  }
  let title = `ショッピングカート (${cart.itemCount})`;
  let checkoutLabel = '注文を確定する';
  if (confirming) title = '注文内容の確認';
  if (shop.busy) checkoutLabel = '保存中…';
  return (
    <section className="cart-content">
      <p className="eyebrow">YOUR SHOPPING CART</p>
      <h1>{title}</h1>
      <p className="cart-page-lead">商品と受取方法をご確認ください。</p>
      <ol className="step-list">
        <li>1 カート確認</li>
        <li>2 受取・配送</li>
        <li>3 注文確認</li>
      </ol>
      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      <div className="checkout-layout">
        <div>
          <div className="cart-store">
            <MapPin size={18} />
            <div>
              <small>店舗受け取り</small>
              <strong>{cart.storeName}</strong>
            </div>
            <button className="text-button" disabled={shop.busy} onClick={onStores}>
              変更
            </button>
          </div>
          <div className="cart-items">
            {cart.items.map((line) => (
              <article className="cart-line" key={line.product.id}>
                <img src={line.product.imageUrl} alt={line.product.name} />
                <div className="cart-line-main">
                  <h3>{line.product.name}</h3>
                  <p>{yen(line.product.priceYen)} / 1鉢</p>
                  {!line.available && <p className="error-text">在庫不足（現在 {line.product.stock} 点）</p>}
                  {!confirming && (
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
                  )}
                  {confirming && <p>数量：{line.quantity} 鉢</p>}
                </div>
                <div className="cart-line-end">
                  <strong>{yen(line.lineTotalYen)}</strong>
                  {!confirming && (
                    <button
                      className="icon-button"
                      aria-label={`${line.product.name}を削除`}
                      disabled={shop.busy}
                      onClick={() => shop.setQuantity(line.product.id, 0)}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!confirming && (
            <DeliveryForm
              key={cart.revision}
              details={cart.details}
              busy={shop.busy}
              onSave={shop.saveDetails}
              onReset={shop.clearDetails}
            />
          )}
          {confirming && <DeliverySummary details={cart.details} />}
        </div>
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
              <span>受取・配送料</span>
              <span>{yen(cart.shippingFeeYen)}</span>
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
              <button className="primary-button full" disabled={shop.busy || !cart.canCheckout} onClick={shop.checkout}>
                {checkoutLabel}
                <CheckCircle2 size={18} />
              </button>
              <button className="text-button back-button" disabled={shop.busy} onClick={() => setConfirming(false)}>
                カートに戻る
              </button>
            </>
          )}
          {!confirming && (
            <button
              className="primary-button full"
              disabled={shop.busy || !cart.canCheckout}
              onClick={() => setConfirming(true)}
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

/** @param {{order:import('../types').Order}} props */
export function OrderSummary({ order }) {
  return (
    <article className="order-summary">
      <div className="order-label">
        ORDER <span>{new Date(order.createdAt).toLocaleString('ja-JP')}</span>
      </div>
      <p className="order-id">注文番号：{order.id}</p>
      <p>{order.storeName}</p>
      <DeliverySummary details={order.details} />
      {order.items.map((item) => (
        <div className="order-row" key={item.productId}>
          <span>
            {item.name} × {item.quantity}
          </span>
          <strong>{yen(item.lineTotalYen)}</strong>
        </div>
      ))}
      <p className="fine-print">
        商品小計 {yen(order.subtotalYen)} / 受取・配送料 {yen(order.shippingFeeYen)}
      </p>
      <div className="grand-total">
        <strong>合計（税込）</strong>
        <strong>{yen(order.totalYen)}</strong>
      </div>
    </article>
  );
}
