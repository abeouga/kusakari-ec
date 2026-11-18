import { useState } from 'react';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import { DataTable } from './Common';
import { ConfirmDialog } from '../components/ConfirmDialog';

/**
 * @typedef {{storeId:number,role:string|null,assignableRoles:string[],removable:boolean}} Assignment
 * @typedef {{memberId:string,name:string,email:string,owner:boolean,organizationRole:string|null,organizationRoleEditable:boolean,assignments:Assignment[],expelled:boolean,expellable:boolean}} Account
 * @typedef {{organizationId:number,owner:boolean,organizationAdmin:boolean,stores:{id:number,name:string}[],accounts:Account[]}} AccountsView
 */

/** @type {Record<string,string>} */
const roleLabels = { MANAGER: 'MANAGER（店長）', STAFF: 'STAFF', NONE: 'ロールなし' };

/**
 * Issue #111: the organization's shop accounts and their store roles. The server decides what this account may
 * change (`assignableRoles`, `removable`, `organizationRoleEditable`); the page only offers those choices.
 */
export function StaffAccountsPage() {
  const resource = useResource('/seller/accounts');
  const view = /** @type {AccountsView|null} */ (resource.data);
  // Issue #175: expelled accounts are hidden until the filter asks for them (#173).
  // Issue #179: the filter also finds accounts of the organization without any store, to assign them again (#168).
  const [filter, setFilter] = useState(/** @type {'active'|'unassigned'|'expelled'} */ ('active'));
  const [removing, setRemoving] = useState(/** @type {{account:Account,store:{id:number,name:string}}|null} */ (null));
  const [expelling, setExpelling] = useState(/** @type {Account|null} */ (null));
  const [reinstating, setReinstating] = useState(/** @type {Account|null} */ (null));
  /** @param {Account} account */
  function expel(account) {
    void resource
      .run(
        () => write(`/seller/accounts/${account.memberId}/expulsion`, 'POST'),
        `${account.name}を組織から除名しました。`,
      )
      .then((done) => done && setExpelling(null));
  }
  /** @param {Account} account */
  function reinstate(account) {
    void resource
      .run(
        () => write(`/seller/accounts/${account.memberId}/expulsion`, 'DELETE'),
        `${account.name}を組織に復帰させました。`,
      )
      .then((done) => done && setReinstating(null));
  }
  /** @param {Account} account */
  function expulsionCell(account) {
    if (!account.expellable) return account.expelled ? '除名中' : '';
    return account.expelled ? (
      <button type="button" disabled={resource.busy} onClick={() => setReinstating(account)}>
        復帰させる
      </button>
    ) : (
      <button type="button" className="danger-text" disabled={resource.busy} onClick={() => setExpelling(account)}>
        組織から除名
      </button>
    );
  }
  /** @param {Account} account @param {{id:number,name:string}} store @param {string} role */
  function assign(account, store, role) {
    void resource.run(
      () => write(`/seller/accounts/${account.memberId}/stores/${store.id}`, 'PUT', { role }),
      `${account.name}の${store.name}のロールを「${roleLabels[role]}」にしました。`,
    );
  }
  /** @param {Account} account @param {{id:number,name:string}} store */
  function remove(account, store) {
    void resource
      .run(
        () => write(`/seller/accounts/${account.memberId}/stores/${store.id}`, 'DELETE'),
        `${account.name}を${store.name}の担当から外しました。`,
      )
      .then((done) => done && setRemoving(null));
  }
  /** @param {Account} account */
  function shown(account) {
    if (filter === 'expelled') return account.expelled;
    if (account.expelled) return false;
    return filter === 'active' || (!account.owner && account.assignments.every((a) => a.role === null));
  }
  /** @param {Account} account @param {boolean} organizationAdmin */
  function changeOrganizationRole(account, organizationAdmin) {
    void resource.run(
      () => write(`/seller/accounts/${account.memberId}/organization-role`, 'PUT', { organizationAdmin }),
      organizationAdmin ? `${account.name}を ORG_ADMIN にしました。` : `${account.name}の ORG_ADMIN を外しました。`,
    );
  }
  /** @param {Account} account @param {{id:number,name:string}} store @param {Assignment|undefined} assignment */
  function storeCell(account, store, assignment) {
    if (account.owner) return 'オーナー（全店舗）';
    const current = assignment?.role ?? null;
    const choices = assignment?.assignableRoles ?? [];
    if (!choices.length) return current ? roleLabels[current] : '担当外';
    return (
      <div className="workspace-actions">
        <select
          aria-label={`${account.name}の${store.name}のロール`}
          value={current ?? ''}
          disabled={resource.busy}
          onChange={(event) => assign(account, store, event.target.value)}
        >
          {current === null && <option value="">担当外</option>}
          {current !== null && !choices.includes(current) && <option value={current}>{roleLabels[current]}</option>}
          {choices.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>
        {assignment?.removable && (
          <button
            type="button"
            disabled={resource.busy}
            aria-label={`${account.name}を${store.name}の担当から外す`}
            onClick={() => setRemoving({ account, store })}
          >
            担当から外す
          </button>
        )}
      </div>
    );
  }
  /** @param {Account} account */
  function organizationCell(account) {
    if (account.owner) return 'オーナー';
    const admin = account.organizationRole === 'ORG_ADMIN';
    if (!account.organizationRoleEditable) return admin ? 'ORG_ADMIN' : 'なし';
    return (
      <label className="auth-check">
        <input
          type="checkbox"
          checked={admin}
          disabled={resource.busy}
          aria-label={`${account.name}を ORG_ADMIN にする`}
          onChange={(event) => changeOrganizationRole(account, event.target.checked)}
        />
        ORG_ADMIN
      </label>
    );
  }
  return (
    <section className="workspace-card">
      <ResourceStatus resource={resource} />
      {view && (
        <>
          <p className="muted">
            {view.owner || view.organizationAdmin
              ? '組織の全員と、全店舗のロールを表示しています。'
              : 'MANAGER の店舗の担当者だけを表示しています。STAFF とロールなしの割り振りができます。'}
          </p>
          {(view.owner || view.organizationAdmin) && (
            <label>
              表示する人
              <select
                value={filter}
                onChange={(event) => setFilter(/** @type {'active'|'unassigned'|'expelled'} */ (event.target.value))}
              >
                <option value="active">組織の全員（除名した人を除く）</option>
                <option value="unassigned">どの店舗にも所属していない人</option>
                <option value="expelled">除名した人</option>
              </select>
            </label>
          )}
          <DataTable
            headers={[
              '名前',
              'メールアドレス',
              '組織のロール',
              ...view.stores.map((store) => store.name),
              ...(view.owner || view.organizationAdmin ? ['組織からの除名'] : []),
            ]}
            rows={view.accounts.filter(shown).map((account) => [
              account.name,
              account.email,
              organizationCell(account),
              ...view.stores.map((store) =>
                storeCell(
                  account,
                  store,
                  account.assignments.find((a) => a.storeId === store.id),
                ),
              ),
              ...(view.owner || view.organizationAdmin ? [expulsionCell(account)] : []),
            ])}
          />
        </>
      )}
      {expelling && (
        <ConfirmDialog
          title="組織からの除名の確認"
          confirmLabel="除名する"
          busy={resource.busy}
          onCancel={() => setExpelling(null)}
          onConfirm={() => expel(expelling)}
        >
          <p>{expelling.name}を組織から除名しますか？</p>
          <p>
            除名した人はすぐにログインできなくなります。本人には通知しません。この人が発行した招待キーは取り消します。
          </p>
          <p>担当していた店舗とロールは残り、表示する人を「除名した人」にして復帰させると元に戻ります。</p>
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog
          title="店舗の担当から外す確認"
          confirmLabel="担当から外す"
          busy={resource.busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove(removing.account, removing.store)}
        >
          <p>
            {removing.account.name}を{removing.store.name}の担当から外しますか？
          </p>
          <p>組織には残るので、表示する人を「どの店舗にも所属していない人」にして、あとで店舗の担当にし直せます。</p>
        </ConfirmDialog>
      )}
      {reinstating && (
        <ConfirmDialog
          title="組織への復帰の確認"
          confirmLabel="復帰させる"
          busy={resource.busy}
          onCancel={() => setReinstating(null)}
          onConfirm={() => reinstate(reinstating)}
        >
          <p>{reinstating.name}を組織に復帰させますか？</p>
          <p>除名する前の店舗とロールのまま、またログインできるようになります。</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
