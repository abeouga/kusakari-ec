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
              <MenuLink key={url} href={url} label={label} icon={icon} collapsed={collapsed} active={path === url} />
            ))}
          </nav>
        ))}
      </div>
    </aside>
  );
}

/** @param {{href:string,label:string,icon?:import('lucide-react').LucideIcon,collapsed:boolean,active?:boolean}} props */
function MenuLink({ href, label, icon: Icon, collapsed, active = false }) {
  // The text is hidden while folded, so the icon-only link is named by aria-label and shown by title.
  return (
    <PageLink
      href={href}
      className={active ? 'is-active' : ''}
      current={active}
      label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      {Icon && <Icon size={18} aria-hidden />}
      <span className="workspace-sidebar-label">{label}</span>
    </PageLink>
  );
}
