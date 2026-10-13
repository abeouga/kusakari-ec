import { useState } from 'react';
import { yen } from '../api';
import { DataTable, Field, text } from './Common';

/** @param {{demo:import('./useDemo').Demo,operator?:boolean}} props */
export function SampleOrders({ demo, operator = false }) {
  const [selectedId, setSelectedId] = useState('SAMPLE-1001');
  const [filter, setFilter] = useState('すべて');
  const order = demo.state.orders.find((entry) => entry.id === selectedId);
  const visible = demo.state.orders.filter((entry) => filter === 'すべて' || entry.status === filter);
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function ship(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    demo.update((draft) => {
      const target = draft.orders.find((entry) => entry.id === selectedId);
      if (!target || target.status === 'キャンセル') return;
      target.carrier = text(data, 'carrier');
      target.tracking = text(data, 'tracking');
      target.shippedAt = text(data, 'shippedAt');
      target.status = '発送済み';
      draft.notices.unshift({
        id: crypto.randomUUID(),
        audience: 'buyer',
        title: `${target.id}を発送しました`,
        body: `${target.carrier} / 追跡番号 ${target.tracking}`,
        read: false,
      });
    }, '発送情報と購入者通知を更新しました。');
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
            <option>発送済み</option>
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
          <p>配送先：{order.address}</p>
          <p>状態：{order.status}</p>
          <form className="workspace-form" key={order.id} onSubmit={ship}>
            <Field label="発送日" name="shippedAt" type="date" value={order.shippedAt} />
            <Field label="配送会社" name="carrier" value={order.carrier} />
            <Field label="追跡番号" name="tracking" value={order.tracking} />
            <button className="primary-button" disabled={order.status === 'キャンセル'}>
              発送情報を登録
            </button>
          </form>
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
      {!eligible && <p>発送済み・取消済みの注文は申請できません。</p>}
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
