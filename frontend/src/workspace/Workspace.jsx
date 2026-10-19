import { Fragment, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  ClipboardCheck,
  History,
  Layers,
  LayoutDashboard,
  Package,
  Tags,
  Store,
  Truck,
  UserRound,
  LogIn,
  UserPlus,
  MapPin,
  KeyRound,
  Mail,
  UserRoundX,
  Warehouse,
} from 'lucide-react';
import { AccountPage, accountActions } from './AccountPage';
import { ApplicationPage, ProfilePage } from './PartnerForms';
import { SampleOrders, SalesPage, CancelRequest } from './OrderPages';
import { ReviewPage, MembersPage, CategoriesPage } from './OperatorPages';
import { ProductInventory } from './ProductInventory';
import { ProductCreatePage } from './ProductCreatePage';
import { ProductManager } from '../components/ProductManager';
import { Materials } from '../components/Materials';
import { PageLink } from './Common';
import { navigate, goBack } from './navigation';

const sellerMenu = [
  ['/seller', 'ダッシュボード'],
  ['/seller/application', '出店申請'],
  ['/seller/products', '商品一覧・登録'],
  ['/seller/inventory', '在庫・販売状態'],
  ['/seller/orders', '受注・発送'],
  ['/seller/sales', '売上・精算'],
  ['/seller/profile', '店舗プロフィール'],
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
  '/seller/application': ClipboardCheck,
  '/seller/notifications': Bell,
};
const operatorMenu = [
  ['/operator/members', '会員管理'],
  ['/operator/products', '商品審査'],
  ['/operator/categories', 'カテゴリ管理'],
  ['/operator/applications', '出店審査'],
  ['/operator/sellers', '店舗管理'],
  ['/operator/orders', '全注文管理'],
];
/** @type {Record<string, import('lucide-react').LucideIcon>} */
const operatorIcons = {
  '/operator/applications': ClipboardCheck,
  '/operator/members': UserRound,
  '/operator/sellers': Store,
  '/operator/products': Package,
  '/operator/categories': Tags,
  '/operator/orders': Truck,
};
const buyerMenu = [
  ['/account', 'アカウント'],
  ['/notifications', '通知一覧'],
  ['/purchases', '注文状況'],
  ['/materials', '配置素材の商品候補'],
];
/** @type {Record<string, import('lucide-react').LucideIcon>} */
const buyerIcons = {
  '/account': UserRound,
  '/notifications': Bell,
  '/purchases': History,
  '/materials': Layers,
};
const accountIcons = [LogIn, UserPlus, MapPin, KeyRound, Mail, UserRoundX];

/** @param {{demo:import('./useDemo').Demo,audience:string}} props */
function Notices({ demo, audience }) {
  const [selected, setSelected] = useState('');
  const notices = demo.state.notices.filter((notice) => notice.audience === audience);
  return (
    <>
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

/** @param {{demo:import('./useDemo').Demo}} props */
function Dashboard({ demo }) {
  let total = 0;
  for (const order of demo.state.orders) total += order.total;
  return (
    <>
      <div className="workspace-welcome">
        <p className="eyebrow">GROW YOUR GARDEN BUSINESS</p>
        <h2>{demo.state.profile.name}へようこそ</h2>
        <p>商品の管理から受注対応まで、ひとつのワークスペースで。</p>
      </div>
      <div className="workspace-metrics">
        <section>
          <small>注文数</small>
          <strong>{demo.state.orders.length}件</strong>
        </section>
        <section>
          <small>売上</small>
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
          <PageLink href="/seller/orders">
            申請・注文を確認 <ArrowUpRight />
          </PageLink>
          <PageLink href="/seller/products">
            商品を確認 <ArrowUpRight />
          </PageLink>
          <PageLink href="/seller/sales">
            売上・精算を確認 <ArrowUpRight />
          </PageLink>
        </div>
      </section>
    </>
  );
}

/** @param {{shop:ReturnType<import('../useShop').useShop>,demo:import('./useDemo').Demo,path:string,header:import('react').ReactNode}} props */
export function Workspace({ shop, demo, path, header }) {
  const seller = path.startsWith('/seller');
  const operator = path.startsWith('/operator');
  const account = path === '/account' || path.startsWith('/account/');
  let accountTab = 'ログイン';
  for (const action of accountActions) {
    if (action[0] === path) accountTab = action[1];
  }
  let menu = buyerMenu;
  let icons = buyerIcons;
  let role = '購入者';
  if (seller) {
    menu = sellerMenu;
    icons = sellerIcons;
    role = '出店者';
  }
  if (operator) {
    menu = operatorMenu;
    icons = operatorIcons;
    role = '運営者';
  }
  let title = '店舗紹介';
  for (const item of menu) {
    if (item[0] === path) title = item[1];
  }
  if (account) title = 'ユーザーアカウント';
  if (path === '/seller/products/new') title = '商品追加';
  let content;
  if (account) content = <AccountPage key={accountTab} demo={demo} tab={accountTab} />;
  else if (path === '/purchases')
    content = (
      <>
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
  else if (path === '/seller/products/new') content = <ProductCreatePage shop={shop} />;
  else if (path === '/seller/inventory') content = <ProductInventory shop={shop} />;
  else if (path === '/seller/profile') content = <ProfilePage demo={demo} />;
  else if (path === '/seller/application') content = <ApplicationPage demo={demo} />;
  else if (path === '/seller/orders' || path === '/operator/orders')
    content = <SampleOrders demo={demo} operator={operator} />;
  else if (path === '/seller/sales') content = <SalesPage demo={demo} />;
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
        <h3>{demo.state.profile.name}</h3>
        <p>{demo.state.profile.story}</p>
        <p>
          {demo.state.profile.hours} / {demo.state.profile.status}
        </p>
        <PageLink href="/">このサイトの商品を見る</PageLink>
      </section>
    );
  } else if (path === '/seller') content = <Dashboard demo={demo} />;
  else
    content = (
      <section className="workspace-card">
        <h2>ページが見つかりません</h2>
        <PageLink href="/">商品一覧へ戻る</PageLink>
      </section>
    );
  return (
    <>
      {header}
      <div className="workspace-shell">
        <div className="workspace-layout">
          <aside className="workspace-sidebar">
            <p>{operator ? '管理者画面' : seller ? '出店者' : 'ユーザーアカウント'}</p>
            <button
              type="button"
              className="workspace-back"
              onClick={() => {
                if (seller) navigate('/');
                else goBack();
              }}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              戻る
            </button>
            <nav aria-label={`${role}メニュー`}>
              {menu.map((item) => {
                const Icon = icons[item[0]];
                return (
                  <Fragment key={item[0]}>
                    <PageLink
                      href={item[0]}
                      className={
                        path === item[0] ||
                        (item[0] === '/account' && account) ||
                        (item[0] === '/seller/products' && path === '/seller/products/new')
                          ? 'is-active'
                          : ''
                      }
                    >
                      {Icon && <Icon size={18} aria-hidden="true" />}
                      {item[1]}
                    </PageLink>
                    {item[0] === '/account' && account && (
                      <div className="workspace-account-menu" role="group" aria-label="アカウント操作">
                        {accountActions.map((action, index) => {
                          const ActionIcon = accountIcons[index];
                          return (
                            <PageLink
                              key={action[0]}
                              href={action[0]}
                              className={accountTab === action[1] ? 'is-active' : ''}
                            >
                              <ActionIcon size={16} aria-hidden="true" />
                              {action[1]}
                            </PageLink>
                          );
                        })}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </nav>
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
    </>
  );
}
