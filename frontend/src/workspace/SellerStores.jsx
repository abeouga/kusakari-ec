import { useState } from 'react';
import { useResource, write } from './useResource';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ResourceStatus, Input, values } from './ResourceView';
import { DataTable } from './Common';
import { navigate } from './navigation';
import { WarningBadge } from './Moderation';

/** @typedef {{id:number,revision:number,organizationId:number,name:string,company:string,address:string,hours:string,enabled:boolean,published:boolean,closingStartedAt:string|null,closingStartedBy:'OWNER'|'ADMIN'|null,closedAt:string|null,openOrderCount:number|null,warning?:import('./Moderation').Warning|null}} StoreProfile */

/**
 * Issue #79: a closing store takes no new orders and becomes closed once its open orders are done.
 * @param {StoreProfile} store
 */
export function stateOf(store) {
  if (store.closedAt) return '閉鎖済み';
  if (store.closingStartedAt)
    return `閉鎖中（${store.closingStartedBy === 'ADMIN' ? '運営が開始' : 'オーナーが開始'}・未完了の注文 ${store.openOrderCount ?? 0}件）`;
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
  const [closing, setClosing] = useState(/** @type {StoreProfile|null} */ (null));
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
              // Issue #16: the operator's warning and its reason are shown to the store's people.
              <div key="state">
                {stateOf(store)}
                <WarningBadge warning={store.warning} />
              </div>,
              <div key="actions" className="workspace-actions">
                {!store.closedAt && (
                  <button type="button" onClick={() => edit(store)}>
                    店舗情報を編集
                  </button>
                )}
                {owner && !store.closingStartedAt && (
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
                {owner && !store.closingStartedAt && (
                  <button type="button" disabled={resource.busy} onClick={() => setClosing(store)}>
                    閉鎖する
                  </button>
                )}
                {owner && store.closingStartedAt && !store.closedAt && store.closingStartedBy === 'OWNER' && (
                  <button
                    type="button"
                    disabled={resource.busy}
                    onClick={() =>
                      void change(
                        () => write(`/seller/stores/${store.id}/closure`, 'DELETE'),
                        '閉鎖を取り消しました。新しい注文の受付を再開しました。',
                      )
                    }
                  >
                    閉鎖を取り消す
                  </button>
                )}
              </div>,
            ])}
          />
        </section>
      )}
      {closing && (
        <ConfirmDialog
          title="店舗の閉鎖の確認"
          confirmLabel="閉鎖を始める"
          busy={resource.busy}
          onCancel={() => setClosing(null)}
          onConfirm={() =>
            void change(
              () => write(`/seller/stores/${closing.id}/closure`, 'POST'),
              '閉鎖を始めました。新しい注文の受付を止めました。',
            ).then(() => setClosing(null))
          }
        >
          <p>対象：{closing.name}</p>
          <p>
            すぐに新しい注文の受付を止め、閉鎖中にします。受け取り待ちの注文（{closing.openOrderCount ?? 0}
            件）は、これまでどおり受け渡してください。
          </p>
          <p>未完了の注文がなくなると、自動で閉鎖済みになります。閉鎖済みの店舗は再開できません。</p>
          <p>閉鎖中のあいだは、閉鎖を取り消して営業に戻せます。</p>
        </ConfirmDialog>
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
