import { ArrowLeft } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Cart } from './Cart';
import { ShoppingListDetail, ShoppingListOverview, ShoppingTransferNotice } from './ShoppingLists';
import { PageLink } from '../workspace/Common';
import { login } from '../auth';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onStores:()=>void,gardenId?:string,showGardens:boolean,header:import('react').ReactNode}} props */
export function CartPage({ shop, onStores, gardenId = '', showGardens, header }) {
  const gardens = showGardens || !!gardenId;
  return <>
    {header}
    <main className="standalone-cart-main">
      <div className="shopping-page-intro">
        <PageLink className="text-link back-link" href="/#plants"><ArrowLeft size={16} aria-hidden />戻る</PageLink>
      </div>
      <div>
        {gardens && shop.isGuest ? <section className="cart-content">
          <h2>庭の買い物リスト</h2><p>保存した庭の買い物リストはログイン後に利用できます。</p>
          <button type="button" className="primary-button" onClick={() => login()}>ログイン</button>
        </section> : gardens ? (gardenId ? <ShoppingListDetail key={gardenId + ':' + shop.cart?.storeId} shop={shop} gardenId={gardenId}/> : <ShoppingListOverview/>) : <>
          <ShoppingTransferNotice shop={shop}/><Cart shop={shop} onStores={onStores}/>
        </>}
      </div>
    </main>
    <footer className="site-footer cart-page-footer">
      <div><a className="brand footer-brand" href="/"><BrandIcon/><span>kusakari.</span></a><p>植物と、暮らす。</p></div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} Kusakari</span></div>
    </footer>
  </>;
}
