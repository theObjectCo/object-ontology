import type { StudioNoticeProps } from './StudioNoticeProps';

/** Non-modal feedback, using the host's kit tokens without moving focus.
 * Keep it mounted when updating a live announcement. The host owns dismissal
 * and timing; this component starts no timers and does not remove messages.
 */
export function StudioNotice({ children, tone = 'info', className }: StudioNoticeProps) {
  return (
    <div
      className={['v2-studio-notice', className].filter(Boolean).join(' ')}
      data-tone={tone}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        boxSizing: 'border-box',
        minWidth: 0,
        padding: '6px 14px',
        background: 'var(--bg-panel)',
        color: 'var(--text-main)',
        border: `1px solid ${tone === 'error' ? 'var(--color-warn, var(--border-light))' : 'var(--border-light)'}`,
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </div>
  );
}

export default StudioNotice;
