import { useEffect, useState } from 'react';
import { ApplicationWizard, Summary } from './ApplicationWizard';
import { PageLink } from './Common';
import { navigate } from './navigation';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import './account.css';

/** Sidebar label and title switch once an application exists (EC-B18 関連情報). */
export const applicationsChanged = 'kusakari-applications-changed';
export const applicationPaths = { form: '/seller/application', status: '/seller/application/status' };

/** @typedef {{id:string,company:string,contact:string,email:string,address:string,phone:string,status:string,reason:string,createdAt:string,documentName:string}} Application */

/** @type {Record<string,string>} */
const statusLabels = { SUBMITTED: '審査中', REJECTED: '却下', APPROVED: '承認', WITHDRAWN: '取り下げ済み' };
/** A rejected or withdrawn application may be followed by a new one. @param {Application|null|undefined} latest */
const canReapply = (latest) => latest?.status === 'REJECTED' || latest?.status === 'WITHDRAWN';

/** @param {string} path */
function replacePath(path) {
  window.history.replaceState(window.history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Direct access: shop accounts go to their products; the URL an applicant may use depends on the latest application. */
/** @param {string|null} accountType @param {Application|null|undefined} latest @param {'form'|'status'} page */
function useApplicationRoute(accountType, latest, page) {
  useEffect(() => {
    if (accountType === 'SHOP_OWNER' || accountType === 'SHOP_STAFF') replacePath('/seller/products');
    else if (latest === undefined) return;
    else if (page === 'form' && latest && !canReapply(latest)) replacePath(applicationPaths.status);
    else if (page === 'status' && latest === null) replacePath(applicationPaths.form);
  }, [accountType, latest, page]);
}

/** Only an account made with the business sign-up applies. @param {string|null} accountType */
function notApplicant(accountType) {
  if (accountType === 'SHOP_OWNER_APPLICANT') return null;
  return (
    <p>
      出店申請は、企業様向けに登録したアカウントで行います。新規登録の画面で「企業様向け」を選んで登録してください。
    </p>
  );
}

/** EC-B17: step-by-step input → confirmation → submission (issue #20).
 * A rejected or withdrawn application pre-fills the wizard for re-application. */
/** @param {{accountType:string|null}} props */
export function ApplicationPage({ accountType }) {
  const applicant = accountType === 'SHOP_OWNER_APPLICANT';
  const resource = useResource(applicant ? '/account/store-applications' : null);
  const list = /** @type {Application[]|null} */ (resource.data);
  const latest = list === null ? undefined : (list[0] ?? null);
  const [done, setDone] = useState(false);
  useApplicationRoute(accountType, done ? null : latest, 'form');
  if (!applicant) return notApplicant(accountType);
  if (done)
    return (
      <section className="workspace-card" role="status">
        <h2>出店申請を受け付けました</h2>
        <p>審査結果は通知でお知らせします。</p>
        <PageLink href={applicationPaths.status}>出店申請状況を確認する</PageLink>
      </section>
    );
  const previous = latest && canReapply(latest) ? latest : null;
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
/** @param {{accountType:string|null}} props */
export function ApplicationStatusPage({ accountType }) {
  const applicant = accountType === 'SHOP_OWNER_APPLICANT';
  const resource = useResource(applicant ? '/account/store-applications' : null);
  const list = /** @type {Application[]|null} */ (resource.data);
  const latest = list === null ? undefined : (list[0] ?? null);
  useApplicationRoute(accountType, latest, 'status');
  if (!applicant) return notApplicant(accountType);
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
          {latest.status === 'SUBMITTED' && (
            <>
              <p>審査結果は通知でお知らせします。</p>
              <div className="workspace-actions">
                <button
                  type="button"
                  disabled={resource.busy}
                  onClick={() =>
                    void resource.run(
                      () => write(`/account/store-applications/${latest.id}/withdrawal`, 'PUT'),
                      '申請を取り下げました。',
                    )
                  }
                >
                  申請を取り下げる
                </button>
              </div>
            </>
          )}
          {latest.status === 'APPROVED' && (
            <p>承認されました。ページを再読み込みすると、出店者メニューから店舗を作成できます。</p>
          )}
          {canReapply(latest) && (
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
