import { ProductForm } from '../components/ProductForm';
import { SellerStoreSelect } from '../components/SellerStoreSelect';
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
            <SellerStoreSelect shop={shop} disabled={disabled} label="在庫を登録する店舗" />
          </div>
        }
        storeName={shop.sellerStores.find((store) => store.id === storeId)?.name}
        product={null}
        storeId={storeId}
        busy={disabled}
        onSave={shop.saveProduct}
        onDone={() => navigate('/seller/products')}
      />
    </section>
  );
}
