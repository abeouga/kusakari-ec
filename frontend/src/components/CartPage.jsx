import { ShoppingCart, Sprout } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Cart } from './Cart';
import { ShoppingListDetail, ShoppingListOverview, ShoppingTransferNotice } from './ShoppingLists';
import { navigate } from '../workspace/navigation';
import { PageLink } from '../workspace/Common';
import { login } from '../auth';

/** @param {{shop:ReturnType<import('../useShop').useShop>,onStores:()=>void,gardenId?:string,showGardens:boolean,header:import('react').ReactNode}} props */
export function CartPage({ shop, onStores, gardenId = '', showGardens, header }) {
  const gardens = showGardens || !!gardenId;
  function switchTab() {
    navigate(gardens ? '/cart' : '/cart#garden-shopping-lists');
    requestAnimationFrame(() => document.getElementById(gardens ? 'cart-tab' : 'gardens-tab')?.focus());
  }
  /** @param {import('react').KeyboardEvent} event */
  function moveTab(event) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if ((event.key === 'Home' && !gardens) || (event.key === 'End' && gardens)) return;
      switchTab();
    }
  }
  return <>
    {header}
    <main className="standalone-cart-main">
      <div className="shopping-page-intro">
        <div><p className="eyebrow">FROM YOUR GARDEN TO YOUR HOME</p><h1>庭の計画を、暮らしの中へ。</h1></div>
        <PageLink className="text-link" href="/#plants">植物を探す →</PageLink>
      </div>
      <div className="shopping-segments" role="tablist" aria-label="お買い物の表示" onKeyDown={moveTab}>
        <button type="button" role="tab" id="cart-tab" aria-controls="cart-panel" aria-selected={!gardens} tabIndex={gardens ? -1 : 0}
          onClick={() => navigate('/cart')}><ShoppingCart size={18} aria-hidden="true"/>カート<span>{shop.cart?.itemCount ?? 0}</span></button>
        <button type="button" role="tab" id="gardens-tab" aria-controls="gardens-panel" aria-selected={gardens} tabIndex={gardens ? 0 : -1}
          onClick={() => navigate('/cart#garden-shopping-lists')}><Sprout size={18} aria-hidden="true"/>庭の買い物リスト</button>
      </div>
      <div role="tabpanel" id={gardens ? 'gardens-panel' : 'cart-panel'} aria-labelledby={gardens ? 'gardens-tab' : 'cart-tab'}>
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
