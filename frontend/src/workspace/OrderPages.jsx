import { yen } from '../api';
import { useResource } from './useResource';
import { ResourceStatus } from './ResourceView';
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
