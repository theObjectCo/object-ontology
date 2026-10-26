import type { CloudFileEntry, CloudUserSession } from "../cloudDrive";
import { session } from "./session";

function cloudLink(value?: string) {
  try { const url = new URL(value || ""); return url.protocol === "https:" ? url.href : undefined; }
  catch { return undefined; }
}

export function CloudFileList({ cloud, files, loading, error, busy, onLoad }: {
  cloud: CloudUserSession | null; files: CloudFileEntry[]; loading: boolean;
  error: string; busy: boolean; onLoad: (entry: CloudFileEntry) => void;
}) {
  const pl = session.lang === "pl";
  const empty = !cloud
    ? pl ? "Zaloguj się kontem Microsoft (Entra / OneDrive), Google (Google Drive) lub wskaż zsynchronizowany folder lokalny."
      : "Sign in with Microsoft (Entra / OneDrive), Google (Google Drive), or pick a synced local folder."
    : pl ? `Folder /${cloud.folderName} jest pusty. Zapisz obecny model.`
      : `Folder /${cloud.folderName} is empty. Save the current model.`;
  return <div id="opm-wa-cloud-files" className="opm-wa-cloud-files" aria-busy={loading}>
    {loading || error || !files.length
      ? <div className="opm-wa-cloud-empty" role={error ? "alert" : "status"}>{loading ? "…" : error || empty}</div>
      : files.map((file, index) => {
        const href = cloudLink(file.webUrl);
        return <div className="opm-wa-cloud-row" key={file.id}>
          <div><strong>{file.name}</strong>
            <small>{Math.max(1, Math.round(file.size / 1024))} KB {file.lastModified ? "• " + file.lastModified.slice(0, 16).replace("T", " ") : ""}</small></div>
          <div className="opm-wa-cloud-row-actions">
            {file.name.endsWith(".json") && <button type="button" className="opm-wa-btn opm-wa-btn-primary" data-cloud-load={index}
              disabled={busy} onClick={() => onLoad(file)}>{pl ? "Wczytaj" : "Open"}</button>}
            {href && <a className="opm-wa-btn" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${pl ? "Otwórz" : "Open"}: ${file.name}`}>↗</a>}
          </div>
        </div>;
      })}
  </div>;
}
