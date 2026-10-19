import { catalogText } from '../catalogText';
import { PageLink } from '../workspace/Common';
import { useState } from 'react';
import { ShoppingBag, MapPin, Eye, ArrowUpRight } from 'lucide-react';
import { Dialog } from './Dialog';
import { yen } from '../api';

/** @param {{product:import('../types').Product,storeName:string,storeId?:number,canvasUrl:string,onClose:()=>void,onAdd:(quantity:number)=>void,busy:boolean,notice:string,error:string}} props */
export function ProductDetail({ product, storeName, storeId = 1, canvasUrl, onClose, onAdd, busy, notice, error }) {
  const [image, setImage] = useState(product.imageUrl);
  const [quantity, setQuantity] = useState(1);

  const images = [];
  if (product.imageUrl) {
    images.push(product.imageUrl);
  }

  const productImages = Array.isArray(product.images) ? product.images : [];

  for (const url of productImages) {
    if (url && !images.includes(url)) {
      images.push(url);
    }
  }
  let maxQuantity = 99;
  if (product.stock < maxQuantity) maxQuantity = product.stock;
  return (
    <Dialog title="植物について" onClose={onClose} wide>
      <p className="detail-breadcrumb">
        植物を探す / {product.category} / {product.name}
      </p>
      <div className="product-detail mockup-detail">
        <div>
          <img className="detail-main-image" src={image} alt={product.name} />
          {images.length > 1 && (
            <div className="detail-gallery">
              {images.map((url, index) => (
                <button
                  key={url}
                  onClick={() => setImage(url)}
                  aria-label={`商品画像${index + 1}`}
                  aria-pressed={image === url}
                >
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}
          <div className="spec-chips">
            <div>
              <small>出店者・生産者</small>
              <PageLink href={`/store/${storeId}`}>販売店舗の紹介を見る</PageLink>
              <strong>{catalogText(product.nurseryName) || '未設定'}</strong>
              <small>{catalogText(product.nurseryAddress)}</small>
            </div>
            <div>
              <small>樹齢目安</small>
              {product.ageYears !== null && <strong>約 {product.ageYears} 年</strong>}
              {product.ageYears === null && <strong>未設定</strong>}
            </div>
          </div>
          <section className="spec-sheet">
            <p className="eyebrow">SPECIFICATION SHEET</p>
            <h3>植物の生態・生育スペック</h3>
            <dl>
              <dt>学名・科名</dt>
              <dd>
                {product.latinName}
                <br />
                {product.familyName}
              </dd>
              <dt>高さ・鉢径</dt>
              <dd>
                {product.heightCm !== null && <span>高さ 約{product.heightCm}cm </span>}
                {product.potDiameterCm !== null && <span>/ 鉢径 {product.potDiameterCm}cm</span>}
              </dd>
            </dl>
          </section>
        </div>
        <div className="detail-buy-panel">
          <p className="eyebrow">
            {product.category} / {product.badge}
          </p>
          <p className="stock">
            {storeName} 店頭在庫：{product.stock}点
          </p>
          <h3>{product.name}</h3>
          <p className="latin">{product.latinName}</p>
          <p className="detail-description">{catalogText(product.description)}</p>
          <p className="detail-price">
            {yen(product.priceYen)} <small>税込</small>
          </p>
          <p className="fine-print">商品番号：{product.sku}</p>
          <div className="receiving-note">
            <MapPin size={18} />
            <div>
              <strong>{storeName}で店舗受取</strong>
              <p>店舗受取は無料。自宅配送はカートで選択できます。</p>
            </div>
          </div>
          <label className="detail-quantity">
            購入数量
            <input
              type="number"
              min="1"
              max={maxQuantity}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              disabled={busy || !product.stock}
            />
          </label>
          <button
            className="primary-button"
            disabled={busy || !product.stock || !Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity}
            onClick={() => onAdd(quantity)}
          >
            <ShoppingBag size={18} />
            カートに追加
          </button>
          <div className="canvas-product-entry">
            <a className="canvas-product-button" href={canvasUrl}>
              <Eye size={19} />
              <span>Canvasでイメージする</span>
              <ArrowUpRight size={15} />
            </a>
            <p>商品情報は引き継がれません。</p>
          </div>
          {notice && (
            <p className="success-text" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="nursery-profile">
            <p className="eyebrow">PARTNER NURSERY</p>
            <h4>{catalogText(product.nurseryName) || '生産者未設定'}</h4>
            <p>{catalogText(product.nurseryAddress)}</p>
          </div>
          <div className="care-accordions">
            <details>
              <summary>受取・配送のご案内</summary>
              <p>受取方法と配送先はカートで指定できます。</p>
            </details>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
