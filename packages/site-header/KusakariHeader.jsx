import { History, LogIn, ShoppingCart, UserRound } from 'lucide-react';

/**
 * @param {{ecUrl:string,canvasUrl:string,logoUrl:string,activeSection?:string,
 * cartCount?:number|null,cartText?:string,authenticated?:boolean,showAdmin?:boolean,showSeller?:boolean,disabled?:boolean,onPanel?:(panel:string)=>void,
 * onNavigate?:(url:string)=>void}} props
 */
export function KusakariHeader({
  ecUrl, canvasUrl, logoUrl, activeSection = '', cartCount = null,
  authenticated = false, showAdmin = false, showSeller = false, disabled = false, onPanel, onNavigate, cartText = 'カート',
}) {
  /** @param {string} path @param {string} [panel] */
  function shopUrl(path, panel) {
    const url = new URL(path, ecUrl);
    if (panel) url.searchParams.set('panel', panel);
    return url.href;
  }

  /** @param {import('react').MouseEvent<HTMLAnchorElement>} event */
  function follow(event) {
    if (disabled) { event.preventDefault(); return; }
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (onNavigate) { event.preventDefault(); onNavigate(event.currentTarget.href); }
  }

  /** @param {string} panel @param {import('react').ReactNode} content @param {string} [className] */
  function panelAction(panel, content, className = '') {
    if (onPanel) {
      return <button className={className} disabled={disabled} onClick={() => onPanel(panel)}>{content}</button>;
    }
    return <a className={className} href={shopUrl('/', panel)} onClick={follow}>{content}</a>;
  }

  let cartLabel = cartText === 'カート' ? 'カートを開く' : cartText;
  let countText = '—';
  let countTitle = 'カートの商品数はECで確認できます';
  if (cartCount !== null) cartLabel += `（${cartCount}点）`;
  if (cartCount !== null) {
    countText = String(cartCount);
    countTitle = `${cartCount}点`;
  }

  return (
    <div className="kusakari-site-chrome" data-header-version="0.1.8">
      <div className="announcement">
        <span>GREEN FOR YOUR EVERYDAY</span>
        <span>ひと鉢からはじまる、緑のある暮らし。</span>
        <span>植物のオンラインストア</span>
      </div>
      <header className="site-header kusakari-site-header">
        <a className="brand" href={shopUrl('/')} aria-label="Kusakari トップへ" onClick={follow}>
          <img className="brand-icon" src={logoUrl} alt="" aria-hidden="true" />
          <span>kusakari<span className="brand-dot">.</span></span>
        </a>
        <nav aria-label="メインナビゲーション">
          <a className={activeSection === 'plants' ? 'active' : ''} href={shopUrl('/#plants')} onClick={follow}>植物を探す</a>
          {panelAction('stores', '店舗を探す')}
          <a className={activeSection === 'canvas' ? 'active' : ''} href={canvasUrl} onClick={follow}>Canvas</a>
          {panelAction('guide', 'Kusakariについて')}
          {showSeller && <a href={shopUrl('/seller')} onClick={follow}>出店者</a>}
        </nav>
        <div className="workspace-entry-links">
          {!authenticated && panelAction('login', <><LogIn size={16} aria-hidden="true" />ログイン</>, 'login-entry')}
          <a className="account-entry" href={shopUrl('/account')} onClick={follow}>
            <span className="account-entry-avatar"><UserRound size={17} aria-hidden="true" /></span>
            <span>アカウント</span>
          </a>
          {showAdmin && <a href={shopUrl('/operator')} onClick={follow}>管理者画面</a>}
        </div>
        <div className="header-actions">
          {panelAction('orders', <><History size={18} aria-hidden="true" />注文履歴</>, 'history-button')}
          <a className="bag-button" href={shopUrl('/cart')} aria-label={cartLabel} onClick={follow}>
            <ShoppingCart size={20} aria-hidden="true" />
            <span className="bag-text">{cartText}</span>
            <span className="bag-count" title={countTitle}>{countText}</span>
          </a>
        </div>
      </header>
    </div>
  );
}
