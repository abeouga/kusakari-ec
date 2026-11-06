import { ArrowLeft } from 'lucide-react';
import { ProductForm } from '../components/ProductForm';
import { StorePicker } from '../components/StorePicker';
import { navigate } from './navigation';

/** @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function ProductCreatePage({ shop }) {
  const storeId = shop.sellerStoreId;
  const disabled = shop.busy;
  let storeSelector = (
    <StorePicker stores={shop.sellerStores} value={storeId} disabled={disabled} onChange={shop.setSellerStoreId} />
  );
  if (shop.sellerStoresLoading) storeSelector = <p className="muted">管理する店舗を確認しています。</p>;
  else if (!storeId) storeSelector = <p role="alert">管理できる店舗がありません。</p>;
  return (
    <section className="workspace-card">
      <button
        type="button"
        className="page-back-button"
        aria-label="商品一覧へ戻る"
        onClick={() => navigate('/seller/products')}
        disabled={shop.busy}
      >
        <ArrowLeft size={16} aria-hidden />
        戻る
      </button>

      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      <ProductForm
        storeSelector={storeSelector}
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
