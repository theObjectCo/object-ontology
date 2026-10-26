import { CloudFileEntry, listCloudFolderFiles, loadCloudSession, readFileFromCloudFolder } from "../cloudDrive";
import { showToast } from "./chromeView";
import { closeCloudModal, cloudLink, escapeHtml } from "./cloudMarkup";
import { broadcastModel } from "./document";
import { redoStack, runtime, session, undoStack } from "./session";

export let cloudFilesCache: CloudFileEntry[] = [];

export async function refreshCloudFilesList() {
  const listEl = document.getElementById("opm-wa-cloud-files");
  const statusEl = document.getElementById("opm-wa-cloud-status");
  const cs = loadCloudSession();
  if (!listEl) return;
  if (!cs) {
    listEl.innerHTML = `<div class="opm-wa-cloud-empty">${
      session.lang === "pl"
        ? "Zaloguj się kontem Microsoft (Entra / OneDrive), Google (Google Drive) lub wskaż zsynchronizowany folder lokalny."
        : "Sign in with Microsoft (Entra / OneDrive), Google (Google Drive), or pick a synced local folder."
    }</div>`;
    return;
  }
  listEl.innerHTML = `<div class="opm-wa-cloud-empty">…</div>`;
  try {
    cloudFilesCache = await listCloudFolderFiles(cs);
    if (!cloudFilesCache.length) {
      listEl.innerHTML = `<div class="opm-wa-cloud-empty">${
        session.lang === "pl"
          ? `Folder /${escapeHtml(cs.folderName)} jest pusty. Kliknij „Zapisz obecny model .opm.json w /${escapeHtml(cs.folderName)}”.`
          : `Folder /${escapeHtml(cs.folderName)} is empty. Click "Save current .opm.json to /${escapeHtml(cs.folderName)}".`
      }</div>`;
      return;
    }
    listEl.innerHTML = cloudFilesCache
      .map(
        (f, idx) => `
        <div class="opm-wa-cloud-row">
          <div>
            <strong>${escapeHtml(f.name)}</strong>
            <small>${Math.max(1, Math.round(f.size / 1024))} KB ${escapeHtml(f.lastModified ? "• " + f.lastModified.slice(0, 16).replace("T", " ") : "")}</small>
          </div>
          <div class="opm-wa-cloud-row-actions">
            ${f.name.endsWith(".json") ? `<button type="button" class="opm-wa-btn opm-wa-btn-primary" data-cloud-load="${idx}">${session.lang === "pl" ? "Wczytaj" : "Open"}</button>` : ""}
            ${cloudLink(f.webUrl) ? `<a class="opm-wa-btn" href="${cloudLink(f.webUrl)}" target="_blank" rel="noopener noreferrer">↗</a>` : ""}
          </div>
        </div>
      `,
      )
      .join("");
    listEl.querySelectorAll<HTMLButtonElement>("[data-cloud-load]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.cloudLoad);
        const entry = cloudFilesCache[idx];
        const curSession = loadCloudSession();
        if (!entry || !curSession) return;
        try {
          if (statusEl) statusEl.textContent = `Wczytywanie ${entry.name}…`;
          const content = await readFileFromCloudFolder(curSession, entry);
          JSON.parse(content);
          runtime.fileHandle = null;
          session.presetId = "custom";
          session.fileName = entry.name.endsWith(".opm.json") ? entry.name : `${entry.name.replace(/\.json$/i, "")}.opm.json`;
          undoStack.length = 0;
          redoStack.length = 0;
          session.text = content;
          runtime.version++;
          broadcastModel();
          showToast(session.lang === "pl" ? `Wczytano z chmury: ${entry.name}` : `Loaded from cloud: ${entry.name}`);
          closeCloudModal();
        } catch (err) {
          if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div class="opm-wa-cloud-empty">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
  }
}
