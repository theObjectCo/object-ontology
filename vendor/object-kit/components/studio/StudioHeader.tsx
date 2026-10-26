import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export interface StudioHeaderProps {
  /** Brand wordmark or SVG logo rendered inside `.v2-header-logo` / `.tc-bar-brand`. */
  logo: ReactNode;
  /** Optional href for the brand logo. */
  logoHref?: string;
  /** Optional click handler for SPA navigation on the brand logo. */
  logoOnClick?: (e: MouseEvent<HTMLElement>) => void;
  /** Optional accessible label for the brand logo link. */
  logoAriaLabel?: string;
  /** Optional inline styles for the brand logo element. */
  logoStyle?: CSSProperties;
  /** Project / tool name shown after the `/` separator in `.v2-header-breadcrumb`. */
  title?: ReactNode;
  /** Optional subtitle / office / context shown after the title. */
  subtitle?: ReactNode;
  /** Optional custom middle/breadcrumb node (e.g. project/office switcher). */
  breadcrumb?: ReactNode;
  /** Center / view-mode pills or camera controls (`.v2-header-center`). */
  centerTools?: ReactNode;
  /** Right-aligned action icons or primary CTA buttons (`.v2-header-right`). */
  rightTools?: ReactNode;
  className?: string;
}

export function StudioHeader({
  logo,
  logoHref,
  logoOnClick,
  logoAriaLabel,
  logoStyle,
  title,
  subtitle,
  breadcrumb,
  centerTools,
  rightTools,
  className = '',
}: StudioHeaderProps) {
  const LogoTag = logoHref ? 'a' : 'span';
  return (
    <header className={className ? `v2-header ${className}` : 'v2-header'}>
      <div className="v2-header-left">
        <LogoTag
          className="v2-header-logo tc-bar-brand"
          onClick={logoOnClick}
          aria-label={logoAriaLabel}
          style={logoStyle}
          {...(logoHref ? { href: logoHref } : {})}
        >
          {logo}
        </LogoTag>
        {(title || subtitle) && (
          <div className="v2-header-breadcrumb">
            <span className="sep">/</span>
            {title && <span className="current">{title}</span>}
            {subtitle && (
              <>
                <span className="sep">·</span>
                <span>{subtitle}</span>
              </>
            )}
          </div>
        )}
      </div>
      {breadcrumb}
      {centerTools && <div className="v2-header-center">{centerTools}</div>}
      {rightTools && <div className="v2-header-right tc-bar-end">{rightTools}</div>}
    </header>
  );
}
export default StudioHeader;
