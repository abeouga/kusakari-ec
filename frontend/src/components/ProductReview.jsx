/** @param {{draft:Record<string,any>,plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>,storeName:string,onEdit:(step:number)=>void}} props */
export function ProductReview({ draft: p, plant, storeName, onEdit }) {
  const details = [
    ['商品説明', p.description],
    ['生産者名', p.nurseryName],
    ['学名', p.latinName],
    ['科名・属名', p.familyName],
    ['樹齢', p.ageYears],
  ];
  return (
    <section className="product-review" aria-label="出品内容の確認">
      <img src={p.imageUrl} alt="出品する商品画像" />
      <div>
        <h4>{p.name}</h4>
        <p>
          {Number(p.priceYen).toLocaleString()}円（税込） · 在庫 {p.stock}
        </p>
        <dl>
          <dt>登録店舗</dt>
          <dd>{storeName}</dd>
          <dt>カテゴリー</dt>
          <dd>{p.category}</dd>
          <dt>商品番号</dt>
          <dd>{p.sku}</dd>
          <dt>高さ / 鉢径</dt>
          <dd>
            {p.heightCm || '未設定'} / {p.potDiameterCm || '未設定'} cm
          </dd>
        </dl>
        <button type="button" className="text-button" onClick={() => onEdit(0)}>
          商品情報を修正
        </button>
        <p>庭オブジェクト：{plant.enabled ? '設定あり' : '設定なし'}</p>
        {plant.enabled && (
          <p>
            高さ {plant.height} cm / 幅 {plant.profile.widthCm} cm
          </p>
        )}
        {plant.enabled && plant.estimated && <p className="ai-estimate">AI推定・実寸未確認</p>}
        <button type="button" className="text-button" onClick={() => onEdit(1)}>
          庭オブジェクトを修正
        </button>
        <details>
          <summary>詳しい情報を確認</summary>
          <dl>
            {details
              .filter(([, v]) => v !== '' && v !== null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </details>
      </div>
    </section>
  );
}
