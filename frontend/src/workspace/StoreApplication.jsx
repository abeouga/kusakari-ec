import { useEffect, useState } from 'react';
import { ApplicationWizard, Summary } from './ApplicationWizard';
import { PageLink } from './Common';
import { navigate } from './navigation';
import { useResource } from './useResource';
import { ResourceStatus } from './ResourceView';
import './account.css';

/** Sidebar label and title switch once an application exists (EC-B18 関連情報). */
export const applicationsChanged = 'kusakari-applications-changed';
export const applicationPaths = { form: '/seller/application', status: '/seller/application/status' };

/** @typedef {{id:string,company:string,contact:string,email:string,address:string,phone:string,plan:string,status:string,reason:string,createdAt:string,documentName:string}} Application */

/** @type {Record<string,string>} */
const statusLabels = { PENDING: '審査中', REJECTED: '却下', APPROVED: '承認' };

/** @param {string} path */
function replacePath(path) {
  window.history.replaceState(window.history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Direct access: sellers go to their products; the URL a buyer may use depends on the latest application. */
/** @param {string|null} role @param {Application|null|undefined} latest @param {'form'|'status'} page */
function useApplicationRoute(role, latest, page) {
  useEffect(() => {
    if (role === 'SELLER') replacePath('/seller/products');
    else if (latest === undefined) return;
    else if (page === 'form' && latest?.status === 'PENDING') replacePath(applicationPaths.status);
    else if (page === 'status' && latest === null) replacePath(applicationPaths.form);
  }, [role, latest, page]);
}

/** EC-B17: step-by-step input → confirmation → submission (issue #20).
 * A rejected application pre-fills the wizard for re-application. */
/** @param {{role:string|null}} props */
export function ApplicationPage({ role }) {
  const resource = useResource('/account/store-applications');
  const list = /** @type {Application[]|null} */ (resource.data);
  const latest = list === null ? undefined : (list[0] ?? null);
  const [done, setDone] = useState(false);
  useApplicationRoute(role, done ? null : latest, 'form');
  if (role === 'ADMIN') return <p>出店申請は購入者アカウントで行います。</p>;
  if (done)
    return (
      <section className="workspace-card" role="status">
        <h2>出店申請を受け付けました</h2>
        <p>審査結果は通知でお知らせします。</p>
        <PageLink href={applicationPaths.status}>出店申請状況を確認する</PageLink>
      </section>
    );
  const previous = latest?.status === 'REJECTED' ? latest : null;
  return (
    <>
      <ResourceStatus resource={resource} />
      {list && (
        <ApplicationWizard
          key={previous?.id ?? 'new'}
          previous={previous}
          onDone={() => {
            setDone(true);
            window.dispatchEvent(new Event(applicationsChanged));
          }}
        />
      )}
    </>
  );
}

/** EC-B18: the latest application, read-only while under review. */
/** @param {{role:string|null}} props */
export function ApplicationStatusPage({ role }) {
  const resource = useResource('/account/store-applications');
  const list = /** @type {Application[]|null} */ (resource.data);
  const latest = list === null ? undefined : (list[0] ?? null);
  useApplicationRoute(role, latest, 'status');
  if (role === 'ADMIN') return <p>出店申請は購入者アカウントで行います。</p>;
  return (
    <>
      <ResourceStatus resource={resource} />
      {latest && (
        <section className="workspace-card">
          <p>
            審査状況：<span className="application-status">{statusLabels[latest.status] || latest.status}</span>
          </p>
          <p>申請日：{new Date(latest.createdAt).toLocaleDateString('ja-JP')}</p>
          {latest.status === 'REJECTED' && <p>却下理由：{latest.reason}</p>}
          <h2>申請内容</h2>
          <Summary application={latest} documentName={latest.documentName} />
          <a href={`/api/account/store-applications/${latest.id}/document`}>提出書類を確認</a>
          {latest.status === 'PENDING' && <p>審査結果は通知でお知らせします。</p>}
          {latest.status === 'REJECTED' && (
            <div className="workspace-actions">
              <button type="button" onClick={() => navigate(applicationPaths.form)}>
                再申請する
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
