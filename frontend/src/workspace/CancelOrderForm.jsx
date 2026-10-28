import { useState } from 'react';
import { write } from './useResource';

const reasons = ['注文内容を間違えた', '受け取りに行けなくなった', '別の商品・店舗で購入する', 'その他'];
// The API accepts 500 characters for the combined "理由：詳細" text.
const maxDetailLength = 500 - Math.max(...reasons.map((item) => item.length)) - 1;

/** @param {{order:import('../types').Order,resource:ReturnType<typeof import('./useResource').useResource>}} props */
export function CancelOrderForm({ order, resource }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [agreed, setAgreed] = useState(false);
  if (order.status === 'CANCELLED' || order.status === 'COMPLETED' || order.status === 'DEMO_CONFIRMED') return null;
  if (order.status !== 'ACCEPTED')
    return (
      <p className="order-cancel-note">受取準備完了後はキャンセルを申請できません。受取店舗へお問い合わせください。</p>
    );
  if (order.cancellationStatus === 'PENDING')
    return <p className="order-cancel-note">キャンセルを申請中です。店舗の回答は通知一覧でもお知らせします。</p>;

  const needsDetail = reason === 'その他';
  const message = detail.trim() ? `${reason}：${detail.trim()}` : reason;
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function submit(event) {
    event.preventDefault();
    void resource.run(
      () => write(`/orders/${order.id}/cancellation`, 'POST', { reason: message }),
      'キャンセル申請を送信しました。',
    );
  }
  return (
    <details className="order-option order-cancel">
      <summary>注文のキャンセルを申請</summary>
      <form onSubmit={submit} aria-label="キャンセル申請">
        <p>店舗が申請を確認し、承認されるとキャンセルが確定して在庫が戻ります。却下される場合もあります。</p>
        <fieldset>
          <legend>キャンセル理由</legend>
          {reasons.map((item) => (
            <label key={item} className="order-radio">
              <input
                type="radio"
                name="reason"
                value={item}
                checked={reason === item}
                onChange={() => setReason(item)}
                required
              />
              {item}
            </label>
          ))}
        </fieldset>
        <label>
          詳細{needsDetail ? '（必須）' : '（任意）'}
          <textarea
            name="detail"
            value={detail}
            required={needsDetail}
            maxLength={maxDetailLength}
            onChange={(event) => setDetail(event.target.value)}
          />
        </label>
        <label className="order-radio">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} required />
          申請後は取り消せないことを確認しました
        </label>
        <button className="order-cancel-submit" disabled={resource.busy || !reason || !agreed}>
          キャンセルを申請
        </button>
      </form>
    </details>
  );
}
