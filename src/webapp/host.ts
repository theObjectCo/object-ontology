/**
 * Standalone browser host for the Object OPM & Makigami editor (opm.phenome.object.pl).
 * Implements acquireVsCodeApi() in the browser using the same core edit/validate/render engine
 * as the VS Code extension, CLI, and MCP server.
 */
import { applyOperation } from "../core/edit";
import { METHODS, documentWithMethods } from "../core/methods/index";
import { Model, objects } from "../core/model";
import { storyPlace } from "../core/stories";
import { validate } from "../core/validate";
import type { HostMessage, WebviewMessage } from "../shared/protocol";
import {
  connectLocalSyncedFolder,
  handleOAuthPopupCallbackIfPresent,
  listCloudFolderFiles,
  loadCloudConfig,
  loadCloudSession,
  loginWithGoogleDrive,
  loginWithMicrosoftEntra,
  readFileFromCloudFolder,
  sanitizeFolderName,
  saveCloudConfig,
  saveCloudSession,
  saveFileToCloudFolder,
  type CloudFileEntry,
  type CloudUserSession,
} from "./cloudDrive";

import phenomeModel from "./presets/phenome.opm.json";
import configuratorModel from "./presets/configurator-to-order.opm.json";
import windowPricingModel from "./presets/window-pricing.opm.json";

interface Preset {
  id: string;
  labelEn: string;
  labelPl: string;
  fileName: string;
  text: string;
  openStory?: string;
}

const MAKIGAMI_STARTER: Model = {
  name: "New Makigami Procedure",
  description: "Start by mapping lanes and steps in the Makigami procedure editor, then click 'Sync / Generate OPM' to materialise OPM objects, states, processes and links.",
  objects: {
    customer: {
      essence: "physical",
      affiliation: "environmental",
      description: "Person initiating the procedure.",
    },
    salesModule: {
      role: "module",
      deploymentName: "sales_v1.0.0",
      capabilities: ["can_register_inquiry", "can_prepare_quote"],
      owns: ["owns_inquiry", "owns_quote"],
    },
    engineeringModule: {
      role: "module",
      deploymentName: "engineering_v1.0.0",
      capabilities: ["can_verify_feasibility"],
      owns: ["owns_technical_check"],
    },
    inquiry: {
      states: ["submitted", "verified", "quoted"],
      authority: "owns_inquiry",
    },
    quote: {
      states: ["draft", "sent"],
      authority: "owns_quote",
    },
  },
  processes: {
    registeringInquiry: {
      capability: "can_register_inquiry",
      handledBy: ["customer"],
      requires: ["salesModule"],
      yields: [{ object: "inquiry", state: "submitted" }],
    },
    verifyingFeasibility: {
      capability: "can_verify_feasibility",
      requires: ["engineeringModule"],
      changes: [{ object: "inquiry", from: "submitted", to: "verified" }],
    },
    preparingQuote: {
      capability: "can_prepare_quote",
      requires: ["salesModule", { object: "inquiry", state: "verified" }],
      yields: [{ object: "quote", state: "sent" }],
    },
  },
  stories: {
    quoteProcedure: {
      title: "Inquiry to Quote (Makigami)",
      story: "As a customer I want to submit an inquiry and receive a verified quote, so that I can place an order with confidence.",
      lanes: ["customer", "salesModule", "engineeringModule"],
      steps: [
        {
          lane: "customer",
          does: "Submits product inquiry with dimensions.",
          process: "registeringInquiry",
          handsOver: { object: "inquiry", state: "submitted", to: "salesModule" },
        },
        {
          lane: "salesModule",
          does: "Forwards technical inquiry for feasibility check.",
          handsOver: { object: "inquiry", state: "submitted", to: "engineeringModule" },
        },
        {
          lane: "engineeringModule",
          does: "Verifies technical feasibility of the inquiry.",
          process: "verifyingFeasibility",
          waits: "2h queue",
          handsOver: { object: "inquiry", state: "verified", to: "salesModule" },
        },
        {
          lane: "salesModule",
          does: "Calculates price and sends quote to customer.",
          process: "preparingQuote",
          handsOver: { object: "quote", state: "sent", to: "customer" },
        },
      ],
      doneWhen: [
        "Every technical inquiry is verified before a quote is sent.",
        "Quote includes lead time and price.",
      ],
    },
  },
};

const BLANK_MODEL: Model = {
  name: "Untitled OPM Model",
  objects: {},
  processes: {},
};

const PRESETS: Preset[] = [
  {
    id: "phenome",
    labelEn: "Phenome Platform (Mapping & Deployment)",
    labelPl: "Platforma Phenome (Mapowanie i Wdrożenia)",
    fileName: "phenome.opm.json",
    text: JSON.stringify(phenomeModel, null, 2) + "\n",
  },
  {
    id: "configurator",
    labelEn: "Configurator to Order (Reference Architecture)",
    labelPl: "Konfigurator do Zamówienia (Architektura Referencyjna)",
    fileName: "configurator-to-order.opm.json",
    text: JSON.stringify(configuratorModel, null, 2) + "\n",
  },
  {
    id: "window-pricing",
    labelEn: "Window Pricing (Example + Makigami)",
    labelPl: "Wycena Okien (Przykład + Makigami)",
    fileName: "window-pricing.opm.json",
    text: JSON.stringify(windowPricingModel, null, 2) + "\n",
  },
  {
    id: "makigami",
    labelEn: "Makigami Procedure + P28 Starter",
    labelPl: "Procedura Makigami + P28 (Starter)",
    fileName: "makigami-procedure.opm.json",
    text: JSON.stringify(MAKIGAMI_STARTER, null, 2) + "\n",
    openStory: "quoteProcedure",
  },
  {
    id: "blank",
    labelEn: "Blank Model",
    labelPl: "Pusty model",
    fileName: "model.opm.json",
    text: JSON.stringify(BLANK_MODEL, null, 2) + "\n",
  },
];

const STORAGE_KEY = "opm.webapp.state.v1";

interface SavedSession {
  presetId: string;
  fileName: string;
  text: string;
  lang: "en" | "pl";
  theme: "vscode-dark" | "vscode-light";
}

function loadSession(): SavedSession {
  const params = new URLSearchParams(location.search);
  const urlPreset = params.get("preset");
  const urlLang = params.get("lang");
  const urlTheme = params.get("theme");

  let saved: Partial<SavedSession> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    // ignore storage errors
  }

  const preset = PRESETS.find((p) => p.id === (urlPreset ?? saved.presetId)) ?? PRESETS[0];
  const usePresetText = !!urlPreset || !saved.text;
  const lang: "en" | "pl" = urlLang === "en" || urlLang === "pl"
    ? urlLang
    : saved.lang === "en" || saved.lang === "pl"
      ? saved.lang
      : navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en";
  const theme: "vscode-dark" | "vscode-light" = urlTheme === "light"
    ? "vscode-light"
    : urlTheme === "dark"
      ? "vscode-dark"
      : saved.theme ?? "vscode-dark";

  return {
    presetId: preset.id,
    fileName: usePresetText ? preset.fileName : (saved.fileName ?? preset.fileName),
    text: usePresetText ? preset.text : (saved.text ?? preset.text),
    lang,
    theme,
  };
}

const session = loadSession();
let webviewState: unknown = undefined;
let version = 1;
const undoStack: string[] = [];
const redoStack: string[] = [];
let fileHandle: FileSystemFileHandle | null = null;
let jsonPaneOpen = false;

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  name: string;
}

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore quota errors
  }
}

const send = (m: HostMessage) => window.postMessage(m, "*");

function parseCurrentModel(): Model | null {
  try {
    const parsed = JSON.parse(session.text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Model;
  } catch {
    return null;
  }
}

function broadcastModel() {
  saveSession();
  updateHeaderUi();
  syncJsonTextarea();
  try {
    const model = JSON.parse(session.text || "{}") as Model;
    send({ type: "model", model, version });
    const items = validate(model).map((d) => ({
      element: d.element,
      severity: d.severity,
      message: d.message,
      code: d.code,
      ...storyPlace(d.path),
    }));
    send({ type: "diagnostics", items });
  } catch (e) {
    send({
      type: "parseError",
      message: e instanceof Error ? e.message : String(e),
      line: 1,
      version,
    });
  }
}

function setText(nextText: string, recordUndo = true) {
  if (nextText === session.text) return;
  if (recordUndo) {
    undoStack.push(session.text);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  session.text = nextText;
  version++;
  broadcastModel();
}

function undo() {
  const prev = undoStack.pop();
  if (prev === undefined) return;
  redoStack.push(session.text);
  session.text = prev;
  version++;
  broadcastModel();
}

function redo() {
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(session.text);
  session.text = next;
  version++;
  broadcastModel();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function openFileFromDisk() {
  const win = window as unknown as { showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]> };
  if (typeof win.showOpenFilePicker === "function") {
    try {
      const [handle] = await win.showOpenFilePicker({
        types: [{ description: "OPM Model (*.opm.json)", accept: { "application/json": [".opm.json", ".json"] } }],
        multiple: false,
      });
      if (!handle) return;
      const file = await handle.getFile();
      const text = await file.text();
      fileHandle = handle;
      session.presetId = "custom";
      session.fileName = file.name.endsWith(".opm.json") ? file.name : `${file.name.replace(/\.json$/i, "")}.opm.json`;
      undoStack.length = 0;
      redoStack.length = 0;
      session.text = text;
      version++;
      broadcastModel();
      return;
    } catch {
      return;
    }
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".opm.json,.json,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    fileHandle = null;
    session.presetId = "custom";
    session.fileName = file.name.endsWith(".opm.json") ? file.name : `${file.name.replace(/\.json$/i, "")}.opm.json`;
    undoStack.length = 0;
    redoStack.length = 0;
    session.text = text;
    version++;
    broadcastModel();
  };
  input.click();
}

async function saveModelToDisk() {
  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(session.text);
      await writable.close();
      showToast(session.lang === "pl" ? `Zapisano ${session.fileName}` : `Saved ${session.fileName}`);
      return;
    } catch {
      // fall through to download
    }
  }
  downloadBlob(new Blob([session.text], { type: "application/json;charset=utf-8" }), session.fileName || "model.opm.json");
}

function exportMarkdown() {
  const model = parseCurrentModel();
  if (!model) {
    showToast(session.lang === "pl" ? "Napraw błędy JSON przed eksportem Markdown." : "Fix JSON syntax errors before exporting Markdown.");
    return;
  }
  const md = documentWithMethods(model, METHODS);
  const mdName = (session.fileName || "model.opm.json").replace(/\.opm\.json$/i, "") + ".md";
  downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), mdName);
}

function exportJsonSchema() {
  const model = parseCurrentModel();
  if (!model) return;
  const defs: Record<string, unknown> = {};
  for (const [id, o] of Object.entries(objects(model))) {
    if (o.role === "module") continue;
    defs[id] = {
      type: "object",
      ...(o.description ? { description: o.description } : {}),
      ...(o.states?.length ? { properties: { state: { type: "string", enum: o.states } }, required: ["state"] } : {}),
    };
  }
  const schemaDoc = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: model.name ?? "Contracts",
    $defs: defs,
  };
  downloadBlob(new Blob([JSON.stringify(schemaDoc, null, 2) + "\n"], { type: "application/schema+json;charset=utf-8" }), "contracts.schema.json");
}

function revealIdInJsonPane(id?: string) {
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

// Install acquireVsCodeApi before webview.js runs
(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  getState: () => webviewState,
  setState: (s: unknown) => { webviewState = s; },
  postMessage(m: WebviewMessage) {
    switch (m.type) {
      case "ready": {
        document.body.className = session.theme;
        send({
          type: "init",
          language: session.lang,
          fileName: session.fileName,
          defaults: {},
          theme: session.theme === "vscode-light" ? "light" : "dark",
        });
        broadcastModel();
        send({ type: "schemas", files: [] });
        const params = new URLSearchParams(location.search);
        const storyParam = params.get("story") ?? PRESETS.find((p) => p.id === session.presetId)?.openStory;
        if (storyParam) {
          setTimeout(() => send({ type: "reveal", storyId: storyParam }), 150);
        }
        return;
      }
      case "op": {
        try {
          const r = applyOperation(session.text, m.operation);
          undoStack.push(session.text);
          if (undoStack.length > 100) undoStack.shift();
          redoStack.length = 0;
          session.text = r.text;
          version++;
          send({ type: "result", requestId: m.requestId, ok: true, select: r.select, message: r.message });
          setTimeout(broadcastModel, 20);
        } catch (e) {
          send({ type: "result", requestId: m.requestId, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case "export": {
        const base = (session.fileName || "model.opm.json").replace(/\.opm\.json$/i, "");
        if (m.format === "svg") {
          downloadBlob(new Blob([m.data], { type: "image/svg+xml;charset=utf-8" }), `${base}-${m.viewId}.svg`);
        } else if (m.format === "png") {
          downloadDataUrl(m.data, `${base}-${m.viewId}.png`);
        }
        return;
      }
      case "createSchema":
        exportJsonSchema();
        return;
      case "openTextBeside":
        toggleJsonPane();
        return;
      case "revealInText":
        revealIdInJsonPane(m.id);
        return;
      case "openLink":
        if (/^https?:\/\//i.test(m.href)) window.open(m.href, "_blank", "noopener,noreferrer");
        return;
    }
  },
});

// ---------------------------------------------------------------- Web App Top Bar & Live JSON Drawer

function showToast(msg: string) {
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

function toggleJsonPane(force?: boolean) {
  jsonPaneOpen = force !== undefined ? force : !jsonPaneOpen;
  const pane = document.getElementById("opm-webapp-json-pane");
  const btn = document.getElementById("opm-webapp-btn-json");
  if (pane) pane.style.display = jsonPaneOpen ? "flex" : "none";
  if (btn) btn.classList.toggle("active", jsonPaneOpen);
  if (jsonPaneOpen) syncJsonTextarea();
}

function syncJsonTextarea() {
  const ta = document.getElementById("opm-webapp-json-editor") as HTMLTextAreaElement | null;
  if (!ta || document.activeElement === ta) return;
  ta.value = session.text;
}

function updateHeaderUi() {
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

// Treat cloud names, account labels and stored configuration as text.
const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]!));
const cloudLink = (value: string | undefined): string => {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? escapeHtml(url.href) : "";
  } catch { return ""; }
};

let cloudFilesCache: CloudFileEntry[] = [];

async function refreshCloudFilesList() {
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
          fileHandle = null;
          session.presetId = "custom";
          session.fileName = entry.name.endsWith(".opm.json") ? entry.name : `${entry.name.replace(/\.json$/i, "")}.opm.json`;
          undoStack.length = 0;
          redoStack.length = 0;
          session.text = content;
          version++;
          broadcastModel();
          showToast(session.lang === "pl" ? `Wczytano z chmury: ${entry.name}` : `Loaded from cloud: ${entry.name}`);
          toggleCloudModal(false);
        } catch (err) {
          if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div class="opm-wa-cloud-empty">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
  }
}

function toggleCloudModal(force?: boolean) {
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
  modal.innerHTML = `
    <div class="opm-wa-modal" role="dialog" aria-modal="true">
      <div class="opm-wa-modal-head">
        <div>
          <strong>☁ Chmura Konsultanta (OneDrive / Google Drive) — 100% Client-Side</strong>
          <div class="opm-wa-modal-sub">Wspólny folder z map.phenome.object.pl (domyślnie <code>/${escapeHtml(cfg.folderName)}</code>)</div>
        </div>
        <button type="button" id="opm-wa-cloud-close" class="opm-wa-btn">✕</button>
      </div>
      <div class="opm-wa-modal-body">
        <div class="opm-wa-cloud-grid">
          <label>
            <span>Nazwa folderu na OneDrive / Google Drive</span>
            <input id="opm-wa-cloud-folder" class="opm-wa-input" value="${escapeHtml(cfg.folderName)}" placeholder="phenome" />
          </label>
          <label>
            <span>Microsoft Entra Client ID (opcjonalnie SPA)</span>
            <input id="opm-wa-cloud-entra" class="opm-wa-input" value="${escapeHtml(cfg.entraClientId)}" placeholder="00000000-0000-0000-0000-000000000000" />
          </label>
          <label>
            <span>Google OAuth Client ID (opcjonalnie Web)</span>
            <input id="opm-wa-cloud-google" class="opm-wa-input" value="${escapeHtml(cfg.googleClientId)}" placeholder="1234567890-abc.apps.googleusercontent.com" />
          </label>
        </div>

        <div class="opm-wa-cloud-providers">
          <button type="button" id="opm-wa-login-ms" class="opm-wa-btn opm-wa-btn-primary">⊞ Zaloguj Microsoft (OneDrive)</button>
          <button type="button" id="opm-wa-login-google" class="opm-wa-btn opm-wa-btn-primary">◉ Zaloguj Google (Google Drive)</button>
          <button type="button" id="opm-wa-login-local" class="opm-wa-btn">📁 Wskaż folder lokalny OneDrive / GDrive</button>
          ${cs ? `<button type="button" id="opm-wa-cloud-logout" class="opm-wa-btn">Wyloguj (${escapeHtml(cs.userName)})</button>` : ""}
        </div>

        <div id="opm-wa-cloud-status" class="opm-wa-cloud-status">
          ${cs ? `Połączono: ${escapeHtml(cs.userName)} • Folder: /${escapeHtml(cs.folderName)}` : "Nie połączono z dyskiem chmurowym."}
        </div>

        ${
          cs
            ? `<div class="opm-wa-cloud-save-bar">
                <button type="button" id="opm-wa-save-opm-cloud" class="opm-wa-btn opm-wa-btn-primary">☁ Zapisz ${escapeHtml(session.fileName)} w /${escapeHtml(cs.folderName)}</button>
                <button type="button" id="opm-wa-save-md-cloud" class="opm-wa-btn">☁ Zapisz dokumentację .md w /${escapeHtml(cs.folderName)}</button>
                <button type="button" id="opm-wa-refresh-cloud" class="opm-wa-btn">↻ Odśwież listę</button>
              </div>`
            : ""
        }

        <div id="opm-wa-cloud-files" class="opm-wa-cloud-files"></div>
      </div>
    </div>
  `;
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

function mountWebAppChrome() {
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
    fileHandle = null;
    session.presetId = preset.id;
    session.fileName = preset.fileName;
    undoStack.length = 0;
    redoStack.length = 0;
    session.text = preset.text;
    version++;
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
    fileHandle = null;
    session.presetId = "custom";
    session.fileName = file.name.endsWith(".opm.json") ? file.name : `${file.name.replace(/\.json$/i, "")}.opm.json`;
    undoStack.length = 0;
    redoStack.length = 0;
    session.text = text;
    version++;
    broadcastModel();
    showToast(session.lang === "pl" ? `Wczytano ${session.fileName}` : `Loaded ${session.fileName}`);
  });

  updateHeaderUi();
}

if (!handleOAuthPopupCallbackIfPresent()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWebAppChrome);
  } else {
    mountWebAppChrome();
  }
}
