import { ProductForm } from '../components/ProductForm';
import { navigate } from './navigation';

/** @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function ProductCreatePage({ shop }) {
  const storeId = shop.sellerStoreId;
  const disabled = shop.busy;
  return (
    <section className="workspace-card">
      <button className="text-button" onClick={() => navigate('/seller/products')} disabled={shop.busy}>
        商品一覧へ戻る
      </button>

      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      <ProductForm
        storeSelector={
          <div className="manager-toolbar">
            <label>
              在庫を登録する店舗
              <select
                aria-label="在庫を登録する店舗"
                value={storeId}
                disabled={disabled}
                onChange={(event) => shop.setSellerStoreId(Number(event.target.value))}
              >
                {shop.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        storeName={shop.stores.find((store) => store.id === storeId)?.name}
        product={null}
        storeId={storeId}
        busy={disabled}
        onSave={shop.saveProduct}
        onDone={() => navigate('/seller/products')}
      />
    </section>
  );
}
