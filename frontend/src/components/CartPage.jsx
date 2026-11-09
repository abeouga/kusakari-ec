import { ArrowLeft } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Cart } from './Cart';
import { ShoppingTransferNotice } from './GardenItemsDialog';
import { PageLink } from '../workspace/Common';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onStores:()=>void,header:import('react').ReactNode}} props */
export function CartPage({ shop, onStores, header }) {
  return <>
    {header}
    <main className="standalone-cart-main">
      <div className="shopping-page-intro">
        <PageLink className="text-link back-link" href="/#plants"><ArrowLeft size={16} aria-hidden />戻る</PageLink>
      </div>
      <div>
        <ShoppingTransferNotice shop={shop}/><Cart shop={shop} onStores={onStores}/>
      </div>
    </main>
    <footer className="site-footer cart-page-footer">
      <div><a className="brand footer-brand" href="/"><BrandIcon/><span>kusakari.</span></a><p>植物と、暮らす。</p></div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} Kusakari</span></div>
    </footer>
  </>;
}
