import { loadCloudSession, saveFileToCloudFolder } from "../cloudDrive";
import { showToast, updateHeaderUi } from "./chromeView";
import { toggleCloudModal } from "./cloudModal";
import { broadcastModel } from "./document";
import { send } from "./messages";
import { PRESETS } from "./presets";
import { redoStack, runtime, saveSession, session, undoStack } from "./session";

export function selectPreset(id: string) {
  const preset = PRESETS.find((p) => p.id === id);
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
}

export async function saveToCloud() {
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
}

export function toggleLanguage() {
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
}

export function toggleTheme() {
  session.theme = session.theme === "vscode-light" ? "vscode-dark" : "vscode-light";
  document.body.className = session.theme;
  document.documentElement.dataset.theme = session.theme === "vscode-light" ? "light" : "dark";
  saveSession();
  updateHeaderUi();
}
