import { useState } from 'react';
import { yen } from '../api';
import { DataTable, Field, text } from './Common';

/** @param {{demo:import('./useDemo').Demo,operator?:boolean}} props */
export function SampleOrders({ demo, operator = false }) {
  const [selectedId, setSelectedId] = useState('SAMPLE-1001');
  const [filter, setFilter] = useState('すべて');
  const order = demo.state.orders.find((entry) => entry.id === selectedId);
  const visible = demo.state.orders.filter((entry) => filter === 'すべて' || entry.status === filter);
  /** @param {boolean} complete */
  function updatePickup(complete) {
    const expected = complete ? '受取準備完了' : '注文受付';
    const status = complete ? '引き渡し完了' : '受取準備完了';
    const timestamp = new Date().toISOString();
    const noticeId = crypto.randomUUID();
    demo.update((draft) => {
      const target = draft.orders.find((entry) => entry.id === selectedId);
      if (!target || target.status !== expected) return;
      target.status = status;
      if (complete) target.pickedUpAt = timestamp;
      else target.readyAt = timestamp;
      draft.notices.unshift({
        id: noticeId,
        audience: 'buyer',
        title: `${target.id}の${status}`,
        body: complete
          ? `${target.pickupStore}で商品をお渡ししました。`
          : `商品をご用意しました。${target.pickupStore}（${target.pickupAddress}）へお越しください。営業時間：${target.pickupHours}`,
        read: false,
      });
    }, `${status}と購入者通知を更新しました。`);
  }
  return (
    <>
      <section className="workspace-card">
        <h2>{operator ? 'サイト全体の注文' : '受注一覧'}</h2>
        <label>
          注文状態
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>すべて</option>
            <option>注文受付</option>
            <option>受取準備完了</option>
            <option>引き渡し完了</option>
            <option>キャンセル</option>
          </select>
        </label>
        <DataTable
          headers={['注文番号', '購入者', '商品', '金額', '状態', '操作']}
          rows={visible.map((entry) => [
            entry.id,
            entry.buyer,
            `${entry.product} × ${entry.quantity}`,
            yen(entry.total),
            entry.status,
            <button key={entry.id} onClick={() => setSelectedId(entry.id)}>
              詳細
            </button>,
          ])}
        />
      </section>
      {order && (
        <section className="workspace-card">
          <h2>注文詳細 {order.id}</h2>
          <p>
            {order.date} · {order.buyer} · {order.payment}
          </p>
          <p>
            {order.product} × {order.quantity} / {yen(order.total)}
          </p>
          <PickupDetails order={order} />
          <p>状態：{order.status}</p>
          <div className="workspace-form">
            <button
              className="primary-button"
              disabled={order.status !== '注文受付'}
              onClick={() => updatePickup(false)}
            >
              受取準備完了にする
            </button>
            <button
              className="primary-button"
              disabled={order.status !== '受取準備完了'}
              onClick={() => updatePickup(true)}
            >
              引き渡し完了にする
            </button>
          </div>
        </section>
      )}
    </>
  );
}

/** @param {{demo:import('./useDemo').Demo,orderId:string,eligible?:boolean}} props */
export function CancelRequest({ demo, orderId, eligible = true }) {
  const [open, setOpen] = useState(false);
  const existing = demo.state.cancellations.find((entry) => entry.orderId === orderId);
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function request(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    demo.update((draft) => {
      draft.cancellations.push({ orderId, reason: text(data, 'reason'), status: '申請受付' });
    }, 'キャンセル申請を受け付けました。');
    setOpen(false);
  }
  return (
    <div className="mock-cancel">
      {existing && <p>キャンセル：{existing.status}</p>}
      {!eligible && <p>受取準備完了・引き渡し完了・キャンセル済みの注文は申請できません。</p>}
      {!existing && eligible && (
        <button className="text-button" onClick={() => setOpen(!open)}>
          キャンセルを申請
        </button>
      )}
      {open && (
        <form className="workspace-form" onSubmit={request}>
          <Field label="申請理由" name="reason" />
          <button>申請を確定</button>
          <button type="button" onClick={() => setOpen(false)}>
            取消
          </button>
        </form>
      )}
    </div>
  );
}

/** @param {{demo:import('./useDemo').Demo}} props */
export function SalesPage({ demo }) {
  let sales = 0;
  for (const order of demo.state.orders) {
    if (order.status !== 'キャンセル') sales += order.total;
  }
  const fee = Math.floor((sales * demo.state.feePercent) / 100);
  return (
    <>
      <div className="workspace-metrics">
        <section>
          <small>注文総額</small>
          <strong>{yen(sales)}</strong>
        </section>
        <section>
          <small>販売手数料 {demo.state.feePercent}%</small>
          <strong>{yen(fee)}</strong>
        </section>
        <section>
          <small>精算対象額</small>
          <strong>{yen(sales - fee)}</strong>
        </section>
      </div>
      <section className="workspace-card">
        <h2>注文ごとの売上</h2>
        <DataTable
          headers={['注文番号', '日付', '状態', '注文総額']}
          rows={demo.state.orders.map((order) => [order.id, order.date, order.status, yen(order.total)])}
        />
      </section>
      <section className="workspace-card">
        <h2>精算状況</h2>
        <DataTable
          headers={['対象月', '対象額', '状態']}
          rows={demo.state.settlements.map((entry) => [entry.id, yen(sales - fee), entry.status])}
        />
      </section>
    </>
  );
}

/** @param {{order:import('./demoData').DemoState['orders'][number]}} props */
export function PickupDetails({ order }) {
  return (
    <>
      <p>受取店舗：{order.pickupStore}</p>
      <p>所在地：{order.pickupAddress}</p>
      <p>営業時間：{order.pickupHours}</p>
      <p>準備完了日時：{order.readyAt ? new Date(order.readyAt).toLocaleString('ja-JP') : '未完了'}</p>
      <p>引き渡し完了日時：{order.pickedUpAt ? new Date(order.pickedUpAt).toLocaleString('ja-JP') : '未完了'}</p>
    </>
  );
}
