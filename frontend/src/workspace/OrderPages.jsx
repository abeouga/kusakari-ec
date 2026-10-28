import { useState } from 'react';
import { yen } from '../api';
import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
import { ConfirmDialog } from '../components/ConfirmDialog';
/** @type {Record<string,string>} */
export const orderLabels = {
  ACCEPTED: '注文受付',
  READY: '受取準備完了',
  COMPLETED: '引き渡し完了',
  CANCELLED: 'キャンセル',
  DEMO_CONFIRMED: '旧注文',
};
/** @type {Record<string,string>} */
export const cancellationLabels = { PENDING: '申請中', APPROVED: '承認', REJECTED: '却下' };
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
/** @param {{order:import('../types').Order,resource:ReturnType<typeof useResource>,readonly?:boolean}} props */
function OrderActions({ order, resource, readonly = false }) {
  const pending = order.cancellationStatus === 'PENDING';
  const [confirming, setConfirming] = useState('');
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
      {order.cancellationReason && (
        <p>
          キャンセル申請：{order.cancellationReason} / {cancellationLabels[order.cancellationStatus]}{' '}
          {order.cancellationResponse}
        </p>
      )}
      {!readonly && pending && (
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
      {!readonly && ['ACCEPTED', 'READY'].includes(order.status) && (
        <button disabled={resource.busy || pending} onClick={() => setConfirming(order.status)}>
          {order.status === 'ACCEPTED' ? '受取準備完了にする' : '引き渡し完了にする'}
        </button>
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming === 'ACCEPTED' ? '受取準備完了の確認' : '引き渡し完了の確認'}
          confirmLabel={confirming === 'ACCEPTED' ? '受取準備完了を確定' : '引き渡し完了を確定'}
          busy={resource.busy}
          onCancel={() => setConfirming('')}
          onConfirm={async () => {
            // The status seen when the dialog opened is sent; a changed order is rejected (EC-S09/S10 4a).
            await resource.run(
              () =>
                write(`/seller/orders/${order.id}/status`, 'PUT', {
                  expectedStatus: confirming,
                  status: confirming === 'ACCEPTED' ? 'READY' : 'COMPLETED',
                }),
              confirming === 'ACCEPTED' ? '受取準備完了にし、購入者に通知しました。' : '引き渡し完了にしました。',
            );
            setConfirming('');
          }}
        >
          <p>注文番号：{order.id}</p>
          <p>
            {confirming === 'ACCEPTED'
              ? '注文状態を「受取準備完了」に更新し、購入者に受け取りの準備ができたことを通知します。'
              : '購入者が商品を受け取ったことを確認しましたか。注文状態を「引き渡し完了」に更新します。'}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
/** @param {{storeId:number,operator?:boolean}} props */
export function OrderPage({ storeId, operator = false }) {
  const resource = useResource(operator ? '/operator/orders' : `/seller/orders?storeId=${storeId}`);
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
            <OrderActions order={order} resource={resource} readonly={operator} />
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
        {resource.data && orders.length === 0 && <p>この店舗の注文はまだありません。</p>}
        {orders.map((o) => (
          <p key={o.id}>
            {o.id} / {orderLabels[o.status] || o.status} / {yen(o.totalYen)}
          </p>
        ))}
      </section>
    </>
  );
}
