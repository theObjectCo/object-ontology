import { PRESETS } from "./presets";

export const STORAGE_KEY = "opm.webapp.state.v1";

export interface SavedSession {
  presetId: string;
  fileName: string;
  text: string;
  lang: "en" | "pl";
  theme: "vscode-dark" | "vscode-light";
}

export function loadSession(): SavedSession {
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

export const session = loadSession();

export const undoStack: string[] = [];

export const redoStack: string[] = [];

export interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  name: string;
}

export function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore quota errors
  }
}

// Mutable document metadata shared by the host controllers.
export const runtime = { version: 1, fileHandle: null as FileSystemFileHandle | null };
