import { useState } from 'react';
import { yen } from '../api';
import { paymentLabel } from '../payment';
import { useResource } from './useResource';
import { ResourceStatus } from './ResourceView';
import { DataTable } from './Common';
import { orderLabels, cancellationLabels } from './OrderPages';
import './buyer-orders.css';
import './pickup-orders.css';

/**
 * @typedef {{orderId:string, createdAt:string, status:string, cancellationStatus:string, paymentMethod:string,
 *   totalYen:number, commissionRateBp:number, commissionYen:number, netYen:number, counted:boolean}} SalesRow
 * @typedef {{orderCount:number, pendingPaymentCount:number, cancelledCount:number, cancellationPendingCount:number,
 *   totalYen:number, commissionYen:number, netYen:number}} SalesTotals
 * @typedef {{storeId:number, storeName:string, closedAt:string|null, orders:SalesRow[], totals:SalesTotals}} Report
 * @typedef {{id:number, name:string, closedAt:string|null}} SalesStore
 */

/** 800 (1/10000) -> "8%" */
export const rateLabel = (/** @type {number} */ bp) => `${bp / 100}%`;
const dateTime = (/** @type {string} */ value) => new Date(value).toLocaleString('ja-JP');

/**
 * Issue #130: one store's sales, one row per order, with the commission stored on each order. Read-only.
 * @param {{storeId:number, operator?:boolean}} props
 */
export function SalesReport({ storeId, operator = false }) {
  const resource = useResource(operator ? `/operator/stores/${storeId}/sales` : `/seller/stores/${storeId}/sales`);
  const report = /** @type {Report|null} */ (resource.data);
  if (!report) return <ResourceStatus resource={resource} />;
  const { totals } = report;
  return (
    <section className="workspace-card sales-report" data-testid="sales-report">
      <ResourceStatus resource={resource} />
      <h2>
        {report.storeName}
        {report.closedAt && <span className="order-status order-status-cancelled">閉鎖済み</span>}
      </h2>
      {report.closedAt && (
        <p role="note">
          {dateTime(report.closedAt)}に閉鎖した店舗です。注文実績は読み取り専用で、期限なく確認できます。
        </p>
      )}
      <p data-testid="sales-counts">
        注文数：{totals.orderCount}件 / 支払い待ち：{totals.pendingPaymentCount}件 / キャンセル：
        {totals.cancelledCount}件 / キャンセル申請中：{totals.cancellationPendingCount}件
      </p>
      <dl className="sales-totals" data-testid="sales-totals">
        <dt>注文金額</dt>
        <dd>{yen(totals.totalYen)}</dd>
        <dt>販売手数料</dt>
        <dd>{yen(totals.commissionYen)}</dd>
        <dt>差引額</dt>
        <dd>{yen(totals.netYen)}</dd>
      </dl>
      <p className="order-muted">
        販売手数料は、注文したときの率（現在は全店舗一律）で注文ごとに計算し、1円未満を切り捨てた額です。表示だけで、請求・精算は行いません。キャンセルの注文は手数料なし、支払い待ちの注文は合計に含めません。
      </p>
      {report.orders.length === 0 ? (
        <p>この店舗の注文はまだありません。</p>
      ) : (
        <DataTable
          headers={['注文番号', '注文日時', '状態', '支払方法', '注文金額', '手数料率', '販売手数料', '差引額']}
          rows={report.orders.map((o) => [
            o.orderId,
            dateTime(o.createdAt),
            `${orderLabels[o.status] || o.status}${
              o.status !== 'CANCELLED' && o.cancellationStatus === 'PENDING'
                ? `（キャンセル${cancellationLabels.PENDING}）`
                : ''
            }`,
            paymentLabel(o.paymentMethod),
            yen(o.totalYen),
            rateLabel(o.commissionRateBp),
            o.status === 'CANCELLED' ? '手数料なし' : yen(o.commissionYen),
            o.status === 'CANCELLED' ? '—' : yen(o.netYen),
          ])}
        />
      )}
    </section>
  );
}

/**
 * The seller's sales page: the store chosen above the page, and closed stores the account may still read
 * (they may be missing from the store choice because their staff were released, issue #79).
 * @param {{storeId:number|null}} props
 */
export function SalesPage({ storeId }) {
  const stores = useResource('/seller/sales/stores');
  const [picked, setPicked] = useState(/** @type {number|null} */ (null));
  if (!stores.data) return <ResourceStatus resource={stores} />;
  const list = /** @type {SalesStore[]} */ (stores.data);
  const chosen = list.find((s) => s.id === storeId);
  const closed = list.filter((s) => s.closedAt && s.id !== storeId);
  const target = picked ?? chosen?.id ?? null;
  return (
    <>
      {closed.length > 0 && (
        <label className="sales-store-select">
          表示する店舗
          <select value={target ?? ''} onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : null)}>
            {chosen ? (
              <option value={chosen.id}>{chosen.name}</option>
            ) : (
              <option value="">店舗を選んでください</option>
            )}
            <optgroup label="閉鎖した店舗">
              {closed.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（閉鎖済み）
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      )}
      {target ? (
        <SalesReport key={target} storeId={target} />
      ) : (
        <section className="workspace-card">
          <p role="note">
            {closed.length > 0
              ? '選択中の店舗の注文実績を見る権限がありません。閉鎖した店舗は上の欄から選べます。'
              : '選択中の店舗の注文実績を見る権限がありません。'}
          </p>
        </section>
      )}
    </>
  );
}
