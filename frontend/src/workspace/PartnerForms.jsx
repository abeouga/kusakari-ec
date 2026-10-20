import { authFetch } from '../auth';
import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
export function ApplicationPage() {
  const resource = useResource('/account/store-applications');
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = values(form);
    const file = new FormData(form).get('document');
    const body = new FormData();
    body.append('application', new Blob([JSON.stringify(input)], { type: 'application/json' }));
    if (file instanceof File) body.append('document', file);
    if (
      await resource.run(async () => {
        const response = await authFetch('/api/account/store-applications', { method: 'POST', body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '申請を保存できませんでした。');
      }, '出店申請を保存しました。')
    )
      form.reset();
  }
  return (
    <>
      <ResourceStatus resource={resource} />
      <section className="workspace-card">
        <h2>出店申請</h2>
        <form className="workspace-form" onSubmit={submit}>
          <Input label="会社・事業者名" name="company" maxLength={100} />
          <Input label="担当者名" name="contact" maxLength={100} />
          <Input label="連絡先メール" name="email" type="email" />
          <Input label="所在地" name="address" />
          <Input label="電話番号" name="phone" maxLength={30} />
          <label>
            希望出店プラン
            <select name="plan">
              <option value="STANDARD">スタンダード</option>
              <option value="PRODUCER">生産者直販</option>
            </select>
          </label>
          <label>
            事業確認書類（5MB以内）
            <input name="document" type="file" accept="application/pdf,image/png,image/jpeg" required />
          </label>
          <button disabled={resource.busy}>出店を申請</button>
        </form>
      </section>
      {
        /** @type {import('../businessTypes').Review[]} */ (resource.data ?? []).map((a) => (
          <section className="workspace-card" key={a.id}>
            <h3>{a.company}</h3>
            <p>
              {
                /** @type {Record<string,string>} */ ({ PENDING: '審査待ち', APPROVED: '承認', REJECTED: '却下' })[
                  a.status
                ]
              }{' '}
              {a.reason}
            </p>
            <a href={`/api/account/store-applications/${a.id}/document`}>提出書類を確認</a>
          </section>
        ))
      }
    </>
  );
}
/** @param {{storeId:number,readOnly?:boolean}} props */
export function ProfilePage({ storeId, readOnly = false }) {
  const resource = useResource(`/stores/${storeId}`);
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function save(event) {
    event.preventDefault();
    const input = values(event.currentTarget);
    void resource.run(() => write(`/seller/stores/${storeId}`, 'PUT', { ...input, revision: resource.data.revision }));
  }
  const p = resource.data;
  return (
    <>
      <ResourceStatus resource={resource} />
      {p && (
        <section className="workspace-card">
          {readOnly ? (
            <>
              <h2>{p.name}</h2>
              <p>
                {p.address} / {p.hours}
              </p>
              <p>{p.story}</p>
              <p>{p.enabled ? '営業中' : '受付休止'}</p>
            </>
          ) : (
            <form key={p.revision} className="workspace-form" onSubmit={save}>
              {[
                ['name', '店舗名', 100],
                ['company', '会社名', 100],
                ['contact', '担当者', 100],
                ['email', '問い合わせメール', 200],
                ['address', '所在地', 200],
                ['hours', '営業時間', 80],
                ['story', '店舗紹介', 1000],
              ].map(([name, label, length]) => (
                <Input
                  key={name}
                  name={String(name)}
                  label={String(label)}
                  value={p[name]}
                  maxLength={Number(length)}
                  required={['name', 'address', 'hours'].includes(String(name))}
                />
              ))}
              <button disabled={resource.busy}>店舗情報を保存</button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
