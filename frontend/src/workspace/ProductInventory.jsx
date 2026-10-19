import { useState } from 'react';
import { DataTable } from './Common';
import { yen } from '../api';
import { useSellerCatalog } from '../components/useSellerCatalog';

/** @param {import('../types').Product} product @param {number} storeId @returns {import('../types').ProductInput} */
function inventoryInput(product, storeId) {
  return {
    storeId,
    plantModelProfile: product.plantModelProfile ?? null,
    sku: product.sku,
    name: product.name,
    latinName: product.latinName,
    category: product.category,
    description: product.description,
    sizeLabel: product.sizeLabel,
    care: product.care,
    priceYen: product.priceYen,
    stock: product.stock,
    imageUrl: product.imageUrl,
    badge: product.badge,
    nurseryName: product.nurseryName,
    nurseryAddress: product.nurseryAddress,
    sunlight: product.sunlight,
    useCase: product.useCase,
    careLevel: product.careLevel,
    minTemperatureC: product.minTemperatureC,
    heatTolerant: product.heatTolerant,
    droughtTolerant: product.droughtTolerant,
    ageYears: product.ageYears,
    heightCm: product.heightCm,
    potDiameterCm: product.potDiameterCm,
    familyName: product.familyName,
    images: product.images,
  };
}

/** @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function ProductInventory({ shop }) {
  const catalog = useSellerCatalog(shop);
  const [editing, setEditing] = useState('');
  const [stock, setStock] = useState('0');
  const [stopId, setStopId] = useState('');
  const [error, setError] = useState('');
  async function save() {
    const product = catalog.products.find((entry) => entry.id === editing);
    const quantity = Number(stock);
    if (!product) return;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000) {
      setError('在庫は0〜10000の整数で入力してください。');
      return;
    }
    const input = inventoryInput(product, catalog.storeId);
    input.stock = quantity;
    if (await catalog.save(product.id, input)) setEditing('');
  }
  return (
    <section className="workspace-card">
      <h2>在庫・販売状態の管理</h2>
      <label>
        管理する店舗
        <select
          aria-label="管理する店舗"
          value={catalog.storeId}
          disabled={catalog.busy}
          onChange={(e) => {
            setEditing('');
            setStopId('');
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
      {catalog.error && <p role="alert">{catalog.error}</p>}

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
                setEditing(product.id);
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
        <div className="workspace-form">
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
          <button disabled={catalog.busy} onClick={() => setEditing('')}>
            取消
          </button>
        </div>
      )}
      {stopId && (
        <div role="alertdialog" aria-label="公開状態変更の確認">
          <p>対象店舗：{shop.stores.find((s) => s.id === catalog.storeId)?.name}</p>
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
