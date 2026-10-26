import { loadCloudSession, saveFileToCloudFolder } from "../cloudDrive";
import { showToast, toggleJsonPane, updateHeaderUi } from "./chromeView";
import { toggleCloudModal } from "./cloudModal";
import { broadcastModel, redo, setText, undo } from "./document";
import { exportMarkdown } from "./exports";
import { openFileFromDisk, saveModelToDisk } from "./files";
import { send } from "./messages";
import { PRESETS } from "./presets";
import { redoStack, runtime, saveSession, session, undoStack } from "./session";

export function mountWebAppChrome() {
  const bar = document.getElementById("opm-webapp-bar");
  if (!bar) return;

  bar.innerHTML = `
    <div class="opm-wa-left">
      <span class="opm-wa-brand">
        <span class="opm-wa-dot"></span>
        <strong>OPM / Makigami Studio</strong>
      </span>
      <select id="opm-webapp-preset" class="opm-wa-select" title="Model / Template">
        ${PRESETS.map((p) => `<option value="${p.id}">${session.lang === "pl" ? p.labelPl : p.labelEn}</option>`).join("")}
        <option value="custom" hidden>Custom File</option>
      </select>
      <span id="opm-webapp-filename" class="opm-wa-filename"></span>
    </div>
    <div class="opm-wa-right">
      <button id="opm-webapp-btn-undo" class="opm-wa-btn" title="Undo (Ctrl+Z)">↶</button>
      <button id="opm-webapp-btn-redo" class="opm-wa-btn" title="Redo (Ctrl+Y)">↷</button>
      <span class="opm-wa-sep"></span>
      <button id="opm-webapp-btn-open" class="opm-wa-btn"></button>
      <button id="opm-webapp-btn-save" class="opm-wa-btn opm-wa-btn-primary"></button>
      <button id="opm-webapp-btn-cloud-save" class="opm-wa-btn opm-wa-btn-primary" style="display:none"></button>
      <button id="opm-webapp-btn-cloud" class="opm-wa-btn" title="OneDrive (Microsoft Entra) / Google Drive"></button>
      <button id="opm-webapp-btn-md" class="opm-wa-btn"></button>
      <button id="opm-webapp-btn-json" class="opm-wa-btn" title="Live .opm.json source editor">{ } JSON</button>
      <span class="opm-wa-sep"></span>
      <button id="opm-webapp-btn-lang" class="opm-wa-btn" title="Switch language (PL / EN)"></button>
      <button id="opm-webapp-btn-theme" class="opm-wa-btn" title="Switch theme (Dark / Light)"></button>
    </div>
  `;

  const select = document.getElementById("opm-webapp-preset") as HTMLSelectElement;
  select.addEventListener("change", () => {
    const preset = PRESETS.find((p) => p.id === select.value);
    if (!preset) return;
    runtime.fileHandle = null;
    session.presetId = preset.id;
    session.fileName = preset.fileName;
    undoStack.length = 0;
    redoStack.length = 0;
    session.text = preset.text;
    runtime.version++;
    send({
      type: "init",
      language: session.lang,
      fileName: session.fileName,
      defaults: {},
      theme: session.theme === "vscode-light" ? "light" : "dark",
    });
    broadcastModel();
    if (preset.openStory) {
      setTimeout(() => send({ type: "reveal", storyId: preset.openStory }), 120);
    }
  });

  document.getElementById("opm-webapp-btn-undo")?.addEventListener("click", undo);
  document.getElementById("opm-webapp-btn-redo")?.addEventListener("click", redo);
  document.getElementById("opm-webapp-btn-open")?.addEventListener("click", openFileFromDisk);
  document.getElementById("opm-webapp-btn-save")?.addEventListener("click", saveModelToDisk);
  document.getElementById("opm-webapp-btn-cloud")?.addEventListener("click", () => toggleCloudModal());
  document.getElementById("opm-webapp-btn-cloud-save")?.addEventListener("click", async () => {
    const cs = loadCloudSession();
    if (!cs) {
      toggleCloudModal(true);
      return;
    }
    try {
      const saved = await saveFileToCloudFolder(cs, session.fileName || "model.opm.json", session.text, "application/json");
      showToast(`☁ Zapisano ${saved.name} w /${cs.folderName}`);
    } catch {
      toggleCloudModal(true);
    }
  });
  document.getElementById("opm-webapp-btn-md")?.addEventListener("click", exportMarkdown);
  document.getElementById("opm-webapp-btn-json")?.addEventListener("click", () => toggleJsonPane());

  document.getElementById("opm-webapp-btn-lang")?.addEventListener("click", () => {
    session.lang = session.lang === "pl" ? "en" : "pl";
    saveSession();
    updateHeaderUi();
    send({
      type: "init",
      language: session.lang,
      fileName: session.fileName,
      defaults: {},
      theme: session.theme === "vscode-light" ? "light" : "dark",
    });
    broadcastModel();
  });

  document.getElementById("opm-webapp-btn-theme")?.addEventListener("click", () => {
    session.theme = session.theme === "vscode-light" ? "vscode-dark" : "vscode-light";
    document.body.className = session.theme;
    saveSession();
    updateHeaderUi();
  });

  const ta = document.getElementById("opm-webapp-json-editor") as HTMLTextAreaElement | null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  ta?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setText(ta.value, true);
    }, 300);
  });

  document.getElementById("opm-webapp-json-close")?.addEventListener("click", () => toggleJsonPane(false));

  // Global keyboard shortcuts (Ctrl+S, Ctrl+Z, Ctrl+Y)
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    const inInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveModelToDisk();
      return;
    }
    if (!inInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (!inInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    }
  });

  // Drag & drop any .opm.json or .json file onto the window
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });
  window.addEventListener("drop", async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    const text = await file.text();
    runtime.fileHandle = null;
    session.presetId = "custom";
    session.fileName = file.name.endsWith(".opm.json") ? file.name : `${file.name.replace(/\.json$/i, "")}.opm.json`;
    undoStack.length = 0;
    redoStack.length = 0;
    session.text = text;
    runtime.version++;
    broadcastModel();
    showToast(session.lang === "pl" ? `Wczytano ${session.fileName}` : `Loaded ${session.fileName}`);
  });

  updateHeaderUi();
}
