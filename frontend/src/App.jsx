import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  PencilRuler,
  Leaf,
  X,
  ListTree,
} from 'lucide-react';
import { useShop } from './useShop';
import { BrandIcon } from './components/BrandIcon';
import { useDemo } from './workspace/useDemo';
import { usePath, navigate } from './workspace/navigation';
import { KusakariHeader } from '@kusakari/site-header';
import '@kusakari/site-header/style.css';
import { Workspace } from './workspace/Workspace';
import { PageLink } from './workspace/Common';
import { Catalog } from './components/Catalog';
import { ProductManager } from './components/ProductManager';
import { Orders } from './components/Orders';
import { ProductDetail } from './components/ProductDetail';
import { Dialog } from './components/Dialog';
import { CartPage } from './components/CartPage';
import { Stores } from './components/Stores';
import { Materials } from './components/Materials';

const canvasUrl = import.meta.env.VITE_KUSAKARI_CANVAS_URL || 'http://127.0.0.1:5173/';

/** @param {string} url */
function navigateFromHeader(url) {
  const target = new URL(url);
  if (target.origin !== window.location.origin) {
    window.location.assign(url);
    return;
  }
  navigate(target.pathname + target.search + target.hash);
  if (target.hash === '#plants') document.getElementById('plants')?.scrollIntoView();
}

function requestedPanel() {
  const panel = new URLSearchParams(window.location.search).get('panel');
  if (panel === 'stores' || panel === 'guide' || panel === 'orders') return panel;
  return '';
}

export default function App() {
  const shop = useShop();
  const demo = useDemo();
  const location = usePath();
  const path = location.split('#')[0];
  const [panel, setPanel] = useState(requestedPanel);
  const [detailId, setDetailId] = useState('');
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
    shop.setLastOrder(null);
  }
  /** @param {string} next */
  function open(next) {
    shop.setError('');
    shop.setNotice('');
    setPanel(next);
  }

  if (path !== '/' && path !== '/cart') {
    return <Workspace shop={shop} demo={demo} path={path} />;
  }

  if (path === '/cart') {
    return (
      <>
        <CartPage shop={shop} onOrders={() => open('orders')} onStores={() => open('stores')} />
        {panel === 'stores' && <Stores shop={shop} onClose={close} />}
        {panel === 'orders' && <Orders shop={shop} onClose={close} demo={demo} />}
      </>
    );
  }

  return (
    <>
      <a className="skip-link" href="#plants">
        商品一覧へスキップ
      </a>
      <KusakariHeader
        ecUrl={window.location.origin}
        canvasUrl={canvasUrl}
        logoUrl="/icon/kusakari_ico.png"
        activeSection="plants"
        cartCount={itemCount}
        onPanel={open}
        onNavigate={navigateFromHeader}
      />

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
          <div className="hero-visual">
            <img
              src="/images/olive.png"
              alt="柔らかな光の中のオリーブの鉢植え"
              fetchPriority="high"
              width="1024"
              height="1536"
            />
            <span className="vertical-caption">A LITTLE GREEN, A LITTLE BETTER.</span>
            <button className="hero-product-label" onClick={() => openDetail('olive')} disabled={!shop.products.length}>
              <span>
                <small>MEET YOUR FIRST GREEN</small>
                <strong>オリーブ</strong>
                <em>Olea europaea</em>
              </span>
              <ArrowUpRight size={26} />
            </button>
            <div className="hero-stamp">
              <Leaf size={23} />
              <span>
                GROW
                <br />
                SLOWLY.
              </span>
            </div>
          </div>
        </section>

        <Catalog shop={shop} onDetail={openDetail} />

        <section className="material-banner section-container">
          <div className="material-illustration">
            <ListTree size={44} strokeWidth={1} />
            <span>PLAN → PLANT</span>
          </div>
          <div>
            <p className="eyebrow">FROM YOUR GARDEN PLAN</p>
            <h2>庭の計画を、ひと鉢ずつ。</h2>
            <p>
              材料リストから、必要な植物と購入個数を確認。
              <br />
              理想の庭へ、次の一歩を。
            </p>
          </div>
          <button className="outline-button" onClick={() => open('materials')} disabled={!shop.cart}>
            材料リストから探す
            <ArrowUpRight size={19} />
          </button>
        </section>

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
          <PageLink href="/seller">出店者ポータル</PageLink>
          <button onClick={() => open('manage')}>商品管理</button>
          <button onClick={() => open('guide')}>ご利用ガイド</button>
          <button onClick={() => open('stores')}>店舗一覧</button>
          <button onClick={() => open('orders')}>注文履歴</button>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Kusakari</span>
          <span>LOCAL DEMO STORE · NO PAYMENT</span>
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
      {panel === 'materials' && <Materials shop={shop} onClose={close} />}
      {panel === 'orders' && <Orders shop={shop} onClose={close} demo={demo} />}
      {panel === 'manage' && <ProductManager shop={shop} onClose={close} />}
      {panel === 'guide' && (
        <Dialog title="Kusakariについて" onClose={close}>
          <div className="guide">
            <p className="eyebrow">PLANTS FOR EVERYDAY LIVING</p>
            <h3>植物と暮らす、はじめの一歩。</h3>
            <p>Kusakariは、庭木・草花・ハーブ・観葉植物を探し、店舗ごとの価格と在庫を確認できるECサイトのデモです。</p>
            <h4>お買い物の流れ</h4>
            <ol>
              <li>受取店舗を選び、植物をカートに追加します。</li>
              <li>カートで購入個数と合計金額を確認します。</li>
              <li>確認画面からデモ注文を確定します。</li>
            </ol>
            <h4>このデモでの取り扱い</h4>
            <p>
              すべて税込価格、店舗受け取りは無料です。実決済・配送・実店舗への予約は発生しません。商品画像はAI生成、店舗は架空です。
            </p>
            <p>
              カートと注文履歴はブラウザーのCookieに紐づいて保存されます。Cookieを削除すると、同じ履歴を開けなくなります。連絡先にはデモ情報を入力してください。カード情報は入力しません。
            </p>
            <h4>材料リストについて</h4>
            <p>
              材料コードから商品候補を検索できます。Kusakari
              Canvasの配置一覧から商品候補を確認し、選んだ商品をカートに追加できます。
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
