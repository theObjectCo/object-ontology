import { METHODS, documentWithMethods } from "../../core/methods/index";
import { CloudUserSession, connectLocalSyncedFolder, loadCloudConfig, loadCloudSession, loginWithGoogleDrive, loginWithMicrosoftEntra, sanitizeFolderName, saveCloudConfig, saveCloudSession, saveFileToCloudFolder } from "../cloudDrive";
import { showToast, updateHeaderUi } from "./chromeView";
import { refreshCloudFilesList } from "./cloudFiles";
import { cloudModalMarkup } from "./cloudMarkup";
import { parseCurrentModel } from "./document";
import { session } from "./session";

export function toggleCloudModal(force?: boolean) {
  let modal = document.getElementById("opm-webapp-cloud-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "opm-webapp-cloud-modal";
    modal.className = "opm-wa-modal-backdrop";
    document.body.appendChild(modal);
  }
  const open = force !== undefined ? force : !modal.classList.contains("open");
  if (!open) {
    modal.classList.remove("open");
    return;
  }
  const cfg = loadCloudConfig();
  const cs: CloudUserSession | null = loadCloudSession();
  modal.innerHTML = cloudModalMarkup(cfg, cs);
  modal.classList.add("open");

  const readCfgFromInputs = () => {
    const folderName = sanitizeFolderName((document.getElementById("opm-wa-cloud-folder") as HTMLInputElement)?.value || "phenome");
    const entraClientId = (document.getElementById("opm-wa-cloud-entra") as HTMLInputElement)?.value || "";
    const googleClientId = (document.getElementById("opm-wa-cloud-google") as HTMLInputElement)?.value || "";
    return saveCloudConfig({ ...cfg, folderName, entraClientId, googleClientId });
  };

  document.getElementById("opm-wa-cloud-close")?.addEventListener("click", () => toggleCloudModal(false));
  modal.onclick = (ev) => {
    if (ev.target === modal) toggleCloudModal(false);
  };

  document.getElementById("opm-wa-login-ms")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("opm-wa-cloud-status");
    try {
      const nextCfg = readCfgFromInputs();
      if (statusEl) statusEl.textContent = "Logowanie Microsoft Entra ID…";
      await loginWithMicrosoftEntra(nextCfg);
      updateHeaderUi();
      toggleCloudModal(true);
    } catch (err) {
      if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("opm-wa-login-google")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("opm-wa-cloud-status");
    try {
      const nextCfg = readCfgFromInputs();
      if (statusEl) statusEl.textContent = "Logowanie Google Drive…";
      await loginWithGoogleDrive(nextCfg);
      updateHeaderUi();
      toggleCloudModal(true);
    } catch (err) {
      if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("opm-wa-login-local")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("opm-wa-cloud-status");
    try {
      const nextCfg = readCfgFromInputs();
      await connectLocalSyncedFolder(nextCfg.folderName);
      updateHeaderUi();
      toggleCloudModal(true);
    } catch (err) {
      if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("opm-wa-cloud-logout")?.addEventListener("click", () => {
    saveCloudSession(null);
    updateHeaderUi();
    toggleCloudModal(true);
  });

  document.getElementById("opm-wa-save-opm-cloud")?.addEventListener("click", async () => {
    const cur = loadCloudSession();
    const statusEl = document.getElementById("opm-wa-cloud-status");
    if (!cur) return;
    try {
      const nextCfg = readCfgFromInputs();
      cur.folderName = nextCfg.folderName;
      saveCloudSession(cur);
      const saved = await saveFileToCloudFolder(cur, session.fileName || "model.opm.json", session.text, "application/json");
      if (statusEl) statusEl.textContent = `✓ Zapisano ${saved.name} w /${cur.folderName}`;
      showToast(`☁ Zapisano ${saved.name} w /${cur.folderName}`);
      await refreshCloudFilesList();
    } catch (err) {
      if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("opm-wa-save-md-cloud")?.addEventListener("click", async () => {
    const cur = loadCloudSession();
    const statusEl = document.getElementById("opm-wa-cloud-status");
    const model = parseCurrentModel();
    if (!cur || !model) return;
    try {
      const md = documentWithMethods(model, METHODS);
      const mdName = (session.fileName || "model.opm.json").replace(/\.opm\.json$/i, "") + ".md";
      const saved = await saveFileToCloudFolder(cur, mdName, md, "text/markdown");
      if (statusEl) statusEl.textContent = `✓ Zapisano ${saved.name} w /${cur.folderName}`;
      showToast(`☁ Zapisano ${saved.name} w /${cur.folderName}`);
      await refreshCloudFilesList();
    } catch (err) {
      if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("opm-wa-refresh-cloud")?.addEventListener("click", () => void refreshCloudFilesList());
  void refreshCloudFilesList();
}
