import { History, ShoppingCart } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Cart } from './Cart';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onOrders:()=>void,onStores:()=>void}} props */
export function CartPage({ shop, onOrders, onStores }) {
  let itemCount = 0;
  if (shop.cart) itemCount = shop.cart.itemCount;

  return (
    <>
      <div className="announcement">
        <span>GREEN FOR YOUR EVERYDAY</span>
        <span>ひと鉢からはじまる、緑のある暮らし。</span>
        <span>植物のオンラインストア</span>
      </div>
      <header className="site-header cart-page-header">
        <a className="brand" href="/" aria-label="Kusakari トップへ">
          <BrandIcon />
          <span>
            kusakari<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="メインナビゲーション">
          <a href="/#plants">植物を探す</a>
        </nav>
        <div className="header-actions">
          <button className="history-button" onClick={onOrders}>
            <History size={18} aria-hidden="true" />
            注文履歴
          </button>
          <a className="bag-button active-bag" href="/cart" aria-current="page" aria-label={`カート（${itemCount}点）`}>
            <ShoppingCart size={20} />
            <span className="bag-text">カート</span>
            <span className="bag-count">{itemCount}</span>
          </a>
        </div>
      </header>
      <main className="standalone-cart-main">
        <Cart shop={shop} onStores={onStores} />
      </main>
      <footer className="site-footer cart-page-footer">
        <div>
          <a className="brand footer-brand" href="/">
            <BrandIcon />
            <span>kusakari.</span>
          </a>
          <p>植物と、暮らす。</p>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Kusakari</span>
          <span>LOCAL DEMO STORE · NO PAYMENT</span>
        </div>
      </footer>
    </>
  );
}
