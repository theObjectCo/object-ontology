import { showToast } from "./chromeView";
import { broadcastModel, redo, undo } from "./document";
import { saveModelToDisk } from "./files";
import { redoStack, runtime, session, undoStack } from "./session";

export function installChromeEvents() {
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

}
