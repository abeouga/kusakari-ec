import { useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutDashboard,
  MessageSquare,
  Package,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
  Warehouse,
} from 'lucide-react';
import { BrandIcon } from '../components/BrandIcon';
import { AccountPage } from './AccountPage';
import { ApplicationPage, ProfilePage, MessagesPage } from './PartnerForms';
import { SampleOrders, SalesPage, CancelRequest } from './OrderPages';
import { ReviewPage, MembersPage, CategoriesPage } from './OperatorPages';
import { ProductInventory } from './ProductInventory';
import { ProductManager } from '../components/ProductManager';
import { Materials } from '../components/Materials';
import { PageLink, MockNote } from './Common';
import { navigate } from './navigation';

const sellerMenu = [
  ['/seller', 'ダッシュボード'],
  ['/seller/products', '商品一覧・登録'],
  ['/seller/inventory', '在庫・販売状態'],
  ['/seller/orders', '受注・発送'],
  ['/seller/sales', '売上・精算'],
  ['/seller/profile', '店舗プロフィール'],
  ['/seller/messages', 'お問い合わせ'],
  ['/seller/application', '出店申請'],
  ['/seller/notifications', '出店者通知'],
];
/** @type {Record<string, import('lucide-react').LucideIcon>} */
const sellerIcons = {
  '/seller': LayoutDashboard,
  '/seller/products': Package,
  '/seller/inventory': Warehouse,
  '/seller/orders': Truck,
  '/seller/sales': ChartNoAxesCombined,
  '/seller/profile': Store,
  '/seller/messages': MessageSquare,
  '/seller/application': ClipboardCheck,
  '/seller/notifications': Bell,
};
const operatorMenu = [
  ['/operator', '運営ダッシュボード'],
  ['/operator/applications', '出店審査'],
  ['/operator/members', '会員管理'],
  ['/operator/sellers', '出店者管理'],
  ['/operator/products', '商品審査'],
  ['/operator/categories', 'カテゴリ管理'],
  ['/operator/orders', '全注文管理'],
  ['/operator/settlements', '手数料・精算管理'],
];
const buyerMenu = [
  ['/', '商品を探す'],
  ['/account', 'アカウント'],
  ['/notifications', '通知一覧'],
  ['/purchases', '注文状況（サンプル）'],
  ['/materials', '配置素材の商品候補'],
];

/** @param {{demo:import('./useDemo').Demo,audience:string}} props */
function Notices({ demo, audience }) {
  const [selected, setSelected] = useState('');
  const notices = demo.state.notices.filter((notice) => notice.audience === audience);
  return (
    <>
      <MockNote>メール通知の内容を画面で確認できます。</MockNote>
      <section className="workspace-card">
        <h2>通知一覧</h2>
        {notices.length === 0 && <p>通知はありません。</p>}
        {notices.map((notice) => (
          <article className="workspace-notice" key={notice.id}>
            <button
              onClick={() => {
                setSelected(notice.id);
                demo.update((draft) => {
                  const target = draft.notices.find((entry) => entry.id === notice.id);
                  if (target) target.read = true;
                }, '通知を既読にしました。');
              }}
            >
              {!notice.read && <span className="workspace-badge">未読</span>} {notice.title}
            </button>
            {selected === notice.id && <p>{notice.body}</p>}
          </article>
        ))}
      </section>
    </>
  );
}

/** @param {{demo:import('./useDemo').Demo,operator:boolean}} props */
function Dashboard({ demo, operator }) {
  let total = 0;
  for (const order of demo.state.orders) total += order.total;
  return (
    <>
      <MockNote>管理業務のサンプルです。商品・在庫編集には実APIを使用します。</MockNote>
      <div className="workspace-welcome">
        <p className="eyebrow">GROW YOUR GARDEN BUSINESS</p>
        <h2>{operator ? 'Kusakari 運営ポータル' : `${demo.state.profile.name}へようこそ`}</h2>
        <p>商品の管理から受注対応まで、ひとつのワークスペースで。</p>
      </div>
      <div className="workspace-metrics">
        <section>
          <small>サンプル注文</small>
          <strong>{demo.state.orders.length}件</strong>
        </section>
        <section>
          <small>サンプル売上</small>
          <strong>¥{total.toLocaleString()}</strong>
        </section>
        <section>
          <small>出店審査待ち</small>
          <strong>{demo.state.applications.filter((entry) => entry.status === '審査待ち').length}件</strong>
        </section>
      </div>
      <section className="workspace-card">
        <h2>次の作業</h2>
        <div className="workspace-shortcuts">
          <PageLink href={operator ? '/operator/applications' : '/seller/orders'}>
            申請・注文を確認 <ArrowUpRight />
          </PageLink>
          <PageLink href={operator ? '/operator/products' : '/seller/products'}>
            商品を確認 <ArrowUpRight />
          </PageLink>
          <PageLink href={operator ? '/operator/settlements' : '/seller/sales'}>
            売上・精算を確認 <ArrowUpRight />
          </PageLink>
        </div>
      </section>
    </>
  );
}

/** @param {{shop:ReturnType<import('../useShop').useShop>,demo:import('./useDemo').Demo,path:string}} props */
export function Workspace({ shop, demo, path }) {
  const seller = path.startsWith('/seller');
  const operator = path.startsWith('/operator');
  let menu = buyerMenu;
  let role = '購入者';
  if (seller) {
    menu = sellerMenu;
    role = '出店者';
  }
  if (operator) {
    menu = operatorMenu;
    role = '運営者';
  }
  let title = '店舗紹介';
  for (const item of menu) {
    if (item[0] === path) title = item[1];
  }
  let content;
  if (path === '/account') content = <AccountPage demo={demo} />;
  else if (path === '/purchases')
    content = (
      <>
        <MockNote>
          受注・発送画面と連動するサンプル注文です。実注文の履歴は購入者サイトの「注文履歴」で確認できます。
        </MockNote>
        {demo.state.orders.map((order) => (
          <section className="workspace-card" key={order.id}>
            <h2>{order.id}</h2>
            <p>
              {order.product} × {order.quantity}
            </p>
            <p>
              支払状態：{order.payment} / 注文状態：{order.status}
            </p>
            <p>
              配送会社：{order.carrier || '未登録'} / 追跡番号：{order.tracking || '未登録'}
            </p>
            <CancelRequest demo={demo} orderId={order.id} eligible={order.status === '注文受付'} />
          </section>
        ))}
      </>
    );
  else if (path.endsWith('/notifications')) content = <Notices demo={demo} audience={seller ? 'seller' : 'buyer'} />;
  else if (path === '/seller/products')
    content = <ProductManager shop={shop} onClose={() => navigate('/seller')} embedded />;
  else if (path === '/seller/inventory') content = <ProductInventory shop={shop} />;
  else if (path === '/seller/profile') content = <ProfilePage demo={demo} />;
  else if (path === '/seller/application') content = <ApplicationPage demo={demo} />;
  else if (path === '/seller/messages') content = <MessagesPage demo={demo} />;
  else if (path === '/seller/orders' || path === '/operator/orders')
    content = <SampleOrders demo={demo} operator={operator} />;
  else if (path === '/seller/sales' || path === '/operator/settlements')
    content = <SalesPage demo={demo} operator={operator} />;
  else if (path === '/operator/applications') content = <ReviewPage demo={demo} />;
  else if (path === '/operator/products') content = <ReviewPage demo={demo} products />;
  else if (path === '/operator/members' || path === '/operator/sellers')
    content = <MembersPage demo={demo} sellers={path.endsWith('/sellers')} />;
  else if (path === '/operator/categories') content = <CategoriesPage demo={demo} />;
  else if (path === '/materials')
    content = <Materials key={window.location.hash} shop={shop} onClose={() => navigate('/')} embedded />;
  else if (path.startsWith('/store/')) {
    const store = shop.stores.find((entry) => String(entry.id) === path.split('/')[2]);
    content = (
      <section className="workspace-card">
        <p className="eyebrow">GARDEN PARTNER</p>
        <h2>{store?.name || '店舗情報を読み込み中'}</h2>
        <p>{store?.address}</p>
        <p>{store?.hours}</p>
        <hr />
        <MockNote>以下は出店者プロフィールのサンプルです。</MockNote>
        <h3>{demo.state.profile.name}</h3>
        <p>{demo.state.profile.story}</p>
        <p>
          {demo.state.profile.hours} / {demo.state.profile.status}
        </p>
        <PageLink href="/">このサイトの商品を見る</PageLink>
      </section>
    );
  } else if (path === '/seller' || path === '/operator') content = <Dashboard demo={demo} operator={operator} />;
  else
    content = (
      <section className="workspace-card">
        <h2>ページが見つかりません</h2>
        <PageLink href="/">商品一覧へ戻る</PageLink>
      </section>
    );
  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <PageLink href="/" className="brand">
          <BrandIcon />
          kusakari.
        </PageLink>
        <span>{operator ? '管理者画面' : `${role}ワークスペース`}</span>
      </header>
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <p>WORKSPACE</p>
          <nav aria-label={`${role}メニュー`}>
            {menu.map((item) => {
              const Icon = seller ? sellerIcons[item[0]] : undefined;
              return (
                <PageLink key={item[0]} href={item[0]} className={path === item[0] ? 'is-active' : ''}>
                  {Icon && <Icon size={18} aria-hidden="true" />}
                  {item[1]}
                </PageLink>
              );
            })}
          </nav>
          <PageLink href="/account">
            {seller && <UserRound size={18} aria-hidden="true" />}
            アカウント管理
          </PageLink>
          <PageLink href="/">
            {seller && <ShoppingBag size={18} aria-hidden="true" />}
            購入者サイトへ戻る
          </PageLink>
        </aside>
        <main className="workspace-main">
          <div className="workspace-heading">
            <p className="eyebrow">KUSAKARI / {role}</p>
            <h1>{title}</h1>
          </div>
          {demo.notice && (
            <div className="workspace-feedback" role="status">
              {demo.notice}
              <button onClick={() => demo.setNotice('')}>閉じる</button>
            </div>
          )}
          {content}
        </main>
      </div>
    </div>
  );
}
