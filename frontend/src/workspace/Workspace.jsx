import { AccountPage, accountActions } from './AccountPage';
import { ProfilePage } from './PartnerForms';
import { ApplicationPage, ApplicationStatusPage, applicationPaths, applicationsChanged } from './StoreApplication';
import { useResource } from './useResource';
import { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  KeyRound,
  ChartColumn,
  ClipboardCheck,
  Package,
  ReceiptText,
  Store,
  Tags,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react';
import { StaffAccountsPage } from './StaffAccounts';
import { StoreInvitationsPage } from './StoreInvitations';
import { SalesPage, SalesReport } from './SalesReport';
import { OrderPage } from './PickupOrders';
import { BuyerOrders } from './BuyerOrders';
import { ReviewPage, MembersPage, CategoriesPage } from './OperatorPages';
import { Notices } from './Notices';
import { ProductCreatePage } from './ProductCreatePage';
import { ProductManager } from '../components/ProductManager';
import { SellerStoreSelect } from '../components/SellerStoreSelect';
import { SellerStoresPage } from './SellerStores';
import { PageLink } from './Common';
import { buyerOnlyMessage, canSell, isShopAccount } from '../auth';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { navigate } from './navigation';
import { useAuth } from '../useAuth';
import { AuthPanel } from '../components/AuthPanel';
/** @typedef {import('./WorkspaceSidebar').MenuItem} MenuItem */
/** @type {MenuItem[]} */
const sellerMenu = [
  ['/seller/products', '商品管理', Package],
  ['/seller/orders', '店舗受け取り', Store],
  ['/seller/sales', '注文実績', ChartColumn],
  ['/seller/stores', '店舗一覧', Building2],
  ['/seller/profile', '店舗プロフィール', UserRound],
  ['/seller/notifications', '出店者通知', Bell],
];
// Issue #111: personnel pages, shown to the owner, ORG_ADMIN and MANAGER only.
/** @type {MenuItem[]} */
const personnelMenu = [
  ['/seller/accounts', 'アカウント', UserCog],
  ['/seller/invitations', '招待キー', KeyRound],
];
/** @type {MenuItem[]} */
const operatorMenu = [
  ['/operator/members', '会員管理', Users],
  ['/operator/products', '商品管理', Package],
  ['/operator/categories', 'カテゴリ管理', Tags],
  ['/operator/applications', '出店審査', ClipboardCheck],
  ['/operator/sellers', '店舗管理', Store],
  ['/operator/orders', '全注文管理', ReceiptText],
];
/** @type {MenuItem[]} */
const buyerMenu = [
  ['/account', 'アカウント情報'],
  ['/purchases', '注文履歴'],
  ['/notifications', '通知一覧'],
];
const accountSettings = accountActions
  .filter(([url]) => ['/account/pickup-contact', '/account/password', '/account/delete'].includes(url))
  .map(([url, label]) => /** @type {MenuItem} */ ([url, label]));
/** @type {Record<string,string>} Pages whose sidebar link may be absent or labelled differently. */
const pageTitles = {
  [applicationPaths.form]: '出店申請',
  [applicationPaths.status]: '出店申請状況',
  // Issue #44: the new-product page has no sidebar link; show what the page is for.
  '/seller/products/new': '商品登録',
};
// Pages that work on one store: an account with several stores chooses which one above the page.
const storePaths = new Set(['/seller/orders', '/seller/sales', '/seller/profile', '/seller/invitations']);
// Issue #112: pages that need a role at the chosen store. An ORG_ADMIN's store without a role offers personnel pages only.
const rolePaths = new Set([
  '/seller/products',
  '/seller/products/new',
  '/seller/orders',
  '/seller/sales',
  '/seller/profile',
]);
// Issue #71: these pages show their heading inside the card instead of above it.
const cardTitlePaths = new Set(['/seller/products', '/seller/products/new']);
/** @param {{shop:ReturnType<import('../useShop').useShop>,path:string,header:import('react').ReactNode}} props */
export function Workspace({ shop, path, header }) {
  const { session, error } = useAuth();
  const [sidebarClosed, setSidebarClosed] = useState(false);
  // EC-B18: an applicant sees "出店申請" until they apply, then "出店申請状況" (also after a rejection).
  const applicant = !!session?.authenticated && session.accountType === 'SHOP_OWNER_APPLICANT';
  const applications = useResource(applicant ? '/account/store-applications' : null);
  const reloadApplications = applications.reload;
  useEffect(() => {
    const reload = () => void reloadApplications();
    window.addEventListener(applicationsChanged, reload);
    return () => window.removeEventListener(applicationsChanged, reload);
  }, [reloadApplications]);
  /** @type {MenuItem} */
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
  const operatorSales = path.match(/^\/operator\/stores\/(\d+)\/sales$/);
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
  if ((seller && !canSell(session)) || (operator && session.accountType !== 'ADMIN'))
    return (
      <>
        {header}
        <main>
          <p role="alert">この画面を利用する権限がありません。</p>
        </main>
      </>
    );
  const storeId = shop.sellerStoreId;
  const chosenStore = shop.sellerStores.find((store) => store.id === storeId);
  const personnel =
    session.accountType === 'SHOP_OWNER' ||
    session.organizationRole === 'ORG_ADMIN' ||
    shop.sellerStores.some((store) => store.memberRole === 'MANAGER');
  const personnelOnly =
    seller && rolePaths.has(path) && session.accountType !== 'ADMIN' && !!chosenStore && chosenStore.memberRole == null;
  const groups = operator
    ? [{ label: '運営者メニュー', items: operatorMenu }]
    : seller
      ? [{ label: '出店者メニュー', items: personnel ? [...sellerMenu, ...personnelMenu] : sellerMenu }]
      : [
          { label: 'マイページ', items: buyerMenu },
          { label: 'アカウント設定', items: accountSettings },
          ...(applicant ? [{ label: '出店をご検討の方', items: [applicationLink] }] : []),
        ];
  const menu = groups.flatMap((group) => group.items);
  // Issue #27: seller and operator pages hold wide tables, so their sidebar can be folded away.
  const collapsible = seller || operator;
  const collapsed = collapsible && sidebarClosed;
  let content;
  const action = accountActions.find((a) => a[0] === path);
  if (path === '/account' || action) content = <AccountPage key={path} tab={action?.[1] || 'アカウント情報'} />;
  else if (path === '/purchases')
    // Issue #108: orders are for buyers; the API refuses shop accounts and applicants.
    content = isShopAccount(session) ? (
      <p className="buyer-only-note" role="note">
        {buyerOnlyMessage}
      </p>
    ) : (
      <BuyerOrders />
    );
  else if (path.endsWith('/notifications')) content = <Notices />;
  // Issue #130: the sales page decides by the API which stores the account may read, including closed ones.
  else if (path === '/seller/sales' && !shop.sellerStoresLoading)
    content = <SalesPage key={storeId ?? 0} storeId={storeId ?? null} />;
  else if (operatorSales)
    content = (
      <>
        <PageLink href="/operator/sellers">店舗管理へ戻る</PageLink>
        <SalesReport storeId={Number(operatorSales[1])} operator />
      </>
    );
  else if (personnelOnly)
    content = (
      <section className="workspace-card">
        <p role="note">
          {chosenStore?.name}では担当のロールがないため、人事（アカウント・招待キー）の画面だけを使えます。
        </p>
      </section>
    );
  else if (path === '/seller/accounts') content = <StaffAccountsPage />;
  else if (path === '/seller/products')
    content = <ProductManager shop={shop} onClose={() => navigate('/seller/products')} embedded />;
  else if (path === '/seller/products/new') content = <ProductCreatePage shop={shop} />;
  else if (path === '/seller/stores')
    content = <SellerStoresPage shop={shop} owner={session.accountType === 'SHOP_OWNER'} />;
  else if (storePaths.has(path) && shop.sellerStoresLoading)
    content = <p role="status">管理する店舗を確認しています。</p>;
  else if (storePaths.has(path) && !storeId)
    // An owner has no store right after the approval; a staff account has none until a store is assigned.
    content = (
      <section className="workspace-card">
        <p>管理できる店舗がまだありません。</p>
        <PageLink href="/seller/stores">店舗一覧を開く</PageLink>
      </section>
    );
  else if (path === '/seller/profile') content = <ProfilePage key={storeId} storeId={storeId} />;
  else if (path === '/seller/invitations')
    content = <StoreInvitationsPage key={storeId} storeId={storeId} storeName={chosenStore?.name ?? ''} />;
  else if (path === applicationPaths.status) content = <ApplicationStatusPage accountType={session.accountType} />;
  else if (application) content = <ApplicationPage accountType={session.accountType} />;
  else if (path === '/seller/orders' || path === '/operator/orders')
    content = <OrderPage storeId={storeId} operator={operator} />;
  else if (path === '/operator/applications') content = <ReviewPage />;
  else if (path === '/operator/products') content = <ReviewPage products />;
  else if (path === '/operator' || path === '/operator/members' || path === '/operator/sellers')
    content = <MembersPage sellers={path.endsWith('/sellers')} />;
  else if (path === '/operator/categories') content = <CategoriesPage />;
  else if (publicStore) content = <ProfilePage storeId={Number(path.split('/')[2])} readOnly />;
  else content = <p>URLを確認するか、メニューからページを選んでください。</p>;
  // Issue #44: every page gets a heading that describes it instead of the generic "Kusakari".
  const title =
    action?.[1] ||
    menu.find(([url]) => url === path)?.[1] ||
    pageTitles[path] ||
    (operatorSales ? '店舗の注文実績' : '') ||
    (publicStore ? '店舗紹介' : 'ページが見つかりません');
  return (
    <>
      {header}
      <div className="workspace-shell">
        <div className={`workspace-layout${collapsed ? ' is-sidebar-closed' : ''}`}>
          <WorkspaceSidebar
            path={path}
            groups={groups}
            collapsible={collapsible}
            collapsed={collapsed}
            onToggle={() => setSidebarClosed(!collapsed)}
          />
          <main className="workspace-main">
            {!cardTitlePaths.has(path) && <h1>{title}</h1>}
            {(storePaths.has(path) || personnelOnly) && shop.sellerStores.length > 1 && (
              <SellerStoreSelect shop={shop} disabled={false} />
            )}
            {content}
          </main>
        </div>
      </div>
    </>
  );
}
