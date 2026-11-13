import { useState } from 'react';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import { ConfirmDialog } from '../components/ConfirmDialog';

/**
 * @typedef {{type:'STOP_ACCEPTING'|'SUSPEND'|'RESUME',reason:string,automatic:boolean,createdAt:string}} OrganizationEvent
 * @typedef {{id:number,name:string,status:'ACTIVE'|'NOT_ACCEPTING'|'SUSPENDED',suspensionStartedAt:string|null,storeCount:number,openOrderCount:number,events:OrganizationEvent[]}} Organization
 * @typedef {{kind:'stop-accepting'|'resume'|'order-cancellations',organization:Organization}} Pending
 */

/** @type {Record<Organization['status'],string>} */
const statusLabels = { ACTIVE: '通常', NOT_ACCEPTING: '受付停止中', SUSPENDED: '停止' };
/** @type {Record<OrganizationEvent['type'],string>} */
const eventLabels = { STOP_ACCEPTING: '受付停止', SUSPEND: '停止', RESUME: '通常に戻す' };

/** @type {Record<Pending['kind'],{title:string,confirm:string,done:string,reasonRequired:boolean}>} */
const actions = {
  'stop-accepting': {
    title: '組織の受付停止の確認',
    confirm: '受付停止を確定',
    done: '受付を停止しました。',
    reasonRequired: true,
  },
  resume: { title: '通常に戻す確認', confirm: '通常に戻す', done: '組織を通常に戻しました。', reasonRequired: false },
  'order-cancellations': {
    title: '未完了の注文のまとめてキャンセルの確認',
    confirm: 'まとめてキャンセルを確定',
    done: '未完了の注文をキャンセルしました。カードで支払い済みの注文は返金します。',
    reasonRequired: true,
  },
};

/** @param {Organization} organization */
function stateText(organization) {
  if (organization.status !== 'NOT_ACCEPTING') return statusLabels[organization.status];
  return `受付停止中（未完了の注文 ${organization.openOrderCount}件。なくなると停止になります）`;
}

/**
 * Issue #109: the operator stops an organization in three stages. Stopping takes no new orders at any of its stores;
 * once no open order is left the organization is suspended automatically and its stores and products disappear.
 * Stopping can be undone, and a suspended organization can be resumed.
 */
export function OperatorOrganizationsPage() {
  const resource = useResource('/operator/organizations');
  const [pending, setPending] = useState(/** @type {Pending|null} */ (null));
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  const organizations = /** @type {Organization[]} */ (resource.data ?? []);
  async function confirm() {
    if (!pending) return;
    if (actions[pending.kind].reasonRequired && !reason.trim()) {
      setMissing(true);
      return;
    }
    const { kind, organization } = pending;
    if (
      await resource.run(
        () => write(`/operator/organizations/${organization.id}/${kind}`, 'POST', { reason }),
        actions[kind].done,
      )
    )
      setReason('');
    setPending(null);
  }
  /** @param {Pending} next */
  function open(next) {
    setReason('');
    setMissing(false);
    setPending(next);
  }
  return (
    <>
      <ResourceStatus resource={resource} />
      {organizations.map((organization) => (
        <section
          className="workspace-card"
          key={organization.id}
          data-testid={`organization-${organization.id}`}
          aria-label={organization.name}
        >
          <h3>{organization.name}</h3>
          <p>
            店舗 {organization.storeCount}件 / 状態：{stateText(organization)}
          </p>
          <div className="workspace-actions">
            {organization.status === 'ACTIVE' && (
              <button disabled={resource.busy} onClick={() => open({ kind: 'stop-accepting', organization })}>
                受付を停止
              </button>
            )}
            {organization.status !== 'ACTIVE' && (
              <button disabled={resource.busy} onClick={() => open({ kind: 'resume', organization })}>
                {organization.status === 'SUSPENDED' ? '停止を解除' : '受付停止を取り消す'}
              </button>
            )}
            {organization.status === 'NOT_ACCEPTING' && organization.openOrderCount > 0 && (
              <button disabled={resource.busy} onClick={() => open({ kind: 'order-cancellations', organization })}>
                未完了の注文をまとめてキャンセル
              </button>
            )}
          </div>
          {organization.events.length > 0 && (
            <details>
              <summary>履歴</summary>
              <ul>
                {organization.events.map((event, index) => (
                  <li key={index}>
                    {new Date(event.createdAt).toLocaleString('ja-JP')} {eventLabels[event.type]}
                    {event.automatic ? '（自動）' : ''} {event.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
      {resource.data && organizations.length === 0 && <p>組織はありません。</p>}
      {pending && (
        <ConfirmDialog
          title={actions[pending.kind].title}
          confirmLabel={actions[pending.kind].confirm}
          busy={resource.busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        >
          <p>対象：{pending.organization.name}</p>
          <PendingText pending={pending} />
          <label>
            {actions[pending.kind].reasonRequired ? '理由（必須）' : '理由（任意）'}
            <input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setMissing(false);
              }}
              maxLength={500}
            />
          </label>
          {missing && (
            <p className="error" role="alert">
              理由を入力してください。
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/** @param {{pending:Pending}} props */
function PendingText({ pending: { kind, organization } }) {
  if (kind === 'stop-accepting')
    return (
      <p>
        この組織のすべての店舗で、新しい注文の受付を止めます。受け取り待ちの注文（{organization.openOrderCount}
        件）はそのまま受け渡せます。未完了の注文がなくなると自動で停止になり、店舗と商品が購入者に見えなくなります。
      </p>
    );
  if (kind === 'resume')
    return (
      <p>組織を通常に戻し、新しい注文の受付を再開します。停止の間にカートや庭から外れた商品は、元に戻りません。</p>
    );
  return (
    <p>
      未完了の注文（{organization.openOrderCount}
      件）をすべてキャンセルし、在庫を戻します。カードで支払い済みの注文は返金し、購入者に「この注文は出店者からキャンセルされました」と通知します。
    </p>
  );
}
