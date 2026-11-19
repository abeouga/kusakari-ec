import { useState } from 'react';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import './notices.css';

/**
 * 「重要」の印を出す通知の種類（#194 の 17）。重要かどうかは DB に持たず、この表だけで決める。
 * @type {ReadonlySet<import('../businessTypes').NoticeCategory>}
 */
const IMPORTANT_CATEGORIES = new Set(['OWNER_SUCCESSION_REQUEST']);

/** @typedef {'approval'|'refusal'} SuccessionAnswer */

/** @type {Record<SuccessionAnswer,{title:string,label:string,done:string,lines:string[]}>} */
const successionAnswers = {
  approval: {
    title: 'オーナーの譲渡の承認の確認',
    label: '承認する',
    done: 'オーナーの譲渡を承認しました。あなたが組織のオーナーです。',
    lines: [
      'オーナーの譲渡を承認しますか？',
      '承認すると、すぐにあなたが組織のオーナーになり、担当している店舗の担当から外れます。今のオーナーは組織の ORG_ADMIN になります。',
      '元に戻す操作はありません。戻すには、オーナーになったあなたから、もう一度譲渡を申し出て承認してもらいます。',
    ],
  },
  refusal: {
    title: 'オーナーの譲渡の申し出を断る確認',
    label: '断る',
    done: 'オーナーの譲渡の申し出を断りました。',
    lines: [
      'オーナーの譲渡の申し出を断りますか？',
      '断ると申し出はなくなり、オーナーがもう一度申し出るまで承認できません。',
    ],
  },
};

/**
 * @param {{onOwnerChanged?:()=>void}} props onOwnerChanged: the approval made this account the organization's owner,
 * so the page asks for the new account type and stores.
 */
export function Notices({ onOwnerChanged }) {
  const resource = useResource('/notifications');
  // Issue #204: the successor answers an owner-succession request from its notice. Only the notice of the request
  // waiting for this account has the buttons (the server marks it answerable); the others say the request ended
  // (#200 の決めること 6). A request that ends after the page loaded is refused by the server, and the list reloads.
  const [answering, setAnswering] = useState(/** @type {SuccessionAnswer|null} */ (null));
  /** @param {SuccessionAnswer} kind */
  function submit(kind) {
    // The dialog closes either way, so a refusal by the server shows on the page.
    void resource
      .run(() => write(`/seller/owner-succession/${kind}`, 'POST'), successionAnswers[kind].done)
      .then((done) => {
        setAnswering(null);
        if (done && kind === 'approval') onOwnerChanged?.();
      });
  }
  return (
    <>
      <ResourceStatus resource={resource} />
      {resource.data?.length === 0 && <p>通知はありません。</p>}
      {
        /** @type {import('../businessTypes').Notice[]} */ (resource.data ?? []).map((n) => (
          <section className="workspace-card" key={n.id}>
            <div className="notice-heading">
              {IMPORTANT_CATEGORIES.has(n.category) && <span className="notice-important">重要</span>}
              <h2>{n.title}</h2>
            </div>
            <p>{n.body}</p>
            <p>{new Date(n.createdAt).toLocaleString('ja-JP')}</p>
            {n.category === 'OWNER_SUCCESSION_REQUEST' && !n.answerable && (
              <p className="notice-ended">この申し出は終わったため、承認も断りもできません。</p>
            )}
            {n.answerable && (
              <div className="notice-actions">
                <button type="button" disabled={resource.busy} onClick={() => setAnswering('approval')}>
                  承認する
                </button>
                <button type="button" disabled={resource.busy} onClick={() => setAnswering('refusal')}>
                  断る
                </button>
              </div>
            )}
            {n.readAt ? (
              <span>既読</span>
            ) : (
              <button
                disabled={resource.busy}
                onClick={() => void resource.run(() => write(`/notifications/${n.id}/read`, 'PUT'))}
              >
                既読にする
              </button>
            )}
          </section>
        ))
      }
      {answering && (
        <ConfirmDialog
          title={successionAnswers[answering].title}
          confirmLabel={successionAnswers[answering].label}
          busy={resource.busy}
          onCancel={() => setAnswering(null)}
          onConfirm={() => submit(answering)}
        >
          {successionAnswers[answering].lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </ConfirmDialog>
      )}
    </>
  );
}
