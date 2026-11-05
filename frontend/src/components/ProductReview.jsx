/** @param {{draft:Record<string,any>,plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>,storeName:string,onEdit:(step:number)=>void}} props */
export function ProductReview({ draft: p, plant, storeName, onEdit }) {
  const details = [
    ['商品説明', p.description],
    ['生産者名', p.nurseryName],
    ['学名', p.latinName],
    ['科名・属名', p.familyName],
    ['樹齢', p.ageYears],
  ];
  const imageCount = [p.imageUrl, ...String(p.images).split('\n')].filter(Boolean).length;
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
          <dd>{p.sku || '保存時に自動で決まります'}</dd>
          <dt>鉢径</dt>
          <dd>{p.potDiameterCm ? `${p.potDiameterCm} cm` : '未設定'}</dd>
        </dl>
        <button type="button" className="text-button" onClick={() => onEdit(0)}>
          商品情報を修正
        </button>
        <p>画像：{imageCount}枚</p>
        <button type="button" className="text-button" onClick={() => onEdit(1)}>
          画像を修正
        </button>
        {/* Issue #50: the height comes only from the garden-object step. */}
        <dl>
          <dt>{plant.plant ? '植物の高さ' : '商品の高さ'}</dt>
          <dd>{plant.height ? `${plant.height} cm` : '未設定'}</dd>
          <dt>庭オブジェクト</dt>
          <dd>
            {plant.configured
              ? `設定あり（幅 ${plant.profile.widthCm} cm）`
              : plant.plant
                ? '未設定'
                : 'なし（植物以外のカテゴリー）'}
          </dd>
        </dl>
        {plant.estimated && <p className="ai-estimate">高さはAI推定・実寸未確認です。</p>}
        <button type="button" className="text-button" onClick={() => onEdit(2)}>
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
