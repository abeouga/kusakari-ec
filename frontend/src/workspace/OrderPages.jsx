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
