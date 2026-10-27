import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { StudioNotice } from '../components/studio/StudioNotice';
import { StudioPanel } from '../components/studio/StudioPanel';
import type { CloudFileEntry, CloudOAuthConfig, CloudProvider, CloudUserSession } from './cloudTypes';

export interface CloudDriveModalProps {
  /** Whether the modal is open. Defaults to true when rendered conditionally. */
  isOpen?: boolean;
  onClose: () => void;
  /** Optional native `<dialog>` mode for focus trapping and Escape handling. */
  useDialogElement?: boolean;
  dialogId?: string;
  dialogClassName?: string;
  panelClassName?: string;
  titleId?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  closeButtonId?: string;
  closeLabel?: string;
  config: CloudOAuthConfig;
  onConfigChange: (next: CloudOAuthConfig) => void;
  session: CloudUserSession | null;
  busy?: boolean;
  loading?: boolean;
  statusText?: string;
  error?: string | null;
  statusId?: string;
  onConnect: (provider: CloudProvider) => void;
  onLogout: () => void;
  onRefresh?: () => void;
  saveActions?: ReactNode;
  files: CloudFileEntry[];
  filesId?: string;
  onLoadFile?: (file: CloudFileEntry, index: number) => void;
  canLoadFile?: (file: CloudFileEntry) => boolean;
  loadLabel?: string;
  openWebLabel?: string;
  emptyText?: string;
  children?: ReactNode;
}

function safeHttpsHref(value?: string): string | undefined {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function CloudDriveModal({
  isOpen = true, onClose, useDialogElement = false, dialogId,
  dialogClassName = 'opm-wa-cloud-dialog', panelClassName = 'opm-wa-cloud-panel',
  titleId = 'opm-wa-cloud-title', title = 'Chmura konsultanta', subtitle, badge,
  closeButtonId = 'opm-wa-cloud-close', closeLabel = 'Zamknij chmurę',
  config, onConfigChange, session, busy = false, loading = false,
  statusText, error, statusId = 'opm-wa-cloud-status',
  onConnect, onLogout, onRefresh, saveActions, files, filesId = 'opm-wa-cloud-files',
  onLoadFile, canLoadFile = (f) => f.name.endsWith('.json'),
  loadLabel = 'Wczytaj', openWebLabel = 'Otwórz', emptyText, children,
}: CloudDriveModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    if (!useDialogElement || !isOpen) return;
    const element = dialogRef.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, [useDialogElement, isOpen]);

  if (!isOpen) return null;

  const resolvedStatus = error || statusText || (session ? `Połączono: ${session.userName} • Folder: /${session.folderName}` : 'Nie połączono z dyskiem chmurowym.');
  const resolvedEmpty = emptyText || (!session
    ? 'Zaloguj się kontem Microsoft (Entra / OneDrive), Google (Google Drive) lub wskaż zsynchronizowany folder lokalny.'
    : `Folder /${session.folderName} jest pusty. Zapisz obecny model.`);

  const panel = (
    <StudioPanel
      className={panelClassName}
      variant="floating"
      title={<span id={titleId}>{title}</span>}
      actions={<button id={closeButtonId} className="v2-panel-close" type="button" aria-label={closeLabel} onClick={onClose}>×</button>}
    >
      <div className="opm-wa-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
        {badge && <div>{badge}</div>}
        <div className="opm-wa-modal-sub">
          {subtitle !== undefined ? subtitle : <>Wspólny folder z map.phenome.object.pl: <code>/{config.folderName}</code></>}
        </div>
        <fieldset className="opm-wa-cloud-grid" disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="opm-wa-sr-only">Ustawienia połączenia</legend>
          <label>
            <span>Nazwa folderu na OneDrive / Google Drive</span>
            <input id="opm-wa-cloud-folder" className="opm-wa-input map-input mono" value={config.folderName} placeholder="phenome" onChange={(e) => onConfigChange({ ...config, folderName: e.target.value })} />
          </label>
          <label>
            <span>Microsoft Entra Client ID (opcjonalnie SPA)</span>
            <input id="opm-wa-cloud-entra" className="opm-wa-input map-input mono" value={config.entraClientId} placeholder="00000000-0000-0000-0000-000000000000" onChange={(e) => onConfigChange({ ...config, entraClientId: e.target.value })} />
          </label>
          <label>
            <span>Google OAuth Client ID (opcjonalnie Web)</span>
            <input id="opm-wa-cloud-google" className="opm-wa-input map-input mono" value={config.googleClientId} placeholder="1234567890-abc.apps.googleusercontent.com" onChange={(e) => onConfigChange({ ...config, googleClientId: e.target.value })} />
          </label>
        </fieldset>
        <div className="opm-wa-cloud-providers" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" id="opm-wa-login-ms" className="opm-wa-btn opm-wa-btn-primary map-btn primary" disabled={busy} onClick={() => onConnect('microsoft')}>⊞ Zaloguj Microsoft (OneDrive)</button>
          <button type="button" id="opm-wa-login-google" className="opm-wa-btn opm-wa-btn-primary map-btn primary" disabled={busy} onClick={() => onConnect('google')}>◉ Zaloguj Google (Google Drive)</button>
          <button type="button" id="opm-wa-login-local" className="opm-wa-btn map-btn" disabled={busy} onClick={() => onConnect('local_fs')}>📁 Wskaż folder lokalny OneDrive / GDrive</button>
          {session && <button type="button" id="opm-wa-cloud-logout" className="opm-wa-btn map-btn danger" disabled={busy} onClick={onLogout}>Wyloguj ({session.userName})</button>}
        </div>
        <div id={statusId}>
          <StudioNotice tone={error ? 'error' : 'info'} className={error ? 'opm-wa-cloud-status makigami-red-card' : 'opm-wa-cloud-status'}>{resolvedStatus}</StudioNotice>
        </div>
        {children}
        {session && (saveActions || onRefresh) && (
          <div className="opm-wa-cloud-save-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {saveActions}
            {onRefresh && <button type="button" id="opm-wa-refresh-cloud" className="opm-wa-btn map-btn" disabled={busy} onClick={onRefresh}>↻ Odśwież listę</button>}
          </div>
        )}
        <div id={filesId} className="opm-wa-cloud-files" aria-busy={loading} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading || !files.length ? (
            <div className="opm-wa-cloud-empty" role={error ? 'alert' : 'status'}>{loading ? '…' : error || resolvedEmpty}</div>
          ) : (
            files.map((file, index) => {
              const href = safeHttpsHref(file.webUrl);
              return (
                <div className="opm-wa-cloud-row" key={file.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <strong className="mono">{file.name}</strong>
                    <small style={{ display: 'block' }}>{Math.max(1, Math.round(file.size / 1024))} KB {file.lastModified ? '• ' + file.lastModified.slice(0, 16).replace('T', ' ') : ''}</small>
                  </div>
                  <div className="opm-wa-cloud-row-actions" style={{ display: 'flex', gap: 6 }}>
                    {onLoadFile && canLoadFile(file) && (
                      <button type="button" className="opm-wa-btn opm-wa-btn-primary map-btn small primary" data-cloud-load={index} disabled={busy} onClick={() => onLoadFile(file, index)}>{loadLabel}</button>
                    )}
                    {href && <a className="opm-wa-btn map-btn small" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${openWebLabel}: ${file.name}`}>↗</a>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </StudioPanel>
  );

  if (useDialogElement) {
    return (
      <dialog ref={dialogRef} id={dialogId} className={dialogClassName} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {panel}
      </dialog>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 850, background: 'rgba(9, 14, 30, 0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="sheet paper" style={{ maxWidth: 780, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--paper-line-focus)' }} onClick={(e) => e.stopPropagation()}>
        {panel}
      </div>
    </div>
  );
}

export default CloudDriveModal;
