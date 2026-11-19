import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import './notices.css';

/**
 * 「重要」の印を出す通知の種類（#194 の 17）。重要かどうかは DB に持たず、この表だけで決める。
 * @type {ReadonlySet<import('../businessTypes').NoticeCategory>}
 */
const IMPORTANT_CATEGORIES = new Set(['OWNER_SUCCESSION_REQUEST']);

export function Notices() {
  const resource = useResource('/notifications');
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
    </>
  );
}
