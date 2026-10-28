import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
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
