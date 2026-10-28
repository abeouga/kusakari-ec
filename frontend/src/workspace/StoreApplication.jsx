import { Fragment, useEffect, useRef, useState } from 'react';
import { ApiError, readResponse, send } from '../api';
import { PageLink } from './Common';
import { navigate } from './navigation';
import { useResource } from './useResource';
import { ResourceStatus } from './ResourceView';
import './account.css';

/** Sidebar label and title switch once an application exists (EC-B18 関連情報). */
export const applicationsChanged = 'kusakari-applications-changed';
export const applicationPaths = { form: '/seller/application', status: '/seller/application/status' };

/** @typedef {{id:string,company:string,contact:string,email:string,address:string,phone:string,plan:string,status:string,reason:string,createdAt:string,documentName:string}} Application */

const fields = /** @type {const} */ ([
  ['company', '会社・事業者名', 'text', 100],
  ['contact', '担当者名', 'text', 100],
  ['email', '連絡先メール', 'email', 200],
  ['address', '所在地', 'text', 200],
  ['phone', '電話番号', 'tel', 30],
]);
/** @type {Record<string,string>} */
const plans = { STANDARD: 'スタンダード', PRODUCER: '生産者直販' };
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

/** @param {{application:Record<string,string>,documentName:string}} props */
function Summary({ application, documentName }) {
  return (
    <dl className="application-summary">
      {fields.map(([name, label]) => (
        <Fragment key={name}>
          <dt>{label}</dt>
          <dd>{application[name]}</dd>
        </Fragment>
      ))}
      <dt>希望出店プラン</dt>
      <dd>{plans[application.plan] || application.plan}</dd>
      <dt>事業確認書類</dt>
      <dd>{documentName}</dd>
    </dl>
  );
}

/** EC-B17: input → confirmation → submission. A rejected application pre-fills the form for re-application. */
/** @param {{role:string|null}} props */
export function ApplicationPage({ role }) {
  const resource = useResource('/account/store-applications');
  const list = /** @type {Application[]|null} */ (resource.data);
  const latest = list === null ? undefined : (list[0] ?? null);
  const [draft, setDraft] = useState(/** @type {{input:Record<string,string>,documentName:string}|null} */ (null));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const form = useRef(/** @type {HTMLFormElement|null} */ (null));
  useApplicationRoute(role, done ? null : latest, 'form');
  if (role === 'ADMIN') return <p>出店申請は購入者アカウントで行います。</p>;
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function confirm(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = Object.fromEntries(
      [...fields.map(([name]) => name), 'plan'].map((name) => [name, String(data.get(name) || '').trim()]),
    );
    const file = data.get('document');
    const missing = /** @type {string[]} */ (fields.filter(([name]) => !input[name]).map(([, label]) => label));
    if (!(file instanceof File) || !file.name) missing.push('事業確認書類');
    if (missing.length) return setError(`未入力の項目があります：${missing.join('、')}`);
    if (!/^[^\s@]+@[^\s@]+$/.test(input.email)) return setError('連絡先メールの形式が正しくありません。');
    if (!/^[0-9+() -]{1,30}$/.test(input.phone))
      return setError('電話番号は数字・＋・括弧・ハイフンで入力してください。');
    if (file instanceof File && file.size > 5 * 1024 * 1024)
      return setError('事業確認書類は5MB以内のファイルを選択してください。');
    setError('');
    setDraft({ input, documentName: file instanceof File ? file.name : '' });
  }
  async function submit() {
    if (!draft || !form.current) return;
    const file = new FormData(form.current).get('document');
    const body = new FormData();
    body.append('application', new Blob([JSON.stringify(draft.input)], { type: 'application/json' }));
    if (file instanceof File) body.append('document', file);
    setBusy(true);
    setError('');
    try {
      await readResponse(
        await send('/api/account/store-applications', { method: 'POST', body }),
        '申請を保存できませんでした。',
      );
      setDone(true);
      setDraft(null);
      window.dispatchEvent(new Event(applicationsChanged));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '申請を保存できませんでした。');
      // 4a/4b: the server rejected the input, so show the form again with what was entered.
      if (reason instanceof ApiError && reason.status === 400) setDraft(null);
    } finally {
      setBusy(false);
    }
  }
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
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {list && (
        <section className="workspace-card">
          <form
            ref={form}
            key={previous?.id ?? 'new'}
            className="workspace-form"
            onSubmit={confirm}
            hidden={!!draft}
            noValidate
          >
            {previous && <p>前回の申請内容を入力しています。事業確認書類はもう一度選択してください。</p>}
            {fields.map(([name, label, type, maxLength]) => (
              <label key={name}>
                {label}
                <input name={name} type={type} defaultValue={previous?.[name] ?? ''} required maxLength={maxLength} />
              </label>
            ))}
            <label>
              希望出店プラン
              <select name="plan" defaultValue={previous?.plan ?? 'STANDARD'}>
                {Object.entries(plans).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              事業確認書類（PDF・PNG・JPEG、5MB以内）
              <input name="document" type="file" accept="application/pdf,image/png,image/jpeg" required />
            </label>
            <button>確認画面へ</button>
          </form>
          {draft && (
            <section aria-label="入力内容の確認">
              <h2>入力内容の確認</h2>
              <p>この内容で出店を申請します。よろしければ「申請する」を選んでください。</p>
              <Summary application={draft.input} documentName={draft.documentName} />
              <div className="workspace-actions">
                <button type="button" disabled={busy} onClick={() => setDraft(null)}>
                  修正する
                </button>
                <button type="button" disabled={busy} onClick={() => void submit()}>
                  {busy ? '申請しています…' : '申請する'}
                </button>
              </div>
            </section>
          )}
        </section>
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
