import { yen } from '../api';
import { useResource } from './useResource';
import { ResourceStatus } from './ResourceView';
import { paymentLabel, paymentStatusLabels, refundStatusLabels } from '../payment';
/** @type {Record<string,string>} */
export const orderLabels = {
  PENDING_PAYMENT: '支払い待ち',
  ACCEPTED: '注文受付',
  READY: '受取準備完了',
  COMPLETED: '引き渡し完了',
  CANCELLED: 'キャンセル',
  DEMO_CONFIRMED: '旧注文',
};
/** @type {Record<string,string>} */
export const cancellationLabels = { PENDING: '申請中', APPROVED: '承認', REJECTED: '却下' };
/**
 * 支払方法と、カードの支払いの状態・返金の状態（#132・#133）。購入者・店舗・運営の注文の画面で共通。
 * @param {{order:import('../types').Order}} props
 */
export function PaymentState({ order }) {
  return (
    <span className="order-payment-state" data-testid="payment-state">
      お支払い方法：{paymentLabel(order.details?.paymentMethod)}
      {order.paymentStatus && (
        <span className={`payment-badge payment-${order.paymentStatus.toLowerCase()}`}>
          {paymentStatusLabels[order.paymentStatus] || order.paymentStatus}
        </span>
      )}
      {order.refundStatus && (
        <span
          className={`payment-badge refund-${order.refundStatus.toLowerCase()}`}
          role={order.refundStatus === 'FAILED' ? 'alert' : undefined}
        >
          {refundStatusLabels[order.refundStatus] || order.refundStatus}
        </span>
      )}
    </span>
  );
}
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
/** @param {{storeId:number}} props */
export function SalesPage({ storeId }) {
  const resource = useResource(`/seller/orders?storeId=${storeId}`);
  const orders = /** @type {import('../types').Order[]} */ (resource.data ?? []);
  const active = orders.filter((o) => o.status !== 'CANCELLED');
  // Issue #14: a request stays an active order until the seller approves it, but is shown on its own.
  const pending = active.filter((o) => o.cancellationStatus === 'PENDING').length;
  return (
    <>
      <ResourceStatus resource={resource} />
      <section className="workspace-card">
        <h2>注文実績</h2>
        <p>
          注文数：{active.length}件 / キャンセル：{orders.length - active.length}件 / キャンセル申請中：{pending}件
        </p>
        <p>注文金額：{yen(active.reduce((sum, o) => sum + o.totalYen, 0))}</p>
        <p>精算の記録は扱いません。カードの支払い・返金の状態は注文ごとに表示します。</p>
        {resource.data && orders.length === 0 && <p>この店舗の注文はまだありません。</p>}
        {orders.map((o) => (
          <p key={o.id}>
            {o.id} / {orderLabels[o.status] || o.status}
            {o.cancellationStatus === 'PENDING' && `（キャンセル${cancellationLabels.PENDING}）`} / {yen(o.totalYen)}
          </p>
        ))}
      </section>
    </>
  );
}
