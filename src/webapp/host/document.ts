import { Model } from "../../core/model";
import { storyPlace } from "../../core/stories";
import { validate } from "../../core/validate";
import { syncJsonTextarea, updateHeaderUi } from "./chromeView";
import { send } from "./messages";
import { redoStack, runtime, saveSession, session, undoStack } from "./session";

export function parseCurrentModel(): Model | null {
  try {
    const parsed = JSON.parse(session.text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Model;
  } catch {
    return null;
  }
}

export function broadcastModel() {
  saveSession();
  updateHeaderUi();
  syncJsonTextarea();
  try {
    const model = JSON.parse(session.text || "{}") as Model;
    send({ type: "model", model, version: runtime.version });
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
      version: runtime.version,
    });
  }
}

export function setText(nextText: string, recordUndo = true) {
  if (nextText === session.text) return;
  if (recordUndo) {
    undoStack.push(session.text);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  session.text = nextText;
  runtime.version++;
  broadcastModel();
}

export function undo() {
  const prev = undoStack.pop();
  if (prev === undefined) return;
  redoStack.push(session.text);
  session.text = prev;
  runtime.version++;
  broadcastModel();
}

export function redo() {
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(session.text);
  session.text = next;
  runtime.version++;
  broadcastModel();
}
