import { useState } from 'react';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import { DataTable } from './Common';

/**
 * @typedef {{memberId:string,name:string,email:string,usedAt:string}} InvitationUser
 * @typedef {{id:string,storeId:number,createdAt:string,expiresAt:string,maxUses:number|null,revokedAt:string|null,status:string,users:InvitationUser[]}} Invitation
 * @typedef {{id:string,storeId:number,key:string,expiresAt:string,maxUses:number|null}} Issued
 */

/** @type {Record<string,string>} */
const statusLabels = { ACTIVE: '有効', EXPIRED: '期限切れ', REVOKED: '取り消し済み', USED_UP: '使用済み' };

/** @param {string|null} value */
const dateTime = (value) => (value ? new Date(value).toLocaleString('ja-JP') : '');

/**
 * Issue #111: invitation keys of the chosen store. The key itself is shown only right after it is issued,
 * because the server keeps its hash alone.
 * @param {{storeId:number,storeName:string}} props
 */
export function StoreInvitationsPage({ storeId, storeName }) {
  const resource = useResource(`/seller/stores/${storeId}/invitations`);
  const invitations = /** @type {Invitation[]|null} */ (resource.data);
  const [issued, setIssued] = useState(/** @type {Issued|null} */ (null));
  const [copied, setCopied] = useState('');
  const url = issued ? `${window.location.origin}/account/login?invite=${encodeURIComponent(issued.key)}` : '';
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function issue(event) {
    event.preventDefault();
    const singleUse = new FormData(event.currentTarget).get('uses') === 'single';
    setCopied('');
    void resource.run(async () => {
      setIssued(/** @type {Issued} */ (await write(`/seller/stores/${storeId}/invitations`, 'POST', { singleUse })));
    }, '招待キーを発行しました。キーと登録用URLは、この画面を離れると再表示できません。');
  }
  /** @param {string} text @param {string} label */
  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label}をコピーしました。`);
    } catch {
      setCopied(`${label}をコピーできませんでした。選択してコピーしてください。`);
    }
  }
  return (
    <>
      <section className="workspace-card">
        <h2>{storeName}の招待キーを発行</h2>
        <p className="muted">
          招待キーで登録した人は、この店舗の担当者（ロールなし）として組織に入ります。有効期限は発行から30日です。
        </p>
        <form className="workspace-form" onSubmit={issue}>
          <fieldset>
            <legend>使える回数</legend>
            <label className="auth-check">
              <input type="radio" name="uses" value="single" defaultChecked />
              1回限り
            </label>
            <label className="auth-check">
              <input type="radio" name="uses" value="multiple" />
              有効期限内なら何回でも
            </label>
          </fieldset>
          <button disabled={resource.busy}>招待キーを発行</button>
        </form>
        {issued && (
          <div className="workspace-form" aria-label="発行した招待キー" role="group">
            <label>
              招待キー
              <input readOnly value={issued.key} onFocus={(event) => event.currentTarget.select()} />
            </label>
            <button type="button" onClick={() => void copy(issued.key, '招待キー')}>
              招待キーをコピー
            </button>
            <label>
              登録用URL
              <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
            </label>
            <button type="button" onClick={() => void copy(url, '登録用URL')}>
              登録用URLをコピー
            </button>
            {copied && <p role="status">{copied}</p>}
          </div>
        )}
      </section>
      <section className="workspace-card">
        <h2>発行済みの招待キー</h2>
        <ResourceStatus resource={resource} />
        {invitations && (
          <DataTable
            headers={['発行日時', '有効期限', '回数', '状態', '使った人', '操作']}
            rows={invitations.map((invitation) => [
              dateTime(invitation.createdAt),
              dateTime(invitation.expiresAt),
              invitation.maxUses === 1 ? '1回限り' : '何回でも',
              statusLabels[invitation.status] || invitation.status,
              invitation.users.map((user) => user.email).join('、') || 'なし',
              invitation.status === 'ACTIVE' ? (
                <button
                  key="revoke"
                  type="button"
                  disabled={resource.busy}
                  aria-label={`${dateTime(invitation.createdAt)}に発行した招待キーを取り消す`}
                  onClick={() =>
                    void resource.run(
                      () => write(`/seller/invitations/${invitation.id}/revoke`, 'POST'),
                      '招待キーを取り消しました。使った人の所属は変わりません。',
                    )
                  }
                >
                  取り消す
                </button>
              ) : (
                ''
              ),
            ])}
          />
        )}
      </section>
    </>
  );
}
