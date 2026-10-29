import { AccountPage, accountActions } from './AccountPage';
import { ProfilePage } from './PartnerForms';
import { ApplicationPage, ApplicationStatusPage, applicationPaths, applicationsChanged } from './StoreApplication';
import { useResource } from './useResource';
import { useEffect } from 'react';
import { SalesPage } from './OrderPages';
import { OrderPage } from './PickupOrders';
import { BuyerOrders } from './BuyerOrders';
import { ReviewPage, MembersPage, CategoriesPage } from './OperatorPages';
import { Notices } from './Notices';
import { ProductCreatePage } from './ProductCreatePage';
import { ProductManager } from '../components/ProductManager';
import { Materials } from '../components/Materials';
import { PageLink } from './Common';
import { navigate } from './navigation';
import { useAuth } from '../useAuth';
import { AuthPanel } from '../components/AuthPanel';
const sellerMenu = [
  ['/seller', 'ダッシュボード'],
  ['/seller/products', '商品管理'],
  ['/seller/orders', '店舗受け取り'],
  ['/seller/sales', '注文実績'],
  ['/seller/profile', '店舗プロフィール'],
  ['/seller/notifications', '出店者通知'],
];
const operatorMenu = [
  ['/operator/members', '会員管理'],
  ['/operator/products', '商品管理'],
  ['/operator/categories', 'カテゴリ管理'],
  ['/operator/applications', '出店審査'],
  ['/operator/sellers', '店舗管理'],
  ['/operator/orders', '全注文管理'],
];
const buyerMenu = [
  ['/account', 'アカウント情報'],
  ['/purchases', '注文履歴'],
  ['/notifications', '通知一覧'],
];
const accountSettings = accountActions.filter(([url]) =>
  ['/account/address', '/account/pickup-contact', '/account/password', '/account/delete'].includes(url),
);
/** @type {Record<string,string>} Pages whose sidebar link may be absent or labelled differently. */
const pageTitles = {
  '/materials': '配置素材の商品候補',
  [applicationPaths.form]: '出店申請',
  [applicationPaths.status]: '出店申請状況',
};
/** @param {{shop:ReturnType<import('../useShop').useShop>,path:string,header:import('react').ReactNode}} props */
export function Workspace({ shop, path, header }) {
  const { session, error } = useAuth();
  // EC-B18: buyers see "出店申請" until they apply, then "出店申請状況" (also after a rejection).
  const applications = useResource(
    session?.authenticated && session.role === 'USER' ? '/account/store-applications' : null,
  );
  const reloadApplications = applications.reload;
  useEffect(() => {
    const reload = () => void reloadApplications();
    window.addEventListener(applicationsChanged, reload);
    return () => window.removeEventListener(applicationsChanged, reload);
  }, [reloadApplications]);
  const applicationLink = applications.data?.length
    ? [applicationPaths.status, '出店申請状況']
    : [applicationPaths.form, '出店申請'];
  if (error)
    return (
      <>
        {header}
        <main>
          <p role="alert">{error}</p>
        </main>
      </>
    );
  if (!session)
    return (
      <>
        {header}
        <main>ログイン状態を確認しています。</main>
      </>
    );
  const publicStore = path.startsWith('/store/');
  const application = path === applicationPaths.form || path === applicationPaths.status;
  const seller = path.startsWith('/seller') && !application;
  const operator = path.startsWith('/operator');
  if (!publicStore && !session.authenticated && !['/account/register', '/account/reset'].includes(path))
    return (
      <>
        {header}
        <main>
          <AuthPanel />
        </main>
      </>
    );
  if ((seller && !['SELLER', 'ADMIN'].includes(session.role || '')) || (operator && session.role !== 'ADMIN'))
    return (
      <>
        {header}
        <main>
          <p role="alert">この画面を利用する権限がありません。</p>
        </main>
      </>
    );
  const storeId = session.storeIds[0] ?? shop.sellerStoreId;
  const groups = operator
    ? [{ label: '運営者メニュー', items: operatorMenu }]
    : seller
      ? [{ label: '出店者メニュー', items: sellerMenu }]
      : [
          { label: 'マイページ', items: buyerMenu },
          { label: 'アカウント設定', items: accountSettings },
          ...(session.role === 'USER' ? [{ label: '出店をご検討の方', items: [applicationLink] }] : []),
        ];
  const menu = groups.flatMap((group) => group.items);
  let content;
  const action = accountActions.find((a) => a[0] === path);
  if (path === '/account' || action) content = <AccountPage key={path} tab={action?.[1] || 'アカウント情報'} />;
  else if (path === '/purchases') content = <BuyerOrders />;
  else if (path.endsWith('/notifications')) content = <Notices />;
  else if (path === '/seller/products')
    content = <ProductManager shop={shop} onClose={() => navigate('/seller')} embedded />;
  else if (path === '/seller/products/new') content = <ProductCreatePage shop={shop} />;
  else if (path === '/seller/profile') content = <ProfilePage storeId={storeId} />;
  else if (path === applicationPaths.status) content = <ApplicationStatusPage role={session.role} />;
  else if (application) content = <ApplicationPage role={session.role} />;
  else if (path === '/seller/orders' || path === '/operator/orders')
    content = <OrderPage storeId={storeId} operator={operator} />;
  else if (path === '/seller/sales' || path === '/seller') content = <SalesPage storeId={storeId} />;
  else if (path === '/operator/applications') content = <ReviewPage />;
  else if (path === '/operator/products') content = <ReviewPage products />;
  else if (path === '/operator' || path === '/operator/members' || path === '/operator/sellers')
    content = <MembersPage sellers={path.endsWith('/sellers')} />;
  else if (path === '/operator/categories') content = <CategoriesPage />;
  else if (path === '/materials') content = <Materials shop={shop} onClose={() => navigate('/')} embedded />;
  else if (publicStore) content = <ProfilePage storeId={Number(path.split('/')[2])} readOnly />;
  else content = <p>ページが見つかりません。</p>;
  return (
    <>
      {header}
      <div className="workspace-shell">
        <div className="workspace-layout">
          <aside className="workspace-sidebar">
            <PageLink href="/">商品一覧へ戻る</PageLink>
            {groups.map((group) => (
              <nav key={group.label} aria-label={group.label}>
                {!seller && !operator && <p>{group.label}</p>}
                {group.items.map(([url, label]) => (
                  <PageLink key={url} href={url} className={path === url ? 'is-active' : ''}>
                    {label}
                  </PageLink>
                ))}
              </nav>
            ))}
          </aside>
          <main className="workspace-main">
            <h1>{action?.[1] || menu.find(([url]) => url === path)?.[1] || pageTitles[path] || 'Kusakari'}</h1>
            {content}
          </main>
        </div>
      </div>
    </>
  );
}
