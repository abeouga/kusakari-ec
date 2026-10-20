import { useState } from 'react';
import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
/** @param {{products?:boolean}} props */
export function ReviewPage({ products = false }) {
  const resource = useResource(products ? '/operator/products' : '/operator/applications');
  const [reason, setReason] = useState('');
  return (
    <>
      <ResourceStatus resource={resource} />
      <label>
        理由・コメント
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
      {
        /** @type {import('../businessTypes').Review[]} */ (resource.data ?? []).map((row) => (
          <section className="workspace-card" key={row.id}>
            <h3>{row.name || row.company}</h3>
            {products ? (
              <>
                <p>{row.suspended ? '公開停止中' : row.active ? '公開可能' : '販売終了'}</p>
                <button
                  disabled={resource.busy || !reason.trim()}
                  onClick={() =>
                    void resource.run(() =>
                      write(`/operator/products/${row.id}/moderation`, 'PUT', { suspended: !row.suspended, reason }),
                    )
                  }
                >
                  {row.suspended ? '公開停止を解除' : '公開を停止'}
                </button>
              </>
            ) : (
              <>
                <p>
                  {row.contact} / {row.email} / {row.address} / {row.phone} / {row.plan}
                </p>
                <p>
                  {
                    /** @type {Record<string,string>} */ ({ PENDING: '審査待ち', APPROVED: '承認', REJECTED: '却下' })[
                      row.status
                    ]
                  }{' '}
                  {row.reason}
                </p>
                <a href={`/api/account/store-applications/${row.id}/document`}>提出書類を確認</a>
                {row.status === 'PENDING' && (
                  <div>
                    <button
                      disabled={resource.busy}
                      onClick={() =>
                        void resource.run(() =>
                          write(`/operator/applications/${row.id}`, 'PUT', { approved: true, reason }),
                        )
                      }
                    >
                      承認
                    </button>
                    <button
                      disabled={resource.busy || !reason.trim()}
                      onClick={() =>
                        void resource.run(() =>
                          write(`/operator/applications/${row.id}`, 'PUT', { approved: false, reason }),
                        )
                      }
                    >
                      却下
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        ))
      }
      {resource.data?.length === 0 && <p>対象の記録はありません。</p>}
    </>
  );
}
/** @param {{sellers?:boolean}} props */
export function MembersPage({ sellers = false }) {
  const resource = useResource(sellers ? '/operator/stores' : '/operator/members');
  const [query, setQuery] = useState('');
  return (
    <>
      <ResourceStatus resource={resource} />
      <label>
        名前・メール検索
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {
        /** @type {import('../businessTypes').Member[]} */ (resource.data ?? [])
          .filter((m) => `${m.name} ${m.email}`.includes(query))
          .map((m) => (
            <section className="workspace-card" key={m.id}>
              <h3>{m.name}</h3>
              <p>
                {m.email} / {m.role || m.address}
              </p>
              <p>{m.withdrawnAt ? '退会済み' : m.enabled ? '利用中' : '利用停止'}</p>
              <button
                disabled={resource.busy || m.role === 'ADMIN' || !!m.withdrawnAt}
                onClick={() =>
                  void resource.run(() =>
                    write(`/operator/${sellers ? 'stores' : 'members'}/${m.id}/enabled`, 'PUT', {
                      enabled: !m.enabled,
                    }),
                  )
                }
              >
                {m.enabled ? '利用を停止' : '利用を再開'}
              </button>
            </section>
          ))
      }
    </>
  );
}
export function CategoriesPage() {
  const resource = useResource('/categories');
  const [editing, setEditing] = useState('');
  /** @param {import('react').FormEvent<HTMLFormElement>} e */
  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    if (
      await resource.run(() => write('/operator/categories', 'PUT', { previous: editing, name: values(form).name }))
    ) {
      setEditing('');
      form.reset();
    }
  }
  return (
    <>
      <ResourceStatus resource={resource} />
      <form key={editing} className="workspace-form" onSubmit={save}>
        <Input label="カテゴリ名" name="name" value={editing} maxLength={30} />
        <button disabled={resource.busy}>保存</button>
        <button type="button" onClick={() => setEditing('')}>
          編集を取消
        </button>
      </form>
      {
        /** @type {string[]} */ (resource.data ?? []).map((name) => (
          <section className="workspace-card" key={name}>
            <span>{name}</span> <button onClick={() => setEditing(name)}>編集</button>
            <button
              disabled={resource.busy}
              onClick={() =>
                void resource.run(() => write(`/operator/categories/${encodeURIComponent(name)}`, 'DELETE'))
              }
            >
              削除
            </button>
          </section>
        ))
      }
    </>
  );
}
