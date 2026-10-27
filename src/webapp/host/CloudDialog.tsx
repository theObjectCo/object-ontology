import { CloudDriveModal } from "../cloudDrive";
import { useCloudDialog } from "./useCloudDialog";
import { session } from "./session";
import "./cloud.css";

export function CloudDialog({ onClose }: { onClose: () => void }) {
  const state = useCloudDialog(onClose);
  const { cloud, busy } = state;
  const pl = session.lang === "pl";
  const emptyText = !cloud
    ? pl
      ? "Zaloguj się kontem Microsoft (Entra / OneDrive), Google (Google Drive) lub wskaż zsynchronizowany folder lokalny."
      : "Sign in with Microsoft (Entra / OneDrive), Google (Google Drive), or pick a synced local folder."
    : pl
      ? `Folder /${cloud.folderName} jest pusty. Zapisz obecny model.`
      : `Folder /${cloud.folderName} is empty. Save the current model.`;

  return (
    <CloudDriveModal
      isOpen
      useDialogElement
      dialogId="opm-webapp-cloud-modal"
      dialogClassName="opm-wa-cloud-dialog"
      panelClassName="opm-wa-cloud-panel"
      titleId="opm-wa-cloud-title"
      title="Chmura konsultanta"
      closeButtonId="opm-wa-cloud-close"
      closeLabel="Zamknij chmurę"
      onClose={onClose}
      config={state.config}
      onConfigChange={state.setConfig}
      session={cloud}
      busy={busy}
      loading={state.loading}
      statusText={state.status}
      error={state.listError || null}
      statusId="opm-wa-cloud-status"
      onConnect={state.connect}
      onLogout={state.logout}
      onRefresh={state.refresh}
      saveActions={
        cloud ? (
          <>
            <button type="button" id="opm-wa-save-opm-cloud" className="opm-wa-btn opm-wa-btn-primary" disabled={busy} onClick={() => state.save(false)}>
              ☁ Zapisz {session.fileName} w /{cloud.folderName}
            </button>
            <button type="button" id="opm-wa-save-md-cloud" className="opm-wa-btn" disabled={busy} onClick={() => state.save(true)}>
              ☁ Zapisz dokumentację .md w /{cloud.folderName}
            </button>
          </>
        ) : undefined
      }
      files={state.files}
      filesId="opm-wa-cloud-files"
      onLoadFile={(file) => state.load(file)}
      loadLabel={pl ? "Wczytaj" : "Open"}
      openWebLabel={pl ? "Otwórz" : "Open"}
      emptyText={emptyText}
    />
  );
}
