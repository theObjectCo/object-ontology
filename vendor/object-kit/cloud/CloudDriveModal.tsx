import type { ReactNode } from 'react';
import { StudioNotice } from '../components/studio/StudioNotice';
import { StudioPanel } from '../components/studio/StudioPanel';
import type { CloudFileEntry, CloudOAuthConfig, CloudProvider, CloudUserSession } from './cloudTypes';
import { safeHttpsHref, useModalFocusTrap } from './useModalFocusTrap';

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
  /** Receives a partial config patch so callers only update changed fields without resetting folderId unnecessarily. */
  onConfigChange: (patch: Partial<CloudOAuthConfig>) => void;
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

export function CloudDriveModal({
  isOpen = true, onClose, useDialogElement = false, dialogId,
  dialogClassName = 'kit-cloud-dialog opm-wa-cloud-dialog opm-wa-dialog',
  panelClassName = 'kit-cloud-panel opm-wa-cloud-panel',
  titleId = 'opm-wa-cloud-title', title = 'Chmura konsultanta', subtitle, badge,
  closeButtonId = 'opm-wa-cloud-close', closeLabel = 'Zamknij chmurę',
  config, onConfigChange, session, busy = false, loading = false,
  statusText, error, statusId = 'opm-wa-cloud-status',
  onConnect, onLogout, onRefresh, saveActions, files, filesId = 'opm-wa-cloud-files',
  onLoadFile, canLoadFile = (f) => f.name.endsWith('.json'),
  loadLabel = 'Wczytaj', openWebLabel = 'Otwórz', emptyText, children,
}: CloudDriveModalProps) {
  const { dialogRef, modalDivRef, onCloseRef } = useModalFocusTrap(isOpen, useDialogElement, onClose);

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
      <div className="kit-cloud-modal-body opm-wa-modal-body">
        {badge && <div>{badge}</div>}
        <div className="kit-cloud-modal-sub opm-wa-modal-sub">
          {subtitle !== undefined ? subtitle : <>Wspólny folder z map.phenome.object.pl: <code>/{config.folderName}</code></>}
        </div>
        <fieldset className="kit-cloud-grid opm-wa-cloud-grid" disabled={busy}>
          <legend className="kit-cloud-sr-only opm-wa-sr-only">Ustawienia połączenia</legend>
          <label className="kit-cloud-field opm-wa-field">
            <span>Nazwa folderu na OneDrive / Google Drive</span>
            <input id="opm-wa-cloud-folder" className="kit-cloud-input opm-wa-input map-input mono" value={config.folderName} placeholder="phenome" onChange={(e) => onConfigChange({ folderName: e.target.value })} />
          </label>
          <label className="kit-cloud-field opm-wa-field">
            <span>Microsoft Entra Client ID (opcjonalnie SPA)</span>
            <input id="opm-wa-cloud-entra" className="kit-cloud-input opm-wa-input map-input mono" value={config.entraClientId} placeholder="00000000-0000-0000-0000-000000000000" onChange={(e) => onConfigChange({ entraClientId: e.target.value })} />
          </label>
          <label className="kit-cloud-field opm-wa-field">
            <span>Google OAuth Client ID (opcjonalnie Web)</span>
            <input id="opm-wa-cloud-google" className="kit-cloud-input opm-wa-input map-input mono" value={config.googleClientId} placeholder="1234567890-abc.apps.googleusercontent.com" onChange={(e) => onConfigChange({ googleClientId: e.target.value })} />
          </label>
        </fieldset>
        <div className="kit-cloud-providers opm-wa-cloud-providers">
          <button type="button" id="opm-wa-login-ms" className="kit-cloud-btn kit-cloud-btn-primary opm-wa-btn opm-wa-btn-primary map-btn primary" disabled={busy} onClick={() => onConnect('microsoft')}>⊞ Zaloguj Microsoft (OneDrive)</button>
          <button type="button" id="opm-wa-login-google" className="kit-cloud-btn kit-cloud-btn-primary opm-wa-btn opm-wa-btn-primary map-btn primary" disabled={busy} onClick={() => onConnect('google')}>◉ Zaloguj Google (Google Drive)</button>
          <button type="button" id="opm-wa-login-local" className="kit-cloud-btn opm-wa-btn map-btn" disabled={busy} onClick={() => onConnect('local_fs')}>📁 Wskaż folder lokalny OneDrive / GDrive</button>
          {session && <button type="button" id="opm-wa-cloud-logout" className="kit-cloud-btn opm-wa-btn map-btn danger" disabled={busy} onClick={onLogout}>Wyloguj ({session.userName})</button>}
        </div>
        <div id={statusId}>
          <StudioNotice tone={error ? 'error' : 'info'} className={error ? 'kit-cloud-status kit-cloud-error opm-wa-cloud-status makigami-red-card' : 'kit-cloud-status opm-wa-cloud-status'}>{resolvedStatus}</StudioNotice>
        </div>
        {children}
        {session && (saveActions || onRefresh) && (
          <div className="kit-cloud-save-bar opm-wa-cloud-save-bar">
            {saveActions}
            {onRefresh && <button type="button" id="opm-wa-refresh-cloud" className="kit-cloud-btn opm-wa-btn map-btn" disabled={busy} onClick={onRefresh}>↻ Odśwież listę</button>}
          </div>
        )}
        <div id={filesId} className="kit-cloud-file-list opm-wa-cloud-files" aria-busy={loading}>
          {loading || !files.length ? (
            <div className="kit-cloud-empty opm-wa-cloud-empty" role={error ? 'alert' : 'status'}>{loading ? '…' : error || resolvedEmpty}</div>
          ) : (
            files.map((file, index) => {
              const href = safeHttpsHref(file.webUrl);
              return (
                <div className="kit-cloud-row opm-wa-cloud-row" key={file.id}>
                  <div>
                    <strong className="mono">{file.name}</strong>
                    <small>{Math.max(1, Math.round(file.size / 1024))} KB {file.lastModified ? '• ' + file.lastModified.slice(0, 16).replace('T', ' ') : ''}</small>
                  </div>
                  <div className="kit-cloud-row-actions opm-wa-cloud-row-actions">
                    {onLoadFile && canLoadFile(file) && (
                      <button type="button" className="kit-cloud-btn kit-cloud-btn-primary opm-wa-btn opm-wa-btn-primary map-btn small primary" data-cloud-load={index} disabled={busy} onClick={() => onLoadFile(file, index)}>{loadLabel}</button>
                    )}
                    {href && <a className="kit-cloud-btn opm-wa-btn map-btn small" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${openWebLabel}: ${file.name}`}>↗</a>}
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
      <dialog ref={dialogRef} id={dialogId} className={dialogClassName} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onCloseRef.current(); }} onClick={(e) => { if (e.target === e.currentTarget) onCloseRef.current(); }}>
        {panel}
      </dialog>
    );
  }

  return (
    <div className="kit-cloud-modal-backdrop makigami-modal-backdrop" onClick={() => onCloseRef.current()}>
      <div ref={modalDivRef} id={dialogId} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`kit-cloud-modal makigami-modal sheet paper ${dialogClassName}`} onClick={(e) => e.stopPropagation()}>
        {panel}
      </div>
    </div>
  );
}

export default CloudDriveModal;
