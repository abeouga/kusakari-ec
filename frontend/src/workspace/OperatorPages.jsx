import { useState } from 'react';
import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
import { ConfirmDialog } from '../components/ConfirmDialog';

/** @type {Record<string,string>} */
const applicationLabels = { PENDING: '審査中', APPROVED: '承認', REJECTED: '却下' };

/** Pending applications first, oldest first (review queue); reviewed ones follow, newest first.
 * @param {import('../businessTypes').Review} a @param {import('../businessTypes').Review} b */
function reviewOrder(a, b) {
  const pending = Number(b.status === 'PENDING') - Number(a.status === 'PENDING');
  if (pending) return pending;
  const time = Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? '');
  return a.status === 'PENDING' ? time : -time;
}

/** @param {{products?:boolean}} props */
export function ReviewPage({ products = false }) {
  const resource = useResource(products ? '/operator/products' : '/operator/applications');
  const [scope, setScope] = useState('PENDING');
  const rows = /** @type {import('../businessTypes').Review[]} */ (resource.data ?? []);
  const shown = products ? rows : rows.filter((row) => scope === 'ALL' || row.status === scope).sort(reviewOrder);
  return (
    <>
      <ResourceStatus resource={resource} />
      {!products && (
        <label>
          表示する申請
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="PENDING">審査中</option>
            <option value="ALL">すべて</option>
          </select>
        </label>
      )}
      {shown.map((row) =>
        products ? (
          <ProductModerationRow key={row.id} row={row} resource={resource} />
        ) : (
          <ApplicationRow key={row.id} row={row} resource={resource} />
        ),
      )}
      {resource.data && shown.length === 0 && (
        <p>
          {products
            ? '対象の商品はありません。'
            : scope === 'PENDING'
              ? '審査待ちの出店申請はありません。'
              : '出店申請はありません。'}
        </p>
      )}
    </>
  );
}

/** @param {{row:import('../businessTypes').Review,resource:ReturnType<typeof useResource>}} props */
function ProductModerationRow({ row, resource }) {
  const [reason, setReason] = useState('');
  return (
    <section className="workspace-card">
      <h3>{row.name}</h3>
      <p>{row.suspended ? '公開停止中' : row.active ? '公開可能' : '販売終了'}</p>
      <label>
        理由・コメント
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
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
    </section>
  );
}

/** EC-A03: each application keeps its own rejection reason.
 * @param {{row:import('../businessTypes').Review,resource:ReturnType<typeof useResource>}} props */
function ApplicationRow({ row, resource }) {
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  /** @param {boolean} approved */
  function decide(approved) {
    if (!approved && !reason.trim()) {
      setMissing(true);
      return;
    }
    setMissing(false);
    void resource.run(
      () => write(`/operator/applications/${row.id}`, 'PUT', { approved, reason }),
      approved ? '承認しました。申請者に審査結果を通知しました。' : '却下しました。申請者に却下理由を通知しました。',
    );
  }
  return (
    <section className="workspace-card">
      <h3>{row.company}</h3>
      <p>
        申請者：{row.contact} / 申請日：{row.createdAt ? new Date(row.createdAt).toLocaleDateString('ja-JP') : '不明'}
      </p>
      <p>
        {row.email} / {row.address} / {row.phone} / {row.plan}
      </p>
      <p>
        {applicationLabels[row.status] || row.status} {row.reason}
      </p>
      <a href={`/api/account/store-applications/${row.id}/document`}>提出書類を確認</a>
      {row.status === 'PENDING' && (
        <div>
          <label>
            却下理由
            <input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setMissing(false);
              }}
              maxLength={500}
            />
          </label>
          {missing && (
            <p className="error" role="alert">
              却下する場合は却下理由を入力してください。
            </p>
          )}
          <button disabled={resource.busy} onClick={() => decide(true)}>
            承認
          </button>
          <button disabled={resource.busy} onClick={() => decide(false)}>
            却下
          </button>
        </div>
      )}
    </section>
  );
}

/** @param {{sellers?:boolean}} props */
export function MembersPage({ sellers = false }) {
  const resource = useResource(sellers ? '/operator/stores' : '/operator/members');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(/** @type {import('../businessTypes').Member|null} */ (null));
  const all = /** @type {import('../businessTypes').Member[]} */ (resource.data ?? []);
  const shown = all.filter((m) => `${m.name} ${m.email}`.includes(query));
  const noun = sellers ? '店舗' : '会員';
  async function change() {
    if (!target) return;
    await resource.run(
      () =>
        write(`/operator/${sellers ? 'stores' : 'members'}/${target.id}/enabled`, 'PUT', { enabled: !target.enabled }),
      target.enabled ? '利用を停止しました。' : '利用を再開しました。',
    );
    setTarget(null);
  }
  return (
    <>
      <ResourceStatus resource={resource} />
      <label>
        名前・メール検索
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {shown.map((m) => (
        <section className="workspace-card" key={m.id}>
          <h3>{m.name}</h3>
          <p>
            {m.email} / {m.role || m.address}
          </p>
          <p>{m.withdrawnAt ? '退会済み' : m.enabled ? '利用中' : '利用停止'}</p>
          <button disabled={resource.busy || m.role === 'ADMIN' || !!m.withdrawnAt} onClick={() => setTarget(m)}>
            {m.enabled ? '利用を停止' : '利用を再開'}
          </button>
        </section>
      ))}
      {resource.data && shown.length === 0 && (
        <p>{all.length === 0 ? `対象の${noun}はありません。` : `検索条件に一致する${noun}はありません。`}</p>
      )}
      {target && (
        <ConfirmDialog
          title="利用状況変更の確認"
          confirmLabel={target.enabled ? '利用停止を確定' : '利用再開を確定'}
          busy={resource.busy}
          onCancel={() => setTarget(null)}
          onConfirm={() => void change()}
        >
          <p>
            対象：{target.name}（{target.email}）
          </p>
          {target.enabled ? (
            <p>
              {sellers
                ? 'この店舗の利用を停止します。商品は購入者向けの画面に表示されなくなります。'
                : 'このアカウントの利用を停止します。停止中はログインできません。'}
              確定済みの注文はキャンセルされず、そのまま受け渡しを続けます。
            </p>
          ) : (
            <p>利用停止を解除し、再び利用できるようにします。</p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

export function CategoriesPage() {
  const resource = useResource('/categories');
  const [editing, setEditing] = useState('');
  const [deleting, setDeleting] = useState('');
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
  async function remove() {
    await resource.run(
      () => write(`/operator/categories/${encodeURIComponent(deleting)}`, 'DELETE'),
      'カテゴリを削除しました。',
    );
    setDeleting('');
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
            <button disabled={resource.busy} onClick={() => setDeleting(name)}>
              削除
            </button>
          </section>
        ))
      }
      {deleting && (
        <ConfirmDialog
          title="カテゴリ削除の確認"
          confirmLabel="削除を確定"
          busy={resource.busy}
          onCancel={() => setDeleting('')}
          onConfirm={() => void remove()}
        >
          <p>カテゴリ「{deleting}」を削除します。</p>
          <p>
            販売中・非表示の商品が登録されているカテゴリは削除できません。先に該当商品を別のカテゴリへ移してください。
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
