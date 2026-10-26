import type { ReactNode } from 'react';

export interface CanvasToolItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface CanvasToolbarProps {
  groups: CanvasToolItem[][];
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  statusText?: ReactNode;
  className?: string;
}

export function CanvasToolbar({
  groups,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  statusText,
  className,
}: CanvasToolbarProps) {
  return (
    <div
      className={['v2-canvas-toolbar', className].filter(Boolean).join(' ')}
      role="toolbar"
      aria-label="Canvas tools"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-light)',
        color: 'var(--text-main)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}
    >
      {groups.map((group, gi) => (
        <div key={gi} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {gi > 0 && (
            <span
              aria-hidden="true"
              style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 4px' }}
            />
          )}
          {group.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn-icon${item.active ? ' active' : ''}`}
              disabled={item.disabled}
              onClick={item.onClick}
              title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
              aria-label={item.label}
              aria-pressed={item.active}
              style={{ padding: '4px 8px', fontSize: 11 }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}
      {zoom !== undefined && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
          <span
            aria-hidden="true"
            style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 4px' }}
          />
          <button type="button" className="btn-icon" onClick={onZoomOut} aria-label="Zoom out" style={{ padding: '3px 7px' }}>
            −
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onZoomReset}
            aria-label="Reset zoom"
            style={{ padding: '3px 7px', minWidth: 48 }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="btn-icon" onClick={onZoomIn} aria-label="Zoom in" style={{ padding: '3px 7px' }}>
            +
          </button>
        </div>
      )}
      {statusText && (
        <span style={{ color: 'var(--text-muted)', marginLeft: 6, whiteSpace: 'nowrap' }}>
          {statusText}
        </span>
      )}
    </div>
  );
}

export default CanvasToolbar;

