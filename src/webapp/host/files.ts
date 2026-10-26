import { showToast } from "./chromeView";
import { broadcastModel } from "./document";
import { downloadBlob } from "./downloads";
import { FileSystemFileHandle, redoStack, runtime, session, undoStack } from "./session";

export async function openFileFromDisk() {
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
      runtime.fileHandle = handle;
      session.presetId = "custom";
      session.fileName = file.name.endsWith(".opm.json") ? file.name : `${file.name.replace(/\.json$/i, "")}.opm.json`;
      undoStack.length = 0;
      redoStack.length = 0;
      session.text = text;
      runtime.version++;
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
    runtime.fileHandle = null;
    session.presetId = "custom";
    session.fileName = file.name.endsWith(".opm.json") ? file.name : `${file.name.replace(/\.json$/i, "")}.opm.json`;
    undoStack.length = 0;
    redoStack.length = 0;
    session.text = text;
    runtime.version++;
    broadcastModel();
  };
  input.click();
}

export async function saveModelToDisk() {
  if (runtime.fileHandle) {
    try {
      const writable = await runtime.fileHandle.createWritable();
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
