import { METHODS, documentWithMethods } from "../../core/methods/index";
import { type CloudFileEntry, type CloudUserSession, readFileFromCloudFolder, saveFileToCloudFolder } from "../cloudDrive";
import { showToast } from "./chromeView";
import { broadcastModel, parseCurrentModel } from "./document";
import { redoStack, runtime, session, undoStack } from "./session";

export async function loadCloudDocument(cloud: CloudUserSession, entry: CloudFileEntry) {
  const content = await readFileFromCloudFolder(cloud, entry);
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
}

export async function saveCloudDocument(cloud: CloudUserSession, markdown: boolean) {
  let name = session.fileName || "model.opm.json", content = session.text;
  if (markdown) {
    const model = parseCurrentModel();
    if (!model) throw new Error("Model zawiera nieprawidłowy JSON.");
    name = name.replace(/\.opm\.json$/i, "") + ".md";
    content = documentWithMethods(model, METHODS);
  }
  const saved = await saveFileToCloudFolder(cloud, name, content, markdown ? "text/markdown" : "application/json");
  showToast(`☁ Zapisano ${saved.name} w /${cloud.folderName}`);
  return `✓ Zapisano ${saved.name} w /${cloud.folderName}`;
}
