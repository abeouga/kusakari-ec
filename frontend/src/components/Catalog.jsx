import { catalogText } from '../catalogText';
import { useState } from 'react';
import { Leaf, Search, X } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { AddToShoppingList } from './AddToShoppingList';
import { login } from '../auth';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onDetail:(id:string)=>void}} props */
export function Catalog({ shop, onDetail }) {
  const categories = ['すべて', ...new Set(shop.products.map((product) => product.category))];
  const [category, setCategory] = useState('すべて');
  const [search, setSearch] = useState('');
  const [listProduct, setListProduct] = useState(/** @type {import('../types').Product|null} */ (null));
  const [sort, setSort] = useState('recommended');
  const [inStockOnly, setInStockOnly] = useState(false);
  const keyword = search.trim().toLowerCase();
  const [sunlight, setSunlight] = useState('');
  const [careLevel, setCareLevel] = useState('');
  const [nursery, setNursery] = useState('');
  const [useCase, setUseCase] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const nurseries = /** @type {string[]} */ ([]);
  for (const product of shop.products) {
    if (product.nurseryName && !nurseries.includes(product.nurseryName)) nurseries.push(product.nurseryName);
  }
  const products = [];
  for (const product of shop.products) {
    if (category !== 'すべて' && product.category !== category) continue;
    if (inStockOnly && product.stock === 0) continue;
    if (sunlight && product.sunlight !== sunlight) continue;
    if (careLevel && product.careLevel !== Number(careLevel)) continue;
    if (nursery && product.nurseryName !== nursery) continue;
    if (useCase && !product.useCase.includes(useCase)) continue;
    if (maxPrice && product.priceYen > Number(maxPrice)) continue;
    const text =
      `${product.name} ${product.latinName} ${product.sku} ${product.description} ${product.nurseryName} ${product.useCase}`.toLowerCase();
    if (!text.includes(keyword)) continue;
    products.push(product);
  }
  if (sort === 'price-asc') {
    products.sort((a, b) => a.priceYen - b.priceYen);
  }
  if (sort === 'price-desc') {
    products.sort((a, b) => b.priceYen - a.priceYen);
  }
  const loading = !shop.cart && shop.busy;

  if (sort === 'newest') products.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (sort === 'care') products.sort((a, b) => a.careLevel - b.careLevel);
  function reset() {
    setCategory('すべて');
    setSearch('');
    setInStockOnly(false);
    setSunlight('');
    setCareLevel('');
    setNursery('');
    setUseCase('');
    setMaxPrice('');
  }
  return (
    <section className="catalog section-container" id="plants">
      <div className="section-heading">
        <div>
          <p className="eyebrow">FIND YOUR GREEN</p>
          <h2>庭と部屋を彩る、植物のカタログ。</h2>
        </div>
        <p>
          庭にも、ベランダにも、お部屋にも。
          <br />
          植物との暮らしを、ここから。
        </p>
      </div>
      <div className="catalog-controls">
        <div className="categories" aria-label="商品カテゴリー">
          {categories.map((item) => (
            <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="植物を検索"
            placeholder="名前・品番・生産者で検索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button aria-label="検索をクリア" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </label>
      </div>
      <div className="catalog-meta">
        <span>
          {products.length} ITEMS <small>/ すべて税込価格</small>
        </span>
        <div>
          <label className="stock-filter">
            <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
            在庫ありのみ
          </label>
          <select aria-label="商品の並び順" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recommended">おすすめ順</option>
            <option value="price-asc">価格が安い順</option>
            <option value="price-desc">価格が高い順</option>
            <option value="newest">新着順</option>
            <option value="care">育てやすさ順</option>
          </select>
        </div>
      </div>
      <div className="catalog-layout">
        <aside className="catalog-sidebar">
          <h3>絞り込み条件</h3>
          <label>
            日照条件
            <select aria-label="日照条件" value={sunlight} onChange={(e) => setSunlight(e.target.value)}>
              <option value="">すべて</option>
              <option>日なた</option>
              <option>半日陰</option>
              <option>日陰</option>
            </select>
          </label>
          <label>
            用途・植栽場所
            <select aria-label="用途・植栽場所" value={useCase} onChange={(e) => setUseCase(e.target.value)}>
              <option value="">すべて</option>
              <option>シンボルツリー</option>
              <option>ベランダ</option>
              <option>室内</option>
              <option>ハーブ</option>
              <option>花壇</option>
            </select>
          </label>
          <label>
            手入れレベル
            <select aria-label="手入れレベル" value={careLevel} onChange={(e) => setCareLevel(e.target.value)}>
              <option value="">すべて</option>
              <option value="1">1：育てやすい</option>
              <option value="2">2：定期的な手入れ</option>
              <option value="3">3：こまめな手入れ</option>
            </select>
          </label>
          <label>
            出店者・ナーセリー
            <select aria-label="出店者・ナーセリー" value={nursery} onChange={(e) => setNursery(e.target.value)}>
              <option value="">すべて</option>
              {nurseries.map((name) => (
                <option key={name} value={name}>
                  {catalogText(name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            価格上限（円）
            <input
              aria-label="価格上限"
              type="number"
              min="0"
              max="100000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="指定なし"
            />
          </label>
          <button className="text-button" onClick={reset}>
            絞り込みを解除
          </button>
        </aside>
        <div className="catalog-results">
          {shop.error && (
            <div className="error" role="alert">
              {shop.error}
              <button className="text-button" onClick={shop.initialize} disabled={shop.busy}>
                再読み込み
              </button>
            </div>
          )}
          {loading && (
            <div className="loading" role="status">
              植物を読み込んでいます…
            </div>
          )}
          {!loading && (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={() => onDetail(product.id)}
                  onAdd={() => shop.add(product.id)}
                  onAddToList={() => {
                    if (!shop.cart) login();
                    else setListProduct(product);
                  }}
                  disabled={shop.busy || !shop.cart}
                />
              ))}
            </div>
          )}
          {shop.cart && !products.length && (
            <div className="empty">
              <Leaf size={30} />
              <h3>条件に合う植物が見つかりません。</h3>
              <button className="secondary-button" onClick={reset}>
                条件をリセット
              </button>
            </div>
          )}
        </div>
      </div>
      {listProduct && <AddToShoppingList product={listProduct} onClose={() => setListProduct(null)} />}
    </section>
  );
}
