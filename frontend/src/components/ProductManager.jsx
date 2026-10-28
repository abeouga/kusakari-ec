import { useState } from 'react';
import { Dialog } from './Dialog';
import { ProductForm } from './ProductForm';
import { SellerProductList } from './SellerProductList';
import { useSellerCatalog } from './useSellerCatalog';
import { SellerStoreSelect } from './SellerStoreSelect';
import { navigate } from '../workspace/navigation';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onClose:()=>void,embedded?:boolean}} props */
export function ProductManager({ shop, onClose, embedded = false }) {
  const catalog = useSellerCatalog(shop);
  const [editing, setEditing] = useState(/** @type {import('../types').Product|null} */ (null));
  // Stock shown when the form opened; refreshed after a conflict so the seller can re-check it (EC-S05 5b).
  const [expectedStock, setExpectedStock] = useState(0);
  const storeName = shop.sellerStores.find((s) => s.id === catalog.storeId)?.name ?? '';
  function resetEditor() {
    setEditing(null);
  }
  /** @param {import('../types').Product} product */
  function edit(product) {
    setExpectedStock(product.stock);
    setEditing(product);
  }
  /** @param {string} id @param {import('../types').ProductInput} input */
  async function save(id, input) {
    const result = await catalog.save(id, { ...input, expectedStock });
    if (result.latest) setExpectedStock(result.latest.stock);
    return result.saved;
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
        <SellerStoreSelect shop={shop} disabled={catalog.busy || !!editing} onChange={resetEditor} />
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
          onEdit={edit}
          onStatus={catalog.changeStatus}
        />
      </div>
      {editing && (
        <button className="text-button" disabled={catalog.busy} onClick={resetEditor}>
          商品一覧へ戻る
        </button>
      )}
      {editing && <p className="muted">変更前の在庫数：{expectedStock}</p>}
      {editing && (
        <ProductForm
          key={`${editing.id}-${catalog.storeId}`}
          product={editing}
          storeName={storeName}
          storeId={catalog.storeId}
          busy={catalog.busy}
          onSave={save}
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
