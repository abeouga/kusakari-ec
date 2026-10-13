import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Dialog } from './Dialog';
import { OrderSummary } from './Cart';
import { DeliveryForm } from './DeliveryForm';
import { CancelRequest } from '../workspace/OrderPages';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onClose:()=>void,demo?:import('../workspace/useDemo').Demo}} props */
export function Orders({ shop, onClose, demo }) {
  const [editing, setEditing] = useState('');
  const [deleting, setDeleting] = useState('');
  /** @param {string} id @param {import('../types').DeliveryDetails} details */
  async function save(id, details) {
    const saved = await shop.updateOrder(id, details);
    if (saved) setEditing('');
    return saved;
  }
  /** @param {string} id */
  async function remove(id) {
    const saved = await shop.deleteOrder(id);
    if (saved) setDeleting('');
  }
  return (
    <Dialog title="注文履歴" onClose={onClose} wide>
      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      {shop.notice && (
        <p className="success-text" role="status">
          {shop.notice}
        </p>
      )}
      {shop.orders.length === 0 && (
        <div className="empty">
          <PackageCheck size={36} />
          <h3>注文履歴はまだありません。</h3>
          <p>このブラウザーで確定したデモ注文が表示されます。</p>
        </div>
      )}
      {shop.orders.map((order) => (
        <section className="history-entry" key={order.id} data-testid={`order-${order.id}`}>
          <OrderSummary order={order} />
          <p>注文状態：デモ注文受付済み（実決済・発送なし）</p>
          {demo && <CancelRequest demo={demo} orderId={order.id} />}
          <div className="form-actions">
            <button className="secondary-button" disabled={shop.busy} onClick={() => setEditing(order.id)}>
              注文情報を編集
            </button>
            <button className="text-button danger-text" disabled={shop.busy} onClick={() => setDeleting(order.id)}>
              履歴から削除
            </button>
          </div>
          {editing === order.id && (
            <>
              <DeliveryForm
                details={order.details}
                busy={shop.busy}
                lockedMethod
                onSave={(details) => save(order.id, details)}
              />
              <button className="text-button" onClick={() => setEditing('')}>
                編集を閉じる
              </button>
            </>
          )}
          {deleting === order.id && (
            <div className="delete-confirm">
              <p>この注文を履歴から非表示にします。注文の取消・在庫の返却は行いません。</p>
              <button className="secondary-button" disabled={shop.busy} onClick={() => remove(order.id)}>
                履歴削除を確定
              </button>
              <button className="text-button" onClick={() => setDeleting('')}>
                戻る
              </button>
            </div>
          )}
        </section>
      ))}
    </Dialog>
  );
}
