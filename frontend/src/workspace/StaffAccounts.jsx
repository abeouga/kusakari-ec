import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import { DataTable } from './Common';

/**
 * @typedef {{storeId:number,role:string|null,assignableRoles:string[],removable:boolean}} Assignment
 * @typedef {{memberId:string,name:string,email:string,owner:boolean,organizationRole:string|null,organizationRoleEditable:boolean,assignments:Assignment[]}} Account
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
  /** @param {Account} account @param {{id:number,name:string}} store @param {string} role */
  function assign(account, store, role) {
    void resource.run(
      () => write(`/seller/accounts/${account.memberId}/stores/${store.id}`, 'PUT', { role }),
      `${account.name}の${store.name}のロールを「${roleLabels[role]}」にしました。`,
    );
  }
  /** @param {Account} account @param {{id:number,name:string}} store */
  function remove(account, store) {
    void resource.run(
      () => write(`/seller/accounts/${account.memberId}/stores/${store.id}`, 'DELETE'),
      `${account.name}を${store.name}の担当から外しました。`,
    );
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
            onClick={() => remove(account, store)}
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
          <DataTable
            headers={['名前', 'メールアドレス', '組織のロール', ...view.stores.map((store) => store.name)]}
            rows={view.accounts.map((account) => [
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
            ])}
          />
        </>
      )}
    </section>
  );
}
