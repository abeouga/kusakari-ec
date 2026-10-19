import { useState } from 'react';
import { DataTable } from './Common';
import { yen } from '../api';

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
    floweringDescription: product.floweringDescription || '',
    seasonalCare: product.seasonalCare || '',
    styleDescription: product.styleDescription || '',
    images: product.images,
  };
}

/** @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function ProductInventory({ shop }) {
  const [editing, setEditing] = useState('');
  const [stock, setStock] = useState('0');
  const [stopId, setStopId] = useState('');
  const [error, setError] = useState('');
  async function save() {
    const product = shop.products.find((entry) => entry.id === editing);
    const quantity = Number(stock);
    if (!product || !shop.cart) return;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000) {
      setError('在庫は0〜10000の整数で入力してください。');
      return;
    }
    const input = inventoryInput(product, shop.cart.storeId);
    input.stock = quantity;
    if (await shop.saveProduct(product.id, input)) setEditing('');
  }
  return (
    <section className="workspace-card">
      <h2>在庫・販売状態の管理</h2>

      {(error || shop.error) && (
        <p className="error" role="alert">
          {error || shop.error}
        </p>
      )}
      {shop.notice && <p role="status">{shop.notice}</p>}
      <DataTable
        headers={['商品名', '価格', '在庫', '販売状態', '操作']}
        rows={shop.products.map((product) => [
          product.name,
          yen(product.priceYen),
          product.stock,
          product.stock === 0 ? '在庫切れ' : '販売中',
          <div key={product.id} className="workspace-actions">
            <button
              onClick={() => {
                setEditing(product.id);
                setStock(String(product.stock));
                setError('');
              }}
            >
              在庫を編集
            </button>
            <button onClick={() => setStopId(product.id)}>公開停止</button>
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
          <button disabled={shop.busy} onClick={save}>
            在庫を保存
          </button>
          <button onClick={() => setEditing('')}>取消</button>
        </div>
      )}
      {stopId && (
        <div role="alertdialog" aria-label="公開停止の確認">
          <p>実商品の販売を停止します。カートから購入できなくなります。</p>
          <button
            disabled={shop.busy}
            onClick={async () => {
              if (await shop.deleteProduct(stopId)) setStopId('');
            }}
          >
            公開停止を確定
          </button>
          <button onClick={() => setStopId('')}>取消</button>
        </div>
      )}
    </section>
  );
}
