import { ArrowLeft } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Cart } from './Cart';
import { ShoppingTransferNotice } from './GardenItemsDialog';
import { PageLink } from '../workspace/Common';
import { buyerOnlyMessage } from '../auth';

/** @param {{shop:ReturnType<import('../useShop').useShop>,header:import('react').ReactNode}} props */
export function CartPage({ shop, header }) {
  return (
    <>
      {header}
      <main className="standalone-cart-main">
        <div className="shopping-page-intro">
          <PageLink className="text-link back-link" href="/#plants">
            <ArrowLeft size={16} aria-hidden />
            戻る
          </PageLink>
        </div>
        {shop.buyerBlocked ? (
          // Issue #108: the cart is for buyers; shop accounts and applicants get a note instead.
          <section className="cart-content cart-empty-state">
            <h2>ショッピングカート</h2>
            <p className="buyer-only-note" role="note">
              {buyerOnlyMessage}
            </p>
            <PageLink className="primary-button" href="/#plants">
              商品を探す
            </PageLink>
          </section>
        ) : (
          <div>
            <ShoppingTransferNotice shop={shop} />
            <Cart shop={shop} />
          </div>
        )}
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
        </div>
      </footer>
    </>
  );
}
