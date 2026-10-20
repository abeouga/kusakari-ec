import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
export function Notices() {
  const resource = useResource('/notifications');
  return (
    <>
      <ResourceStatus resource={resource} />
      {resource.data?.length === 0 && <p>通知はありません。</p>}
      {
        /** @type {import('../businessTypes').Notice[]} */ (resource.data ?? []).map((n) => (
          <section className="workspace-card" key={n.id}>
            <h2>{n.title}</h2>
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
