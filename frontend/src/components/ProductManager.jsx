import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Dialog } from './Dialog';
import { ProductForm } from './ProductForm';
import { SellerProductList } from './SellerProductList';
import { StockEditor } from './StockEditor';
import { useSellerCatalog } from './useSellerCatalog';
import { SellerStoreSelect } from './SellerStoreSelect';
import { navigate } from '../workspace/navigation';
import { useResource } from '../workspace/useResource';
import { WarningBadge } from '../workspace/Moderation';

/** @typedef {{productId:string,productName:string,suspended:boolean,warning:import('../workspace/Moderation').Warning|null}} ProductNotice */

/** @param {{shop:ReturnType<import('../useShop').useShop>,onClose:()=>void,embedded?:boolean}} props */
export function ProductManager({ shop, onClose, embedded = false }) {
  const catalog = useSellerCatalog(shop);
  // Issue #16: the operator's warnings and suspensions on this store's products, with the reasons.
  const moderation = useResource(catalog.storeId ? `/seller/products/moderation?storeId=${catalog.storeId}` : null);
  const notices = /** @type {ProductNotice[]} */ (moderation.data ?? []);
  const [editing, setEditing] = useState(/** @type {import('../types').Product|null} */ (null));
  // Stock shown when the form opened; refreshed after a conflict so the seller can re-check it (EC-S05 5b).
  const [expectedStock, setExpectedStock] = useState(0);
  const [stocking, setStocking] = useState(/** @type {import('../types').Product|null} */ (null));
  const storeName = shop.sellerStores.find((s) => s.id === catalog.storeId)?.name ?? '';
  function resetEditor() {
    setEditing(null);
    setStocking(null);
  }
  /** @param {import('../types').Product} product */
  function edit(product) {
    setStocking(null);
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
      {stocking && !editing && (
        <StockEditor
          key={`${stocking.id}-${catalog.storeId}`}
          product={stocking}
          busy={catalog.busy}
          onSave={catalog.saveStock}
          onDone={() => setStocking(null)}
        />
      )}
      <div hidden={!!editing}>
        {notices.length > 0 && (
          <section className="moderation-notices" aria-label="運営からの警告・停止">
            <h2>運営からの警告・停止</h2>
            <ul>
              {notices.map((notice) => (
                <li key={notice.productId}>
                  <strong>{notice.productName}</strong>
                  {notice.suspended && <span className="moderation-badge">運営により公開停止中</span>}
                  <WarningBadge warning={notice.warning} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <SellerProductList
          notices={Object.fromEntries(notices.map((notice) => [notice.productId, notice]))}
          key={catalog.storeId}
          products={catalog.products}
          storeName={storeName}
          busy={catalog.busy}
          onEdit={edit}
          onStock={setStocking}
          onStatus={catalog.changeStatus}
        />
      </div>
      {editing && (
        <button
          type="button"
          className="page-back-button"
          aria-label="商品一覧へ戻る"
          disabled={catalog.busy}
          onClick={resetEditor}
        >
          <ArrowLeft size={16} aria-hidden />
          戻る
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
        <h1 className="workspace-card-title">商品管理</h1>
        {children}
      </section>
    );
  return (
    <Dialog title="商品管理" onClose={onClose} wide>
      {children}
    </Dialog>
  );
}
