import type { ReactNode } from 'react';

export { StudioHeader, type StudioHeaderProps } from './StudioHeader';
export { StudioIconRail, type StudioIconRailProps, type StudioRailItem } from './StudioIconRail';
export { StudioPanel, type StudioPanelProps } from './StudioPanel';

export interface StudioShellProps {
  header: ReactNode;
  rail: ReactNode;
  leftDock?: ReactNode;
  rightInspector?: ReactNode;
  statusBar?: ReactNode;
  viewport: ReactNode;
  className?: string;
}

/**
 * Unified 3D / Studio application shell for Fraxin (`demo-satellite.fraxin.object.pl`),
 * Tila (`app.tila.object.pl`), and Phenome (`inspector.phenome.object.pl`).
 */
export default function StudioShell({
  header,
  rail,
  leftDock,
  rightInspector,
  statusBar,
  viewport,
  className = '',
}: StudioShellProps) {
  const rootClass = [
    'v2-studio-app',
    statusBar ? 'has-status-bar' : '',
    leftDock ? 'with-dock' : '',
    rightInspector ? 'with-details' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <div className="v2-viewport-area">{viewport}</div>
      {header}
      {rail}
      {leftDock && <aside className="v2-left-dock">{leftDock}</aside>}
      {rightInspector}
      {statusBar}
    </div>
  );
}
