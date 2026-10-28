/**
 * Lists only the stores the signed-in seller manages (all stores for administrators).
 * @param {{shop:ReturnType<import('../useShop').useShop>,disabled:boolean,label?:string,onChange?:()=>void}} props
 */
export function SellerStoreSelect({ shop, disabled, label = '管理する店舗', onChange }) {
  if (shop.sellerStoresLoading) return <p className="muted">管理する店舗を確認しています。</p>;
  if (!shop.sellerStoreId) return <p role="alert">管理できる店舗がありません。</p>;
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={shop.sellerStoreId}
        disabled={disabled}
        onChange={(event) => {
          onChange?.();
          shop.setSellerStoreId(Number(event.target.value));
        }}
      >
        {shop.sellerStores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
    </label>
  );
}
