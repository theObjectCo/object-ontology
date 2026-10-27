import type { MouseEvent, ReactNode } from 'react';

export interface StudioRailItem {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  ariaPressed?: boolean;
  badge?: boolean;
  badgeSrLabel?: string;
  shortcut?: string;
  href?: string;
  target?: string;
  rel?: string;
  title?: string;
  className?: string;
  /** Hide item in mobile bottom-dock mode (e.g. desktop-only pin/shortcuts). */
  desktopOnly?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
}

export interface StudioIconRailProps {
  topItems: StudioRailItem[];
  bottomItems?: StudioRailItem[];
  ariaLabel?: string;
  /** When true, renders expandable rail rows with labels, unread dots, and shortcut hints (Tila mode). */
  expandable?: boolean;
  /** Whether the expandable rail is currently open (hovered or pinned). */
  expanded?: boolean;
  onHoverChange?: (hover: boolean) => void;
  className?: string;
}

export function StudioIconRail({
  topItems,
  bottomItems = [],
  ariaLabel = 'Tools',
  expandable = false,
  expanded = false,
  onHoverChange,
  className = '',
}: StudioIconRailProps) {
  if (expandable) {
    const railClass = ['tc-rail', expanded ? 'is-open' : '', className].filter(Boolean).join(' ');
    const renderExpandableItem = (item: StudioRailItem) => {
      const itemClass = ['tc-rail-item', item.active ? 'is-active' : '', item.className || '']
        .filter(Boolean)
        .join(' ');
      const titleText = item.title !== undefined ? item.title : expanded ? undefined : item.label;
      const inner = (
        <>
          <span className="tc-rail-icon">
            {item.icon}
            {item.badge && <span className="tc-rail-dot" aria-hidden="true" />}
          </span>
          <span className="tc-rail-label">
            {item.label}
            {item.badge && item.badgeSrLabel && <span className="tc-sr">{item.badgeSrLabel}</span>}
          </span>
          {item.shortcut && (
            <span className="tc-rail-label tc-rail-key" aria-hidden="true">
              {item.shortcut}
            </span>
          )}
        </>
      );
      return (
        <li key={item.id} className={item.desktopOnly ? 'tc-rail-desk' : undefined}>
          {item.href ? (
            <a
              href={item.href}
              onClick={item.onClick}
              className={itemClass}
              aria-current={item.active ? 'page' : undefined}
              title={titleText}
              target={item.target}
              rel={item.rel}
            >
              {inner}
            </a>
          ) : (
            <button
              type="button"
              onClick={item.onClick}
              className={itemClass}
              aria-pressed={item.ariaPressed ?? item.active}
              title={titleText}
            >
              {inner}
            </button>
          )}
        </li>
      );
    };

    return (
      <nav
        className={railClass}
        aria-label={ariaLabel}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        onFocus={() => onHoverChange?.(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) onHoverChange?.(false);
        }}
      >
        <ul className="tc-rail-list">{topItems.map(renderExpandableItem)}</ul>
        {bottomItems.length > 0 && (
          <>
            <span className="tc-rail-divider tc-rail-bottom" aria-hidden="true" />
            <ul className="tc-rail-list">{bottomItems.map(renderExpandableItem)}</ul>
          </>
        )}
      </nav>
    );
  }

  const renderBtn = (item: StudioRailItem) => (
    <button
      key={item.id}
      type="button"
      className={['v2-rail-btn', item.active ? 'active' : '', item.className || ''].filter(Boolean).join(' ')}
      onClick={item.onClick}
      aria-pressed={item.active}
      aria-label={item.label}
      title={item.title ?? (item.shortcut ? `${item.label} (${item.shortcut})` : item.label)}
    >
      {item.icon}
    </button>
  );

  return (
    <nav className={className ? `v2-icon-rail ${className}` : 'v2-icon-rail'} aria-label={ariaLabel}>
      <div className="v2-rail-group">{topItems.map(renderBtn)}</div>
      {bottomItems.length > 0 && (
        <div className="v2-rail-group">{bottomItems.map(renderBtn)}</div>
      )}
    </nav>
  );
}
export default StudioIconRail;
