import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, PencilRuler, X } from 'lucide-react';
import { useShop } from './useShop';
import { BrandIcon } from './components/BrandIcon';
import { usePath, navigate } from './workspace/navigation';
import { KusakariHeader } from '@kusakari/site-header';
import '@kusakari/site-header/style.css';
import { Workspace } from './workspace/Workspace';
import { PageLink } from './workspace/Common';
import { Catalog } from './components/Catalog';
import { ProductManager } from './components/ProductManager';
import { ProductDetail } from './components/ProductDetail';
import { HeroProductCarousel } from './components/HeroProductCarousel';
import { Dialog } from './components/Dialog';
import { CartPage } from './components/CartPage';
import { Stores } from './components/Stores';
import { LoginPage } from './components/LoginPage';
import { SessionNotice, flashNotice } from './components/SessionNotice';
import { StickyHeader } from './components/StickyHeader';
import { login, redirectToLogin } from './auth';
import { useAuth } from './useAuth';

const canvasUrl = new URL(import.meta.env.VITE_KUSAKARI_CANVAS_URL || 'http://127.0.0.1:5173/', window.location.origin)
  .href;

/** @param {string} url */
function navigateFromHeader(url) {
  const target = new URL(url);
  const canvas = new URL(canvasUrl);
  if (
    target.origin !== window.location.origin ||
    (target.origin === canvas.origin && target.pathname.startsWith(canvas.pathname))
  ) {
    window.location.assign(url);
    return;
  }
  navigate(target.pathname + target.search + target.hash);
  if (target.hash === '#plants') document.getElementById('plants')?.scrollIntoView();
}

function requestedPanel() {
  const panel = new URLSearchParams(window.location.search).get('panel');
  if (panel === 'stores' || panel === 'guide' || panel === 'login') return panel;
  return '';
}

export default function App() {
  const shop = useShop();
  const { session, error: authError } = useAuth();
  const location = usePath();
  const path = location.split('#')[0];
  const [panel, setPanel] = useState(requestedPanel);
  const [detailId, setDetailId] = useState('');
  const [flash, setFlash] = useState(flashNotice);
  const detail = shop.products.find((product) => product.id === detailId);
  let itemCount = 0;
  let storeName = '';
  if (shop.cart) {
    itemCount = shop.cart.itemCount;
    storeName = shop.cart.storeName;
  }
  /** @param {string} id */
  function openDetail(id) {
    shop.setError('');
    shop.setNotice('');
    setDetailId(id);
  }

  function close() {
    setPanel('');
    setDetailId('');
    shop.setLastOrders(null);
  }
  /** @param {string} next */
  function open(next) {
    if (next === 'login') {
      login();
      return;
    }
    shop.setError('');
    shop.setNotice('');
    setPanel(next);
  }

  const workspace = path !== '/' && path !== '/cart';
  // Issue #10: carts belong to signed-in members, so signed-out visitors go to the login page and return here afterwards.
  const cartLoginRequired = Boolean(path === '/cart' && session && !session.authenticated);
  useEffect(() => {
    if (cartLoginRequired) redirectToLogin();
  }, [cartLoginRequired]);
  /** @param {string} next */
  function openHeaderPanel(next) {
    if (next === 'login') {
      login();
      return;
    }
    if (workspace || next === 'guide') navigate('/');
    open(next);
  }
  const header = (
    <>
      <StickyHeader>
        <KusakariHeader
          ecUrl={window.location.origin}
          canvasUrl={canvasUrl}
          logoUrl="/icon/kusakari_ico.png"
          activeSection={path === '/' ? 'plants' : ''}
          cartCount={itemCount}
          authenticated={session?.authenticated ?? false}
          showAdmin={session?.authenticated && session.email === 'test.admin@example.com' && session.role === 'ADMIN'}
          showSeller={session?.authenticated && ['SELLER', 'ADMIN'].includes(session.role || '')}
          onPanel={openHeaderPanel}
          onNavigate={navigateFromHeader}
        />
        <SessionNotice />
      </StickyHeader>
      {flash && (
        <p className="flash-notice" role="status">
          {flash}{' '}
          <button type="button" className="text-button" onClick={() => setFlash('')}>
            閉じる
          </button>
        </p>
      )}
    </>
  );
  if (path === '/account/login' || panel === 'login') return <LoginPage />;
  if (workspace) {
    return <Workspace shop={shop} path={path} header={header} />;
  }

  if (path === '/cart' && !session?.authenticated) {
    return (
      <>
        {header}
        <main className="standalone-cart-main">
          {authError ? <p role="alert">{authError}</p> : <p role="status">ログイン状態を確認しています。</p>}
        </main>
      </>
    );
  }
  if (path === '/cart') {
    return (
      <CartPage shop={shop} header={header} />
    );
  }

  return (
    <>
      <a className="skip-link" href="#plants">
        商品一覧へスキップ
      </a>
      {header}

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-line" /> ROOTED IN EVERYDAY LIFE
            </p>
            <h1>
              植物と、
              <br />
              暮らす<span className="soft-dot">。</span>
            </h1>
            <p className="hero-description">
              朝の光に揺れる葉。
              <br />
              ふと目を向けたくなる、小さな緑。
              <br />
              あなたの毎日に、ひと鉢の余白を。
            </p>
            <a className="canvas-entry-button" href={canvasUrl}>
              <span className="canvas-entry-icon">
                <PencilRuler size={22} aria-hidden="true" />
              </span>
              <span className="canvas-entry-copy">
                <small>KUSAKARI CANVAS</small>
                <strong>Canvasでお気に入りの植物を探す</strong>
              </span>
              <ArrowUpRight className="canvas-entry-arrow" size={16} />
            </a>
            <div className="hero-footnote">
              <span>01 — THE GREEN COLLECTION</span>
              <ArrowDown size={16} />
            </div>
          </div>
          <HeroProductCarousel
            products={shop.products}
            storeId={shop.cart?.storeId ?? 1}
            onDetail={openDetail}
            paused={Boolean(detail) || Boolean(panel)}
            loading={shop.busy}
          />
        </section>

        <Catalog shop={shop} onDetail={openDetail} />

        <section className="editorial section-container">
          <div>
            <p className="eyebrow">OUR PHILOSOPHY</p>
            <h2>
              育てる時間も、
              <br />
              暮らしの一部に。
            </h2>
          </div>
          <div>
            <p>
              葉が一枚増えたこと。いつもより花が開いたこと。
              <br />
              小さな変化を見つける時間が、毎日に余白をつくります。
            </p>
            <button className="text-link" onClick={() => open('guide')}>
              Kusakariについて
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <span className="brand footer-brand">
            <BrandIcon />
            <span>kusakari.</span>
          </span>
          <p>植物と、暮らす。</p>
        </div>
        <div className="footer-links">
          <PageLink href="/seller/products">出店者ポータル</PageLink>
          <button onClick={() => open('manage')}>商品管理</button>
          <button onClick={() => open('guide')}>ご利用ガイド</button>
          <button onClick={() => open('stores')}>店舗一覧</button>
          <PageLink href="/purchases">注文履歴</PageLink>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Kusakari</span>
        </div>
      </footer>

      {shop.notice && !panel && !detail && (
        <div className="toast" role="status">
          <Check size={17} />
          {shop.notice}
          <a href="/cart">
            カートを見る
            <ArrowRight size={15} />
          </a>
          <button aria-label="通知を閉じる" onClick={() => shop.setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {detail && (
        <ProductDetail
          key={detail.id}
          product={detail}
          storeName={storeName}
          storeId={shop.cart?.storeId}
          canvasUrl={canvasUrl}
          onClose={close}
          onAdd={(quantity) => shop.add(detail.id, quantity)}
          busy={shop.busy}
          notice={shop.notice}
          error={shop.error}
        />
      )}
      {panel === 'stores' && <Stores shop={shop} onClose={close} />}
      {panel === 'manage' && <ProductManager shop={shop} onClose={close} />}
      {panel === 'guide' && (
        <Dialog title="Kusakariについて" onClose={close}>
          <div className="guide">
            <p className="eyebrow">PLANTS FOR EVERYDAY LIVING</p>
            <h3>植物と暮らす、はじめの一歩。</h3>
            <p>Kusakariは、庭木・草花・ハーブ・観葉植物を探し、店舗ごとの価格と在庫を確認できるECサイトです。</p>
            <h4>お買い物の流れ</h4>
            <ol>
              <li>受取店舗を選び、植物をカートに追加します。</li>
              <li>カートで購入個数と合計金額を確認します。</li>
              <li>確認画面から注文を確定します。</li>
            </ol>
            <h4>お買い物について</h4>
            <p>価格はすべて税込です。店舗受け取りは無料です。</p>
            <p>カートと注文履歴はログイン中のアカウントに保存されます。再ログイン後も確認できます。</p>
          </div>
        </Dialog>
      )}
    </>
  );
}
