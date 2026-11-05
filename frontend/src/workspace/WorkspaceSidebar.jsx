import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PageLink } from './Common';

/** @typedef {[url:string, label:string, icon?:import('lucide-react').LucideIcon]} MenuItem */

/**
 * Issue #43: seller and operator sidebars carry icons, so the folded sidebar still offers every page.
 * The buyer sidebar cannot be folded and keeps its text-only links.
 * @param {{path:string,groups:{label:string,items:MenuItem[]}[],collapsible:boolean,collapsed:boolean,onToggle:()=>void}} props
 */
export function WorkspaceSidebar({ path, groups, collapsible, collapsed, onToggle }) {
  const toggleLabel = collapsed ? 'メニューを開く' : 'メニューを閉じる';
  const parent = collapsible ? parentItem(groups, path) : undefined;
  return (
    <aside className="workspace-sidebar">
      {collapsible && (
        <div className="workspace-sidebar-head">
          {!collapsed && <p>{groups[0]?.label}</p>}
          <button
            type="button"
            className="workspace-sidebar-toggle"
            aria-controls="workspace-sidebar-menu"
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={onToggle}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </button>
        </div>
      )}
      <div id="workspace-sidebar-menu" className="workspace-sidebar-menu">
        <MenuLink href="/" label="商品一覧へ戻る" icon={collapsible ? ArrowLeft : undefined} collapsed={collapsed} />
        {groups.map((group) => (
          <nav key={group.label} aria-label={group.label}>
            {!collapsible && <p>{group.label}</p>}
            {group.items.map(([url, label, icon]) => (
              <MenuLink
                key={url}
                href={url}
                label={label}
                icon={icon}
                collapsed={collapsed}
                current={path === url ? 'page' : url === parent ? 'true' : undefined}
              />
            ))}
          </nav>
        ))}
      </div>
    </aside>
  );
}

/**
 * A page below a menu item (for example /seller/products/new under /seller/products) marks that item,
 * so the folded sidebar still shows where the seller is. A section root such as /seller is never a parent.
 * @param {{items:MenuItem[]}[]} groups @param {string} path
 */
function parentItem(groups, path) {
  const urls = groups.flatMap((group) => group.items.map(([url]) => url));
  if (urls.includes(path)) return undefined;
  return urls.find((url) => path.startsWith(`${url}/`) && !urls.some((other) => other.startsWith(`${url}/`)));
}

/** @param {{href:string,label:string,icon?:import('lucide-react').LucideIcon,collapsed:boolean,current?:'page'|'true'}} props */
function MenuLink({ href, label, icon: Icon, collapsed, current }) {
  // The text is hidden while folded, so the icon-only link is named by aria-label and shown by title.
  return (
    <PageLink
      href={href}
      className={current ? 'is-active' : ''}
      current={current}
      label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      {Icon && <Icon size={18} aria-hidden />}
      <span className="workspace-sidebar-label">{label}</span>
    </PageLink>
  );
}
