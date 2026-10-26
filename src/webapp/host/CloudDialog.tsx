import { useLayoutEffect, useRef } from "react";
import { StudioPanel } from "../../../vendor/object-kit/components/studio/StudioPanel";
import { CloudFileList } from "./CloudFileList";
import { CloudSettings } from "./CloudSettings";
import { useCloudDialog } from "./useCloudDialog";
import { session } from "./session";
import "./cloud.css";

export function CloudDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const state = useCloudDialog(onClose);
  const { cloud, busy } = state;
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} id="opm-webapp-cloud-modal" className="opm-wa-cloud-dialog" aria-labelledby="opm-wa-cloud-title"
    onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <StudioPanel className="opm-wa-cloud-panel" variant="floating"
      title={<span id="opm-wa-cloud-title">Chmura konsultanta</span>}
      actions={<button id="opm-wa-cloud-close" className="v2-panel-close" type="button" aria-label="Zamknij chmurę" onClick={onClose}>×</button>}>
      <div className="opm-wa-modal-body">
        <div className="opm-wa-modal-sub">Wspólny folder z map.phenome.object.pl: <code>/{state.config.folderName}</code></div>
        <CloudSettings config={state.config} onChange={state.setConfig} disabled={busy} />
        <div className="opm-wa-cloud-providers">
          <button type="button" id="opm-wa-login-ms" className="opm-wa-btn opm-wa-btn-primary" disabled={busy} onClick={() => state.connect("microsoft")}>⊞ Zaloguj Microsoft (OneDrive)</button>
          <button type="button" id="opm-wa-login-google" className="opm-wa-btn opm-wa-btn-primary" disabled={busy} onClick={() => state.connect("google")}>◉ Zaloguj Google (Google Drive)</button>
          <button type="button" id="opm-wa-login-local" className="opm-wa-btn" disabled={busy} onClick={() => state.connect("local_fs")}>📁 Wskaż folder lokalny OneDrive / GDrive</button>
          {cloud && <button type="button" id="opm-wa-cloud-logout" className="opm-wa-btn" disabled={busy} onClick={state.logout}>Wyloguj ({cloud.userName})</button>}
        </div>
        <div id="opm-wa-cloud-status" className="opm-wa-cloud-status" role="status">
          {state.status || (cloud ? `Połączono: ${cloud.userName} • Folder: /${cloud.folderName}` : "Nie połączono z dyskiem chmurowym.")}
        </div>
        {cloud && <div className="opm-wa-cloud-save-bar">
          <button type="button" id="opm-wa-save-opm-cloud" className="opm-wa-btn opm-wa-btn-primary" disabled={busy} onClick={() => state.save(false)}>☁ Zapisz {session.fileName} w /{cloud.folderName}</button>
          <button type="button" id="opm-wa-save-md-cloud" className="opm-wa-btn" disabled={busy} onClick={() => state.save(true)}>☁ Zapisz dokumentację .md w /{cloud.folderName}</button>
          <button type="button" id="opm-wa-refresh-cloud" className="opm-wa-btn" disabled={busy} onClick={state.refresh}>↻ Odśwież listę</button>
        </div>}
        <CloudFileList cloud={cloud} files={state.files} loading={state.loading} error={state.listError} busy={busy} onLoad={state.load} />
      </div>
    </StudioPanel>
  </dialog>;
}
