import { useResource, write } from './useResource';
import { ResourceStatus, Input, values } from './ResourceView';
import { DataTable } from './Common';
import { navigate } from './navigation';

/** @typedef {{id:number,revision:number,organizationId:number,name:string,company:string,address:string,hours:string,enabled:boolean,published:boolean}} StoreProfile */

/** @param {StoreProfile} store */
function stateOf(store) {
  if (!store.enabled) return '運営により停止中';
  return store.published ? '公開中' : '非公開';
}

/**
 * The stores this account operates. The owner adds stores without an application and decides when each one is shown
 * to buyers; a new store starts unpublished.
 * @param {{shop:ReturnType<import('../useShop').useShop>,owner:boolean}} props
 */
export function SellerStoresPage({ shop, owner }) {
  const resource = useResource('/seller/stores');
  const stores = /** @type {StoreProfile[]|null} */ (resource.data);
  /** @param {()=>Promise<unknown>} action @param {string} message */
  async function change(action, message) {
    if (await resource.run(action, message)) await shop.reloadSellerStores();
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    void change(
      () => write('/seller/stores', 'POST', { ...values(form), revision: 0 }).then(() => form.reset()),
      '店舗を作成しました。内容を確認してから公開してください。',
    );
  }
  /** @param {StoreProfile} store */
  function edit(store) {
    shop.setSellerStoreId(store.id);
    navigate('/seller/profile');
  }
  return (
    <>
      <ResourceStatus resource={resource} />
      {stores && (
        <section className="workspace-card">
          <h2>店舗</h2>
          <DataTable
            headers={['店舗名', '所在地', '営業時間', '状態', '操作']}
            rows={stores.map((store) => [
              store.name,
              store.address,
              store.hours,
              stateOf(store),
              <div key="actions" className="workspace-actions">
                <button type="button" onClick={() => edit(store)}>
                  店舗情報を編集
                </button>
                {owner && (
                  <button
                    type="button"
                    disabled={resource.busy}
                    aria-label={`${store.name}を${store.published ? '非公開にする' : '公開する'}`}
                    onClick={() =>
                      void change(
                        () => write(`/seller/stores/${store.id}/published`, 'PUT', { published: !store.published }),
                        store.published ? '店舗を非公開にしました。' : '店舗を公開しました。',
                      )
                    }
                  >
                    {store.published ? '非公開にする' : '公開する'}
                  </button>
                )}
              </div>,
            ])}
          />
        </section>
      )}
      {owner && (
        <section className="workspace-card">
          <h2>店舗を追加</h2>
          <form className="workspace-form" onSubmit={create}>
            <Input name="name" label="店舗名" maxLength={100} />
            <Input name="contact" label="担当者" maxLength={100} required={false} />
            <Input name="email" label="問い合わせメール" type="email" maxLength={200} required={false} />
            <Input name="address" label="所在地" maxLength={200} />
            <Input name="hours" label="営業時間" maxLength={80} />
            <Input name="story" label="店舗紹介" maxLength={1000} required={false} />
            <button disabled={resource.busy}>店舗を作成</button>
          </form>
        </section>
      )}
    </>
  );
}
