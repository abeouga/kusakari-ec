import { useState } from 'react';
import { DataTable } from './Common';
import { yen } from '../api';
import { useSellerCatalog } from '../components/useSellerCatalog';
import { SellerStoreSelect } from '../components/SellerStoreSelect';

/** @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function ProductInventory({ shop }) {
  const catalog = useSellerCatalog(shop);
  // `expected` is the stock shown when editing began; the server rejects the save if it has changed since.
  const [editing, setEditing] = useState(/** @type {{id:string,expected:number}|null} */ (null));
  const [stock, setStock] = useState('0');
  const [stopId, setStopId] = useState('');
  const [error, setError] = useState('');
  const editingProduct = editing ? catalog.products.find((entry) => entry.id === editing.id) : undefined;
  async function save() {
    const quantity = Number(stock);
    if (!editing) return;
    if (stock.trim() === '' || !Number.isInteger(quantity) || quantity < 0 || quantity > 10000) {
      setError('在庫は0〜10000の整数で入力してください。');
      return;
    }
    setError('');
    const result = await catalog.saveStock(editing.id, editing.expected, quantity);
    if (result.saved) setEditing(null);
    // EC-S05 5b: keep the entered value and ask the seller to confirm it against the latest stock.
    else if (result.latest) setEditing({ id: editing.id, expected: result.latest.stock });
  }
  return (
    <section className="workspace-card">
      <h2>在庫・販売状態の管理</h2>
      <SellerStoreSelect
        shop={shop}
        disabled={catalog.busy}
        onChange={() => {
          setEditing(null);
          setStopId('');
        }}
      />
      {catalog.error && (
        <p className="error" role="alert">
          {catalog.error}
        </p>
      )}

      {(error || shop.error) && (
        <p className="error" role="alert">
          {error || shop.error}
        </p>
      )}
      {shop.notice && <p role="status">{shop.notice}</p>}
      <DataTable
        headers={['商品名', '価格', '在庫', '販売状態', '操作']}
        rows={catalog.products.map((product) => [
          product.name,
          yen(product.priceYen),
          product.stock,
          product.publicationStatus === 'HIDDEN' ? '非表示' : product.stock === 0 ? '在庫切れ' : '販売中',
          <div key={product.id} className="workspace-actions">
            <button
              disabled={catalog.busy}
              onClick={() => {
                setEditing({ id: product.id, expected: product.stock });
                setStock(String(product.stock));
                setError('');
              }}
            >
              在庫を編集
            </button>
            <button disabled={catalog.busy} onClick={() => setStopId(product.id)}>
              {product.publicationStatus === 'HIDDEN' ? '再公開' : '非表示'}
            </button>
          </div>,
        ])}
      />
      {editing && (
        <div className="workspace-form" role="group" aria-label="在庫数の変更">
          <p>
            {editingProduct?.name}：変更前の在庫数 {editing.expected}
          </p>
          <label>
            在庫数
            <input
              type="number"
              min="0"
              max="10000"
              step="1"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
            />
          </label>
          <button disabled={catalog.busy} onClick={save}>
            在庫を保存
          </button>
          <button disabled={catalog.busy} onClick={() => setEditing(null)}>
            取消
          </button>
        </div>
      )}
      {stopId && (
        <div role="alertdialog" aria-label="公開状態変更の確認">
          <p>対象店舗：{shop.sellerStores.find((s) => s.id === catalog.storeId)?.name}</p>
          <p>対象商品：{catalog.products.find((p) => p.id === stopId)?.name}</p>
          <p>
            {catalog.products.find((p) => p.id === stopId)?.publicationStatus === 'HIDDEN'
              ? 'この店舗で再公開します。'
              : 'この店舗だけ非表示にします。カートから購入できなくなります。他店舗には影響しません。'}
          </p>
          <button
            disabled={catalog.busy}
            onClick={async () => {
              if (
                await catalog.changeStatus(
                  [stopId],
                  catalog.products.find((p) => p.id === stopId)?.publicationStatus === 'HIDDEN'
                    ? 'PUBLISHED'
                    : 'HIDDEN',
                )
              )
                setStopId('');
            }}
          >
            変更を確定
          </button>
          <button disabled={catalog.busy} onClick={() => setStopId('')}>
            取消
          </button>
        </div>
      )}
    </section>
  );
}
