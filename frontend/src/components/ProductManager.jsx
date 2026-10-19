import { useState } from 'react';
import { Dialog } from './Dialog';
import { ProductForm } from './ProductForm';
import { SellerProductList } from './SellerProductList';
import { useSellerCatalog } from './useSellerCatalog';
import { navigate } from '../workspace/navigation';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onClose:()=>void,embedded?:boolean}} props */
export function ProductManager({ shop, onClose, embedded = false }) {
  const catalog = useSellerCatalog(shop);
  const [editing, setEditing] = useState(/** @type {import('../types').Product|null} */ (null));
  const storeName = shop.stores.find((s) => s.id === catalog.storeId)?.name ?? '';
  function resetEditor() {
    setEditing(null);
  }
  return (
    <ManagerFrame embedded={embedded} onClose={onClose}>
      <p className="muted">
        在庫・非表示・削除は選択店舗だけに反映されます。商品名・価格などの商品情報は全店舗共通です。
      </p>
      {(catalog.error || shop.error) && (
        <p className="error" role="alert">
          {catalog.error || shop.error}
        </p>
      )}
      {shop.notice && (
        <p className="success-text" role="status">
          {shop.notice}
        </p>
      )}
      <div className="manager-toolbar">
        <label>
          管理する店舗
          <select
            aria-label="管理する店舗"
            value={catalog.storeId}
            disabled={catalog.busy || !!editing}
            onChange={(e) => {
              resetEditor();
              shop.setSellerStoreId(Number(e.target.value));
            }}
          >
            {shop.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={catalog.busy}
          onClick={() => {
            shop.setError('');
            shop.setNotice('');
            if (!embedded) onClose();
            navigate('/seller/products/new');
          }}
        >
          新しい商品
        </button>
      </div>
      <div hidden={!!editing}>
        <SellerProductList
          key={catalog.storeId}
          products={catalog.products}
          storeName={storeName}
          busy={catalog.busy}
          onEdit={setEditing}
          onStatus={catalog.changeStatus}
        />
      </div>
      {editing && (
        <button className="text-button" disabled={catalog.busy} onClick={resetEditor}>
          商品一覧へ戻る
        </button>
      )}
      {editing && (
        <ProductForm
          key={`${editing.id}-${catalog.storeId}`}
          product={editing}
          storeName={storeName}
          storeId={catalog.storeId}
          busy={catalog.busy}
          onSave={catalog.save}
          onDone={resetEditor}
        />
      )}
    </ManagerFrame>
  );
}
/** @param {{embedded:boolean,onClose:()=>void,children:import('react').ReactNode}} props */
function ManagerFrame({ embedded, onClose, children }) {
  if (embedded)
    return (
      <section className="workspace-card">
        <h2>商品一覧・登録・編集</h2>
        {children}
      </section>
    );
  return (
    <Dialog title="商品管理" onClose={onClose} wide>
      {children}
    </Dialog>
  );
}
