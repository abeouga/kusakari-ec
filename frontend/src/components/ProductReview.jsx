import { yen } from '../api';
import { modelPreviewUrl } from '../plantModel';

/**
 * Last step of a new product: the product as buyers will see it, close to the catalog card (issue #53).
 * Values decided later (the product number) and sizes are left out. 「戻る」 leads back step by step;
 * the progress bar only shows the current step (#45).
 * @param {{draft:Record<string,any>,plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>,storeName:string}} props
 */
export function ProductReview({ draft: p, plant, storeName }) {
  const images = [p.imageUrl, ...String(p.images).split('\n')].filter(Boolean);
  const details = [
    ['生産者名', p.nurseryName],
    ['科名・属名', p.familyName],
    ['樹齢目安', p.ageYears === '' || p.ageYears === null ? '' : `${p.ageYears}年`],
  ].filter(([, value]) => String(value).trim() !== '');
  // The same Canvas preview as the garden-object step; the step has already checked the height.
  const model =
    plant.configured && plant.height !== ''
      ? modelPreviewUrl({ ...plant.profile, heightCm: Number(plant.height) })
      : '';
  const stock = Number(p.stock);
  return (
    <section className="product-review" aria-label="出品内容の確認">
      <div className="product-review-media">
        <div className="product-review-photo">
          <img src={images[0]} alt={p.name || '出品する商品画像'} />
        </div>
        {images.length > 1 && (
          <ul className="product-review-thumbs" aria-label={`商品画像 ${images.length}枚`}>
            {images.map((url, index) => (
              <li key={url}>
                {/* The first image is already shown large above, so its thumbnail is not read twice. */}
                <img src={url} alt={index === 0 ? '' : `商品画像 ${index + 1}`} />
              </li>
            ))}
          </ul>
        )}
        {model && (
          <figure className="product-review-model">
            <iframe src={model} title="出品する植物の3Dプレビュー" />
            <figcaption>庭に置いたときの3Dモデル</figcaption>
          </figure>
        )}
      </div>
      <div className="product-review-body">
        <h4>{p.name}</h4>
        {p.latinName && <p className="latin">{p.latinName}</p>}
        <p className="product-review-price">
          {yen(Number(p.priceYen))}
          <small>税込</small>
        </p>
        <dl className="product-review-facts">
          <div>
            <dt>登録店舗</dt>
            <dd>{storeName}</dd>
          </div>
          <div>
            <dt>在庫</dt>
            <dd className={stock > 0 ? 'stock' : 'sold-out'}>{stock > 0 ? `${stock} 点` : '在庫なし'}</dd>
          </div>
          <div>
            <dt>カテゴリー</dt>
            <dd>{p.category}</dd>
          </div>
        </dl>
        <div className="product-review-description">
          <h5>商品説明</h5>
          <p>{p.description}</p>
        </div>
        {details.length > 0 && (
          <dl className="product-review-details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
