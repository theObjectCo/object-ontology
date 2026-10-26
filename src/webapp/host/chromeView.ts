import { loadCloudSession } from "../cloudDrive";
import { PRESETS } from "./presets";
import { redoStack, session, undoStack } from "./session";

export let jsonPaneOpen = false;

export function revealIdInJsonPane(id?: string) {
  if (!jsonPaneOpen) toggleJsonPane(true);
  const ta = document.getElementById("opm-webapp-json-editor") as HTMLTextAreaElement | null;
  if (!ta) return;
  ta.focus();
  if (!id) return;
  const needle = `"${id}":`;
  const idx = ta.value.indexOf(needle);
  if (idx >= 0) {
    ta.setSelectionRange(idx, idx + needle.length);
    const line = ta.value.slice(0, idx).split("\n").length;
    const lineHeight = 18;
    ta.scrollTop = Math.max(0, (line - 5) * lineHeight);
  }
}

// ---------------------------------------------------------------- Web App Top Bar & Live JSON Drawer

export function showToast(msg: string) {
  let el = document.getElementById("opm-webapp-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "opm-webapp-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el?.classList.remove("visible"), 2600);
}

export function toggleJsonPane(force?: boolean) {
  jsonPaneOpen = force !== undefined ? force : !jsonPaneOpen;
  const pane = document.getElementById("opm-webapp-json-pane");
  const btn = document.getElementById("opm-webapp-btn-json");
  if (pane) pane.style.display = jsonPaneOpen ? "flex" : "none";
  if (btn) btn.classList.toggle("active", jsonPaneOpen);
  if (jsonPaneOpen) syncJsonTextarea();
}

export function syncJsonTextarea() {
  const ta = document.getElementById("opm-webapp-json-editor") as HTMLTextAreaElement | null;
  if (!ta || document.activeElement === ta) return;
  ta.value = session.text;
}

export function updateHeaderUi() {
  const select = document.getElementById("opm-webapp-preset") as HTMLSelectElement | null;
  if (select) {
    for (const opt of Array.from(select.options)) {
      const p = PRESETS.find((x) => x.id === opt.value);
      if (p) opt.textContent = session.lang === "pl" ? p.labelPl : p.labelEn;
    }
    select.value = PRESETS.some((p) => p.id === session.presetId) ? session.presetId : "custom";
  }
  const fileEl = document.getElementById("opm-webapp-filename");
  if (fileEl) fileEl.textContent = session.fileName;

  const undoBtn = document.getElementById("opm-webapp-btn-undo") as HTMLButtonElement | null;
  const redoBtn = document.getElementById("opm-webapp-btn-redo") as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;

  const langBtn = document.getElementById("opm-webapp-btn-lang");
  if (langBtn) langBtn.textContent = session.lang.toUpperCase();

  const themeBtn = document.getElementById("opm-webapp-btn-theme");
  if (themeBtn) themeBtn.textContent = session.theme === "vscode-light" ? "☀" : "☾";

  const openBtn = document.getElementById("opm-webapp-btn-open");
  if (openBtn) openBtn.textContent = session.lang === "pl" ? "Otwórz .opm.json" : "Open .opm.json";
  const saveBtn = document.getElementById("opm-webapp-btn-save");
  if (saveBtn) saveBtn.textContent = session.lang === "pl" ? "Zapisz .opm.json" : "Save .opm.json";
  const mdBtn = document.getElementById("opm-webapp-btn-md");
  if (mdBtn) mdBtn.textContent = session.lang === "pl" ? "Eksportuj .md" : "Export .md";

  const cloudSession = loadCloudSession();
  const cloudBtn = document.getElementById("opm-webapp-btn-cloud");
  if (cloudBtn) {
    const providerTag = cloudSession
      ? cloudSession.provider === "microsoft"
        ? "OneDrive"
        : cloudSession.provider === "google"
          ? "GDrive"
          : "Dysk"
      : session.lang === "pl" ? "Chmura" : "Cloud";
    cloudBtn.textContent = cloudSession ? `☁ ${providerTag}: /${cloudSession.folderName}` : `☁ ${providerTag}`;
    cloudBtn.classList.toggle("active", !!cloudSession);
  }
  const cloudSaveBtn = document.getElementById("opm-webapp-btn-cloud-save") as HTMLButtonElement | null;
  if (cloudSaveBtn) {
    cloudSaveBtn.style.display = cloudSession ? "inline-flex" : "none";
    cloudSaveBtn.textContent = session.lang === "pl" ? "☁ Zapisz w chmurze" : "☁ Save to Cloud";
  }
}
