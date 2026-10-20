import { catalogText } from '../catalogText';
import { ArrowUpRight, ListPlus, Plus } from 'lucide-react';
import { yen } from '../api';

/** @param {{product:import('../types').Product, onOpen:()=>void, onAdd:()=>void, onAddToList:()=>void, disabled:boolean}} props */
export function ProductCard({ product, onOpen, onAdd, onAddToList, disabled }) {
  let stockClass = 'sold-out';
  let stockLabel = 'この店舗では在庫なし';
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
      <p className="product-excerpt">{catalogText(product.description)}</p>
      <div className="product-bottom">
        <span className="price">
          {yen(product.priceYen)} <small>税込</small>
        </span>
        <div className="product-actions">
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
          <button
            className="add-button"
            onClick={onAdd}
            disabled={disabled || !product.stock}
            aria-label={`${product.name}をカートに追加`}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}
