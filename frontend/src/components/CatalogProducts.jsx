import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductCard } from './ProductCard';
import './catalog-pagination.css';

const PAGE_SIZE = 12;

// #65 「買い物リストに追加」ボタンを画面から外したため onAddToList を受け取らない。
// ボタンを戻すときは型に onAddToList:(product:import('../types').Product)=>void を加え、引数とProductCardへの受け渡しを有効化する。
/** @param {{products:import('../types').Product[], onDetail:(id:string)=>void, onAdd:(id:string)=>void, disabled:boolean, canBuy:boolean}} props */
export function CatalogProducts({ products, onDetail, onAdd, disabled, canBuy }) {
  const [page, setPage] = useState(1);
  const topRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const shouldScrollRef = useRef(false);
  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleProducts = products.slice(start, start + PAGE_SIZE);
  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])]
    .filter((number) => number >= 1 && number <= pageCount)
    .sort((a, b) => a - b);

  /** @param {number} next */
  function changePage(next) {
    if (next === currentPage || next < 1 || next > pageCount) return;
    shouldScrollRef.current = true;
    setPage(next);
  }

  // ページ切り替え後、一覧の先頭(ページ情報の行)までスクロールする
  useLayoutEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage]);

  return (
    <div className="catalog-pages" ref={topRef}>
      <p className="catalog-page-summary" role="status" aria-live="polite" aria-atomic="true">
        {products.length ? start + 1 : 0}–{start + visibleProducts.length}件 / 全{products.length}件
        {pageCount > 1 && `（${currentPage} / ${pageCount}ページ）`}
      </p>
      <div className="product-grid" id="catalog-product-grid">
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onOpen={() => onDetail(product.id)}
            onAdd={() => onAdd(product.id)}
            // #65 買い物リスト追加ダイアログを開く処理の受け渡し。ボタンを戻すときに有効化する。
            // onAddToList={() => onAddToList(product)}
            disabled={disabled}
            canBuy={canBuy}
          />
        ))}
      </div>
      {pageCount > 1 && (
        <nav className="catalog-pagination" aria-label="商品一覧のページ">
          <button
            type="button"
            aria-label="前のページ"
            aria-controls="catalog-product-grid"
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          {pages.map((number, index) => (
            <span className="catalog-page-number" key={number}>
              {index > 0 && number - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}
              <button
                type="button"
                aria-label={`${number}ページ目`}
                aria-current={currentPage === number ? 'page' : undefined}
                aria-controls="catalog-product-grid"
                onClick={() => changePage(number)}
              >
                {number}
              </button>
            </span>
          ))}
          <button
            type="button"
            aria-label="次のページ"
            aria-controls="catalog-product-grid"
            disabled={currentPage === pageCount}
            onClick={() => changePage(currentPage + 1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
