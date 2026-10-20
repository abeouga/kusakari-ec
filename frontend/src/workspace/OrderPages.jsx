import { useState } from 'react';
import { yen } from '../api';
import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
/** @type {Record<string,string>} */
export const orderLabels = {
  ACCEPTED: '注文受付',
  READY: '受取準備完了',
  COMPLETED: '引き渡し完了',
  CANCELLED: 'キャンセル',
  DEMO_CONFIRMED: '旧注文',
};
/** @param {{order:import('../types').Order}} props */
export function PickupDetails({ order }) {
  return (
    <>
      <p>受取店舗：{order.storeName}</p>
      <p>
        {order.pickupAddress} / {order.pickupHours}
      </p>
      <p>準備完了日時：{order.readyAt ? new Date(order.readyAt).toLocaleString('ja-JP') : '未完了'}</p>
      <p>引き渡し完了日時：{order.pickedUpAt ? new Date(order.pickedUpAt).toLocaleString('ja-JP') : '未完了'}</p>
    </>
  );
}
/** @param {{order:import('../types').Order,resource:ReturnType<typeof useResource>,seller:boolean,readonly?:boolean}} props */
function OrderActions({ order, resource, seller, readonly = false }) {
  const pending = order.cancellationStatus === 'PENDING';
  const reason = order.cancellationReason;
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function request(event) {
    event.preventDefault();
    const input = values(event.currentTarget);
    void resource.run(() => write(`/orders/${order.id}/cancellation`, 'POST', input), 'キャンセル申請を保存しました。');
  }
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
    <>
      <p>注文状態：{orderLabels[order.status] || order.status}</p>
      {!readonly && !seller && (
        <details>
          <summary>購入履歴を非表示にする</summary>
          <p>この履歴だけを非表示にします。注文・在庫・出店者の受注記録は変更されません。</p>
          <button
            disabled={resource.busy}
            onClick={() => void resource.run(() => write(`/orders/${order.id}`, 'DELETE'), '履歴を非表示にしました。')}
          >
            非表示を確定
          </button>
        </details>
      )}
      {!readonly && !seller && order.status === 'ACCEPTED' && (
        <details>
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
      {reason && (
        <p>
          キャンセル申請：{reason} /{' '}
          {
            /** @type {Record<string,string>} */ ({ PENDING: '申請中', APPROVED: '承認', REJECTED: '却下' })[
              order.cancellationStatus
            ]
          }{' '}
          {order.cancellationResponse}
        </p>
      )}
      {!readonly && !seller && order.status === 'ACCEPTED' && !pending && (
        <form className="workspace-form" onSubmit={request}>
          <Input label="キャンセル理由" name="reason" maxLength={500} />
          <button disabled={resource.busy}>キャンセルを申請</button>
        </form>
      )}
      {!readonly && seller && pending && (
        <form className="workspace-form" onSubmit={decide}>
          <Input label="キャンセル回答" name="reason" required={false} maxLength={500} />
          <button name="decision" value="approve" disabled={resource.busy}>
            キャンセルを承認
          </button>
          <button name="decision" value="reject" disabled={resource.busy}>
            キャンセルを却下
          </button>
        </form>
      )}
      {!readonly && seller && ['ACCEPTED', 'READY'].includes(order.status) && (
        <button
          disabled={resource.busy || pending}
          onClick={() =>
            void resource.run(() =>
              write(`/seller/orders/${order.id}/status`, 'PUT', {
                expectedStatus: order.status,
                status: order.status === 'ACCEPTED' ? 'READY' : 'COMPLETED',
              }),
            )
          }
        >
          {order.status === 'ACCEPTED' ? '受取準備完了にする' : '引き渡し完了にする'}
        </button>
      )}
    </>
  );
}
/** @param {{storeId?:number,operator?:boolean,buyer?:boolean}} props */
export function OrderPage({ storeId, operator = false, buyer = false }) {
  const resource = useResource(buyer ? '/orders' : operator ? '/operator/orders' : `/seller/orders?storeId=${storeId}`);
  const [filter, setFilter] = useState('');
  const orders = /** @type {import('../types').Order[]} */ (resource.data ?? []);
  return (
    <>
      <ResourceStatus resource={resource} />
      <label>
        注文状態
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">すべて</option>
          {Object.entries(orderLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {resource.data && orders.length === 0 && <p>注文はありません。</p>}
      {orders
        .filter((o) => !filter || o.status === filter)
        .map((order) => (
          <section className="workspace-card" key={order.id} data-testid={`order-${order.id}`}>
            <h2>{order.id}</h2>
            <p>{new Date(order.createdAt).toLocaleString('ja-JP')}</p>
            {order.items.map((item) => (
              <p key={item.productId}>
                {item.name} × {item.quantity} / {yen(item.lineTotalYen)}
              </p>
            ))}
            <p>注文金額：{yen(order.totalYen)}</p>
            <PickupDetails order={order} />
            <OrderActions order={order} resource={resource} seller={!buyer} readonly={operator} />
          </section>
        ))}
    </>
  );
}
/** @param {{storeId:number}} props */
export function SalesPage({ storeId }) {
  const resource = useResource(`/seller/orders?storeId=${storeId}`);
  const orders = /** @type {import('../types').Order[]} */ (resource.data ?? []);
  const active = orders.filter((o) => o.status !== 'CANCELLED');
  return (
    <>
      <ResourceStatus resource={resource} />
      <section className="workspace-card">
        <h2>注文実績</h2>
        <p>
          注文数：{active.length}件 / キャンセル：{orders.length - active.length}件
        </p>
        <p>注文金額：{yen(active.reduce((sum, o) => sum + o.totalYen, 0))}</p>
        <p>決済・精算の記録は扱いません。</p>
        {orders.map((o) => (
          <p key={o.id}>
            {o.id} / {orderLabels[o.status] || o.status} / {yen(o.totalYen)}
          </p>
        ))}
      </section>
    </>
  );
}
