import type { ReactNode } from 'react';

export interface StudioPanelProps {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  /** `'docked'` inside `.v2-left-dock`, `'inspector'` on the right, or `'floating'` standalone. */
  variant?: 'docked' | 'inspector' | 'floating';
  className?: string;
  testId?: string;
  children: ReactNode;
}

export function StudioPanel({
  title,
  icon,
  actions,
  onClose,
  closeLabel = 'Close panel',
  variant = 'docked',
  className = '',
  testId,
  children,
}: StudioPanelProps) {
  const baseClass =
    variant === 'inspector'
      ? 'fx-float-panel floating-details-panel'
      : variant === 'docked'
        ? 'fx-float-panel docked'
        : 'fx-float-panel';

  return (
    <section
      className={className ? `${baseClass} ${className}` : baseClass}
      data-testid={testId}
    >
      <header className="v2-panel-header">
        <div className="v2-panel-title">
          {icon}
          <span>{title}</span>
        </div>
        {(actions || onClose) && (
          <div className="v2-panel-actions">
            {actions}
            {onClose && (
              <button
                type="button"
                className="v2-panel-close"
                onClick={onClose}
                aria-label={closeLabel}
                title={closeLabel}
              >
                ×
              </button>
            )}
          </div>
        )}
      </header>
      <div className="v2-panel-body">{children}</div>
    </section>
  );
}
export default StudioPanel;
