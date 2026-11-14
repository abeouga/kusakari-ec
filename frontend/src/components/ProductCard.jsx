import { catalogText } from '../catalogText';
// #65 ListPlus は「買い物リストに追加」ボタンのアイコン。ボタンを戻すときに import へ戻す。
import { ArrowUpRight, Plus } from 'lucide-react';
import { yen } from '../api';

// #65 カート追加ボタンと区別しにくいため「買い物リストに追加」ボタンを画面から外した。
// 別の形で戻す可能性があるため、ボタンはコメントで残している。戻すときは型と引数に onAddToList:()=>void を加える。
/** canBuy is false for shop accounts and applicants (issue #108): the cart button is left out.
 * @param {{product:import('../types').Product, onOpen:()=>void, onAdd:()=>void, disabled:boolean, canBuy:boolean}} props */
export function ProductCard({ product, onOpen, onAdd, disabled, canBuy }) {
  let stockClass = 'sold-out';
  let stockLabel = '在庫なし';
  if (product.stock > 0) {
    stockClass = 'stock';
    stockLabel = `在庫 ${product.stock} 点`;
  }
  return (
    <article className="product-card" data-testid={`product-${product.id}`}>
      <button className="product-photo" onClick={onOpen} aria-label={`${product.name}の詳細`}>
        <img src={product.imageUrl} alt={product.name} loading="lazy" width="1024" height="1536" />
        <span className="product-badge">{product.badge}</span>
        <span className="photo-arrow">
          <ArrowUpRight size={20} />
        </span>
      </button>
      <div className="product-meta">
        <span>{product.category}</span>
        <span className={stockClass}>{stockLabel}</span>
      </div>
      <button className="product-name" onClick={onOpen}>
        {product.name}
      </button>
      <p className="latin">{product.latinName}</p>
      <p className="product-nursery">{catalogText(product.nurseryName)}</p>
      <p className="product-nursery">販売店舗：{product.sellerStoreName}</p>
      <p className="product-excerpt">{catalogText(product.description)}</p>
      <div className="product-bottom">
        <span className="price">
          {yen(product.priceYen)} <small>税込</small>
        </span>
        <div className="product-actions">
          {/* #65 「買い物リストに追加」ボタン。カート追加ボタンと混同されるため無効化している。
          <button
            type="button"
            className="add-button shopping-list-button"
            onClick={onAddToList}
            aria-label={`${product.name}を買い物リストに追加`}
            aria-haspopup="dialog"
            title="買い物リストに追加"
          >
            <ListPlus size={18} aria-hidden="true" />
          </button>
          */}
          {canBuy && (
            <button
              className="add-button"
              onClick={onAdd}
              disabled={disabled || !product.stock}
              aria-label={`${product.name}をカートに追加`}
            >
              <Plus size={20} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
