import { useState } from 'react';
import { Check, Mail, Phone, Search, Store, User } from 'lucide-react';
import { yen } from '../api';
import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { orderLabels, cancellationLabels } from './OrderPages';
import { Thumbnail } from './BuyerOrders';
import './buyer-orders.css';
import './pickup-orders.css';

/** @typedef {import('../types').Order} Order */
const cancelPending = (/** @type {Order} */ o) => o.cancellationStatus === 'PENDING';
/** Filters in the order a seller works through them; `match` decides membership. */
const filters = /** @type {[string,string,(o:Order)=>boolean][]} */ ([
  ['ACCEPTED', '準備待ち', (o) => o.status === 'ACCEPTED'],
  ['READY', '受け取り待ち', (o) => o.status === 'READY'],
  ['PENDING', 'キャンセル申請', cancelPending],
  ['COMPLETED', '引き渡し完了', (o) => o.status === 'COMPLETED'],
  ['CANCELLED', 'キャンセル', (o) => o.status === 'CANCELLED'],
  ['', 'すべて', () => true],
]);
/** Orders needing a decision come first; the API order (newest first) is kept within a group. */
const priority = (/** @type {Order} */ o) =>
  cancelPending(o) ? 0 : o.status === 'ACCEPTED' ? 1 : o.status === 'READY' ? 2 : 3;
const dateTime = (/** @type {string|null} */ value) => (value ? new Date(value).toLocaleString('ja-JP') : '');
const actions = {
  ACCEPTED: {
    button: '受取準備完了にする',
    hint: '商品を揃えたら、受取準備完了にして購入者へ通知します。',
    title: '受取準備完了の確認',
    confirm: '受取準備完了を確定',
    next: 'READY',
    done: '受取準備完了にし、購入者に通知しました。',
    body: '注文状態を「受取準備完了」に更新し、購入者に受け取りの準備ができたことを通知します。',
  },
  READY: {
    button: '引き渡し完了にする',
    hint: '来店した購入者に注文番号と受取人名を確認して引き渡します。',
    title: '引き渡し完了の確認',
    confirm: '引き渡し完了を確定',
    next: 'COMPLETED',
    done: '引き渡し完了にしました。',
    body: '購入者が商品を受け取ったことを確認しましたか。注文状態を「引き渡し完了」に更新します。',
  },
};

/** @param {{order:Order}} props */
function Progress({ order }) {
  const steps = [
    ['注文受付', order.createdAt],
    ['受取準備完了', order.readyAt],
    ['引き渡し完了', order.pickedUpAt],
  ];
  return (
    <ol className="pickup-progress" aria-label="受け取りの進み具合">
      {steps.map(([label, at]) => (
        <li key={label} className={at ? 'is-done' : ''}>
          <span className="pickup-progress-dot" aria-hidden="true">
            {at && <Check size={12} />}
          </span>
          <span>{label}</span>
          <span className="order-muted">{at ? dateTime(at) : '未完了'}</span>
        </li>
      ))}
    </ol>
  );
}

/** @param {{order:Order,resource:ReturnType<typeof useResource>}} props */
function CancellationDecision({ order, resource }) {
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function decide(event) {
    event.preventDefault();
    const input = values(event.currentTarget);
    const button = /** @type {HTMLButtonElement} */ (/** @type {SubmitEvent} */ (event.nativeEvent).submitter);
    void resource.run(() =>
      write(`/seller/orders/${order.id}/cancellation`, 'PUT', {
        approved: button.value === 'approve',
        reason: input.reason,
      }),
    );
  }
  return (
    <form className="pickup-cancel" onSubmit={decide}>
      <p>
        <strong>キャンセル申請があります：</strong>
        {order.cancellationReason}
      </p>
      <Input label="キャンセル回答" name="reason" required={false} maxLength={500} />
      <div className="pickup-cancel-buttons">
        <button name="decision" value="approve" disabled={resource.busy}>
          キャンセルを承認
        </button>
        <button name="decision" value="reject" disabled={resource.busy}>
          キャンセルを却下
        </button>
      </div>
    </form>
  );
}

/** @param {{order:Order,resource:ReturnType<typeof useResource>,operator:boolean}} props */
function PickupCard({ order, resource, operator }) {
  const [confirming, setConfirming] = useState(/** @type {'ACCEPTED'|'READY'|''} */ (''));
  const pending = cancelPending(order);
  const action = order.status === 'ACCEPTED' || order.status === 'READY' ? actions[order.status] : null;
  const dialog = confirming ? actions[confirming] : null;
  const { recipientName, recipientPhone, contactEmail } = order.details;
  const closed = order.status === 'COMPLETED' || order.status === 'CANCELLED';
  const body = (
    <div className="pickup-card-body">
      <ul className="pickup-lines" aria-label="注文商品">
        {order.items.map((line) => (
          <li key={line.productId}>
            <Thumbnail line={line} />
            <span>
              <strong>{line.name}</strong>
              <span className="order-muted">SKU {line.sku}</span>
            </span>
            <span className="pickup-quantity">× {line.quantity}</span>
            <span>{yen(line.lineTotalYen)}</span>
          </li>
        ))}
      </ul>
      <div className="pickup-side">
        <dl className="pickup-recipient" aria-label="受取人">
          <dt>
            <User size={14} aria-hidden="true" />
            <span className="visually-hidden">受取人</span>
          </dt>
          <dd>{recipientName || '未入力'}</dd>
          <dt>
            <Phone size={14} aria-hidden="true" />
            <span className="visually-hidden">電話番号</span>
          </dt>
          <dd>{recipientPhone ? <a href={`tel:${recipientPhone}`}>{recipientPhone}</a> : '未入力'}</dd>
          <dt>
            <Mail size={14} aria-hidden="true" />
            <span className="visually-hidden">連絡先メール</span>
          </dt>
          <dd>{contactEmail || '未入力'}</dd>
        </dl>
        <Progress order={order} />
      </div>
    </div>
  );
  return (
    <section className={`pickup-card${closed ? ' is-closed' : ''}`} data-testid={`order-${order.id}`}>
      <header className="pickup-card-head">
        <div>
          <h2>{order.id}</h2>
          <span className="order-muted">
            <time dateTime={order.createdAt}>{dateTime(order.createdAt)}</time>
            {operator && (
              <>
                {' ・ '}
                <Store size={13} aria-hidden="true" /> {order.storeName}
              </>
            )}
          </span>
        </div>
        <span className={`order-status order-status-${order.status.toLowerCase()}`}>
          <span className="visually-hidden">注文状態：</span>
          {orderLabels[order.status] || order.status}
        </span>
        {pending && <span className="order-status order-status-pending">キャンセル申請中</span>}
        <strong className="pickup-card-total">{yen(order.totalYen)}</strong>
      </header>
      {closed ? (
        <details className="pickup-card-details">
          <summary>
            {order.items.map((line) => `${line.name} × ${line.quantity}`).join('、')}
            <span className="order-muted">詳細</span>
          </summary>
          {body}
        </details>
      ) : (
        body
      )}
      {order.cancellationReason && !pending && (
        <p className="order-cancel-result">
          キャンセル申請（{cancellationLabels[order.cancellationStatus]}）：{order.cancellationReason}
          {order.cancellationResponse && <> / 回答：{order.cancellationResponse}</>}
        </p>
      )}
      {!operator && pending && <CancellationDecision order={order} resource={resource} />}
      {!operator && action && (
        <footer className="pickup-card-action">
          <p className="order-muted">{pending ? 'キャンセル申請に回答してから進めてください。' : action.hint}</p>
          <button
            className="primary-button"
            disabled={resource.busy || pending}
            onClick={() => setConfirming(/** @type {'ACCEPTED'|'READY'} */ (order.status))}
          >
            {action.button}
          </button>
        </footer>
      )}
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          confirmLabel={dialog.confirm}
          busy={resource.busy}
          onCancel={() => setConfirming('')}
          onConfirm={async () => {
            // The status seen when the dialog opened is sent; a changed order is rejected (EC-S09/S10 4a).
            await resource.run(
              () =>
                write(`/seller/orders/${order.id}/status`, 'PUT', { expectedStatus: confirming, status: dialog.next }),
              dialog.done,
            );
            setConfirming('');
          }}
        >
          <p>注文番号：{order.id}</p>
          <p>受取人：{recipientName || '未入力'}</p>
          <p>{dialog.body}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** @param {{storeId:number,operator?:boolean}} props */
export function OrderPage({ storeId, operator = false }) {
  const resource = useResource(operator ? '/operator/orders' : `/seller/orders?storeId=${storeId}`);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const orders = /** @type {Order[]} */ (resource.data ?? []);
  const match = filters.find(([key]) => key === filter)?.[2] ?? (() => true);
  const words = query.trim().toLowerCase();
  const shown = orders
    .filter(match)
    .filter((o) => !words || `${o.id} ${o.details.recipientName}`.toLowerCase().includes(words))
    .sort((a, b) => priority(a) - priority(b));
  return (
    <div className="pickup-orders">
      <ResourceStatus resource={resource} />
      <div className="pickup-toolbar">
        <div className="pickup-filters" role="group" aria-label="注文状態で絞り込む">
          {filters.map(([key, label, test]) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
              <span className="pickup-count">{orders.filter(test).length}</span>
            </button>
          ))}
        </div>
        <label className="pickup-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">注文番号・受取人で検索</span>
          <input
            type="search"
            value={query}
            placeholder="注文番号・受取人で検索"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {resource.data && shown.length === 0 && <p className="order-empty">該当する注文はありません。</p>}
      {shown.map((order) => (
        <PickupCard key={order.id} order={order} resource={resource} operator={operator} />
      ))}
    </div>
  );
}
