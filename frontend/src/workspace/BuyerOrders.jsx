import { useState } from 'react';
import { ChevronDown, Sprout, Store } from 'lucide-react';
import { yen } from '../api';
import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
import { orderLabels, cancellationLabels, PickupDetails } from './OrderPages';
import { CancelOrderForm } from './CancelOrderForm';
import './buyer-orders.css';

const filters = [
  ['', 'すべて'],
  ['ACCEPTED', '注文受付'],
  ['READY', '受取準備完了'],
  ['COMPLETED', '引き渡し完了'],
  ['CANCELLED', 'キャンセル'],
];
const maxThumbnails = 4;

/** @param {{line:import('../types').OrderLine,size?:'small'|'large'}} props */
export function Thumbnail({ line, size = 'small' }) {
  const className = `order-thumb order-thumb-${size}`;
  if (!line.imageUrl)
    return (
      <span className={`${className} order-thumb-empty`} aria-hidden="true">
        <Sprout size={size === 'large' ? 26 : 18} />
      </span>
    );
  return <img className={className} src={line.imageUrl} alt={size === 'large' ? line.name : ''} loading="lazy" />;
}

/** @param {{order:import('../types').Order,resource:ReturnType<typeof useResource>}} props */
function OrderBody({ order, resource }) {
  return (
    <div className="order-card-body">
      <ul className="order-lines" aria-label="注文した商品">
        {order.items.map((line) => (
          <li key={line.productId}>
            <Thumbnail line={line} size="large" />
            <div>
              <strong>{line.name}</strong>
              <span className="order-muted">SKU {line.sku}</span>
              <span className="order-muted">
                {yen(line.unitPriceYen)} × {line.quantity}
              </span>
            </div>
            <span className="order-line-total">{yen(line.lineTotalYen)}</span>
          </li>
        ))}
      </ul>
      <dl className="order-summary">
        <dt>小計</dt>
        <dd>{yen(order.subtotalYen)}</dd>
        <dt>店舗受け取り</dt>
        <dd>{yen(order.shippingFeeYen)}</dd>
        <dt>合計</dt>
        <dd>{yen(order.totalYen)}</dd>
      </dl>
      <section className="order-pickup">
        <h3>受け取り</h3>
        <PickupDetails order={order} />
      </section>
      {order.cancellationReason && order.cancellationStatus !== 'PENDING' && (
        <p className="order-cancel-result" role="note">
          キャンセル申請（{cancellationLabels[order.cancellationStatus]}）：{order.cancellationReason}
          {order.cancellationResponse && <> / 店舗からの回答：{order.cancellationResponse}</>}
        </p>
      )}
      {order.status === 'ACCEPTED' && (
        <details className="order-option">
          <summary>受取連絡先を編集</summary>
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              const input = values(event.currentTarget);
              void resource.run(() => write(`/orders/${order.id}`, 'PUT', input));
            }}
          >
            <Input label="受取人氏名" name="recipientName" value={order.details.recipientName} required={false} />
            <Input label="電話番号" name="recipientPhone" value={order.details.recipientPhone} required={false} />
            <Input
              label="連絡先メール"
              name="contactEmail"
              type="email"
              value={order.details.contactEmail}
              required={false}
            />
            <button disabled={resource.busy}>連絡先を保存</button>
          </form>
        </details>
      )}
      <CancelOrderForm order={order} resource={resource} />
      <details className="order-option">
        <summary>購入履歴を非表示にする</summary>
        <p>この履歴だけを非表示にします。注文・在庫・出店者の受注記録は変更されません。</p>
        <button
          disabled={resource.busy}
          onClick={() => void resource.run(() => write(`/orders/${order.id}`, 'DELETE'), '履歴を非表示にしました。')}
        >
          非表示を確定
        </button>
      </details>
    </div>
  );
}

/** @param {{order:import('../types').Order,open:boolean,onToggle:()=>void,resource:ReturnType<typeof useResource>}} props */
function OrderCard({ order, open, onToggle, resource }) {
  const quantity = order.items.reduce((sum, line) => sum + line.quantity, 0);
  const hidden = order.items.length - maxThumbnails;
  const bodyId = `order-body-${order.id}`;
  return (
    <article className={`order-card${open ? ' is-open' : ''}`} data-testid={`order-${order.id}`}>
      <button className="order-card-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="order-card-meta">
          <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString('ja-JP')}</time>
          <span className={`order-status order-status-${order.status.toLowerCase()}`}>
            {orderLabels[order.status] || order.status}
          </span>
          {order.cancellationStatus === 'PENDING' && (
            <span className="order-status order-status-pending">キャンセル申請中</span>
          )}
        </span>
        <span className="order-card-thumbs" aria-hidden="true">
          {order.items.slice(0, maxThumbnails).map((line) => (
            <Thumbnail key={line.productId} line={line} />
          ))}
          {hidden > 0 && <span className="order-thumb order-thumb-small order-thumb-more">+{hidden}</span>}
        </span>
        <span className="order-card-text">
          <strong>
            {order.items[0]?.name}
            {order.items.length > 1 && ` ほか${order.items.length - 1}点`}
          </strong>
          <span className="order-muted">
            <Store size={14} aria-hidden="true" /> {order.storeName} ・ {quantity}個 ・ 注文番号 {order.id}
          </span>
        </span>
        <span className="order-card-total">{yen(order.totalYen)}</span>
        <ChevronDown className="order-card-chevron" size={20} aria-hidden="true" />
      </button>
      {open && (
        <div id={bodyId}>
          <OrderBody order={order} resource={resource} />
        </div>
      )}
    </article>
  );
}

export function BuyerOrders() {
  const resource = useResource('/orders');
  const [filter, setFilter] = useState('');
  const [openId, setOpenId] = useState('');
  const orders = /** @type {import('../types').Order[]} */ (resource.data ?? []);
  const shown = orders.filter((o) => !filter || o.status === filter);
  return (
    <div className="buyer-orders">
      <ResourceStatus resource={resource} />
      <div className="order-filters" role="group" aria-label="注文状態で絞り込む">
        {filters.map(([key, label]) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {resource.data && shown.length === 0 && <p className="order-empty">注文はありません。</p>}
      {shown.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          open={openId === order.id}
          onToggle={() => setOpenId(openId === order.id ? '' : order.id)}
          resource={resource}
        />
      ))}
    </div>
  );
}
