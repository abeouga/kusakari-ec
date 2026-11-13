import { useState } from 'react';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { stateOf } from './SellerStores';

/** @typedef {import('./SellerStores').StoreProfile} StoreProfile */
/** @typedef {{kind:'enabled'|'close'|'reopen'|'cancel-orders',store:StoreProfile}} Pending */

/** @type {Record<Pending['kind'],{title:string,confirm:string,done:string}>} */
const actions = {
  enabled: { title: '利用状況変更の確認', confirm: '変更を確定', done: '店舗の利用状況を変更しました。' },
  close: {
    title: '店舗の閉鎖の確認',
    confirm: '閉鎖を始める',
    done: '閉鎖を始めました。新しい注文の受付を止めました。',
  },
  reopen: { title: '閉鎖の取り消しの確認', confirm: '閉鎖を取り消す', done: '閉鎖を取り消しました。' },
  'cancel-orders': {
    title: '未完了の注文のまとめてキャンセルの確認',
    confirm: 'まとめてキャンセルを確定',
    done: '未完了の注文をキャンセルしました。カードで支払い済みの注文は返金します。',
  },
};

/** @param {Pending} pending @param {string} reason */
function send({ kind, store }, reason) {
  if (kind === 'enabled') return write(`/operator/stores/${store.id}/enabled`, 'PUT', { enabled: !store.enabled });
  if (kind === 'close') return write(`/operator/stores/${store.id}/closure`, 'POST');
  if (kind === 'reopen') return write(`/operator/stores/${store.id}/closure`, 'DELETE');
  return write(`/operator/stores/${store.id}/order-cancellations`, 'POST', { reason });
}

/**
 * The operator's store management (issue #79): suspend or resume a store, close it, and cancel its open orders in
 * one step when the store cannot hand them over (refund, stock and notices follow).
 */
export function OperatorStoresPage() {
  const resource = useResource('/operator/stores');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(/** @type {Pending|null} */ (null));
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  const all = /** @type {StoreProfile[]} */ (resource.data ?? []);
  const shown = all.filter((store) => `${store.name} ${store.company} ${store.address}`.includes(query));
  async function confirm() {
    if (!pending) return;
    if (pending.kind === 'cancel-orders' && !reason.trim()) {
      setMissing(true);
      return;
    }
    if (await resource.run(() => send(pending, reason), actions[pending.kind].done)) setReason('');
    setPending(null);
  }
  return (
    <>
      <ResourceStatus resource={resource} />
      <label>
        店舗名・会社名・所在地で検索
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {shown.map((store) => (
        <section className="workspace-card" key={store.id} data-testid={`operator-store-${store.id}`}>
          <h3>{store.name}</h3>
          <p>
            {store.company} / {store.address}
          </p>
          <p>{stateOf(store)}</p>
          {!store.closedAt && (
            <div className="workspace-actions">
              <button disabled={resource.busy} onClick={() => setPending({ kind: 'enabled', store })}>
                {store.enabled ? '利用を停止' : '利用を再開'}
              </button>
              {store.closingStartedAt ? (
                <>
                  <button disabled={resource.busy} onClick={() => setPending({ kind: 'reopen', store })}>
                    閉鎖を取り消す
                  </button>
                  {(store.openOrderCount ?? 0) > 0 && (
                    <button disabled={resource.busy} onClick={() => setPending({ kind: 'cancel-orders', store })}>
                      未完了の注文をまとめてキャンセル
                    </button>
                  )}
                </>
              ) : (
                <button disabled={resource.busy} onClick={() => setPending({ kind: 'close', store })}>
                  閉鎖する
                </button>
              )}
            </div>
          )}
        </section>
      ))}
      {resource.data && shown.length === 0 && (
        <p>{all.length === 0 ? '対象の店舗はありません。' : '検索条件に一致する店舗はありません。'}</p>
      )}
      {pending && (
        <ConfirmDialog
          title={actions[pending.kind].title}
          confirmLabel={actions[pending.kind].confirm}
          busy={resource.busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        >
          <p>対象：{pending.store.name}</p>
          <PendingText pending={pending} />
          {pending.kind === 'cancel-orders' && (
            <label>
              キャンセルの理由（購入者に通知します）
              <input
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setMissing(false);
                }}
                maxLength={500}
              />
            </label>
          )}
          {missing && (
            <p className="error" role="alert">
              キャンセルの理由を入力してください。
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/** @param {{pending:Pending}} props */
function PendingText({ pending: { kind, store } }) {
  if (kind === 'enabled')
    return store.enabled ? (
      <p>
        この店舗の利用を停止します。商品は購入者向けの画面に表示されなくなります。確定済みの注文はキャンセルされず、そのまま受け渡しを続けます。
      </p>
    ) : (
      <p>利用停止を解除し、再び利用できるようにします。</p>
    );
  if (kind === 'close')
    return (
      <p>
        すぐに新しい注文の受付を止め、閉鎖中にします。未完了の注文（{store.openOrderCount ?? 0}
        件）がなくなると自動で閉鎖済みになり、再開できません。運営が始めた閉鎖は、運営だけが取り消せます。
      </p>
    );
  if (kind === 'reopen') return <p>閉鎖中を取り消し、新しい注文の受付を再開します。</p>;
  return (
    <p>
      未完了の注文（{store.openOrderCount ?? 0}
      件）をすべてキャンセルし、在庫を戻します。カードで支払い済みの注文は返金し、購入者に「この注文は出店者からキャンセルされました」と通知します。
    </p>
  );
}
