import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Leaf } from 'lucide-react';

/** @typedef {{products:import('../types').Product[],storeId:number,onDetail:(id:string)=>void,paused:boolean,loading:boolean}} CarouselProps */

/** @param {CarouselProps} props */
export function HeroProductCarousel(props) {
  // Reset selection only when the store or the ordered product IDs change.
  const collectionKey = JSON.stringify([props.storeId, props.products.map((product) => product.id)]);
  return <ProductSlides key={collectionKey} {...props} />;
}

/** @param {CarouselProps} props */
function ProductSlides({ products, onDetail, paused, loading }) {
  const [slide, setSlide] = useState(() => ({
    index: Math.max(
      0,
      products.findIndex((product) => product.id === 'olive'),
    ),
    previous: /** @type {number|null} */ (null),
    direction: 1,
    sequence: 0,
  }));
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const multiple = products.length > 1;
  const running = multiple && !reducedMotion && !hovered && !focused && !hidden && !paused;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** @param {MediaQueryListEvent} event */
    function changed(event) {
      setReducedMotion(event.matches);
    }
    const visibilityChanged = () => setHidden(document.hidden);
    query.addEventListener('change', changed);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      query.removeEventListener('change', changed);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setSlide((current) => ({
        index: (current.index + 1) % products.length,
        previous: current.index,
        direction: 1,
        sequence: current.sequence + 1,
      }));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [running, products.length, slide.sequence]);

  useEffect(() => {
    if (slide.previous === null) return;
    const timer = window.setTimeout(() => setSlide((current) => ({ ...current, previous: null })), 500);
    return () => window.clearTimeout(timer);
  }, [slide.sequence, slide.previous]);

  /** @param {number} direction */
  function move(direction) {
    setSlide((current) => ({
      index: (current.index + direction + products.length) % products.length,
      previous: current.index,
      direction,
      sequence: current.sequence + 1,
    }));
  }

  return (
    <section
      className="hero-visual"
      aria-label="公開中の商品"
      aria-roledescription="カルーセル"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setHovered(false);
      }}
      onPointerDownCapture={() => setFocused(false)}
      onFocusCapture={(event) => setFocused(event.target.matches(':focus-visible'))}
      onKeyDownCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {!products.length ? (
        <p className="hero-empty" role="status">
          {loading ? '商品を読み込んでいます。' : '現在表示できる商品はありません。'}
        </p>
      ) : (
        <>
          <div className="hero-slides" data-direction={slide.direction} aria-live={running ? 'off' : 'polite'}>
            {[slide.previous, slide.index].map((index, position) => {
              if (index === null) return null;
              const product = products[index];
              const outgoing = position === 0;
              return (
                <div
                  key={`${slide.sequence}-${position}`}
                  className={`hero-slide ${outgoing ? 'hero-slide-outgoing' : slide.previous !== null ? 'hero-slide-incoming' : ''}`}
                  role="group"
                  aria-roledescription="スライド"
                  aria-label={`${index + 1} / ${products.length}`}
                  aria-hidden={outgoing}
                  inert={outgoing}
                  data-product-id={product.id}
                >
                  <div className="hero-image-placeholder" aria-hidden="true">
                    <Leaf size={44} />
                    <span>商品画像</span>
                  </div>
                  {product.imageUrl && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      fetchPriority={index === slide.index ? 'high' : 'auto'}
                      width="1024"
                      height="1536"
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                  )}
                  <button
                    className="hero-product-label"
                    aria-label={`${product.name}の商品詳細を見る`}
                    onClick={() => onDetail(product.id)}
                  >
                    <span>
                      <small>MEET YOUR FIRST GREEN</small>
                      <strong>{product.name}</strong>
                      <em>{product.latinName}</em>
                    </span>
                    <ArrowUpRight size={26} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <span className="vertical-caption" aria-hidden="true">
            A LITTLE GREEN, A LITTLE BETTER.
          </span>
          <div className="hero-stamp" aria-hidden="true">
            <Leaf size={23} />
            <span>
              GROW
              <br />
              SLOWLY.
            </span>
          </div>
          {multiple && (
            <div className="hero-carousel-controls" aria-label="商品の切り替え">
              <button className="hero-carousel-previous" type="button" aria-label="前の商品" onClick={() => move(-1)}>
                <ChevronLeft size={24} />
              </button>
              <button className="hero-carousel-next" type="button" aria-label="次の商品" onClick={() => move(1)}>
                <ChevronRight size={24} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
