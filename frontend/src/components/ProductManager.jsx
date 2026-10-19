import { useState } from 'react';
import { Dialog } from './Dialog';
import { ProductForm } from './ProductForm';
import { yen } from '../api';
import { navigate } from '../workspace/navigation';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onClose:()=>void,embedded?:boolean}} props */
export function ProductManager({ shop, onClose, embedded = false }) {
  const [editing, setEditing] = useState(/** @type {import('../types').Product|null} */ (null));
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState('');
  let storeId = 1;
  if (shop.cart) storeId = shop.cart.storeId;
  function resetEditor() {
    setEditing(null);
    setFormKey(formKey + 1);
  }
  function newProduct() {
    shop.setError('');
    shop.setNotice('');
    if (!embedded) onClose();
    navigate('/seller/products/new');
  }
  /** @param {import('../types').Product} product */
  function edit(product) {
    setEditing(product);
    setFormKey(formKey + 1);
  }
  /** @param {string} id */
  async function remove(id) {
    const saved = await shop.deleteProduct(id);
    if (saved) {
      setDeleting('');
      resetEditor();
    }
  }
  return (
    <ManagerFrame embedded={embedded} onClose={onClose}>
      <p className="muted">商品と店舗別在庫を登録・編集します。削除した商品は販売一覧から非表示になります。</p>
      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      {shop.notice && (
        <p className="success-text" role="status">
          {shop.notice}
        </p>
      )}
      <div className="manager-toolbar">
        <label>
          在庫を編集する店舗
          <select
            aria-label="在庫を編集する店舗"
            value={storeId}
            disabled={shop.busy}
            onChange={(e) => {
              resetEditor();
              shop.selectStore(Number(e.target.value));
            }}
          >
            {shop.stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" onClick={newProduct} disabled={shop.busy}>
          新しい商品
        </button>
      </div>
      <div className={editing ? 'manager-layout' : ''}>
        <div className="manager-list">
          {shop.products.map((product) => (
            <article key={product.id} data-testid={`manage-${product.id}`}>
              <img src={product.imageUrl} alt="" />
              <div>
                <strong>{product.name}</strong>
                <small>{product.sku}</small>
                <p>
                  {yen(product.priceYen)} / 在庫 {product.stock}
                </p>
                <div className="form-actions">
                  <button className="text-button" onClick={() => edit(product)} disabled={shop.busy}>
                    編集
                  </button>
                  <button
                    className="text-button danger-text"
                    onClick={() => setDeleting(product.id)}
                    disabled={shop.busy}
                  >
                    削除
                  </button>
                </div>
                {deleting === product.id && (
                  <div className="delete-confirm">
                    <p>この商品を一覧から削除します。</p>
                    <button className="secondary-button" disabled={shop.busy} onClick={() => remove(product.id)}>
                      削除を確定
                    </button>
                    <button className="text-button" onClick={() => setDeleting('')}>
                      戻る
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        {editing && (
          <ProductForm
            key={formKey}
            product={editing}
            storeId={storeId}
            busy={shop.busy}
            onSave={shop.saveProduct}
            onDone={resetEditor}
          />
        )}
      </div>
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
