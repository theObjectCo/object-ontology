import { EditError, EditResult, Operation, applyOperation } from "../../core/edit";
import { Parsed, check } from "../../core/load";
import { Model, humanize } from "../../core/model";
import { checkNewId, str, thingOrFail } from "./arguments";
import { Json, OutDiagnostic, ToolError } from "./contracts";
import { outDiagnostics, summaryLine } from "./diagnostics";
import { loadModel } from "./modelFiles";
import * as fs from "fs";

// ---------------------------------------------------------------- edits

/** The text of a model while a tool applies one or more operations to it; nothing is written until the end. */
export class Session {
  messages: string[] = [];
  constructor(public text: string) {}
  get model(): Model {
    return JSON.parse(this.text) as Model;
  }
  apply(op: Operation): EditResult {
    let r: EditResult;
    try {
      r = applyOperation(this.text, op);
    } catch (e) {
      if (e instanceof EditError) throw new ToolError(e.message);
      throw e;
    }
    this.text = r.text;
    if (r.message) this.messages.push(r.message);
    return r;
  }
}

export const key = (d: OutDiagnostic) => `${d.severity}|${d.code}|${d.message}|${d.path.join("/")}`;

/**
 * Runs an edit on a model file: the operations go through the edit engine, the result is parsed and validated,
 * and only a result that is still valid JSON is written. Returns the diagnostics after the edit and those it added.
 */
export function edit(p: unknown, body: (s: Session, model: Model) => { ids?: string[]; message?: string } | void, guard?: (after: Parsed, text: string) => void) {
  const before = loadModel(p);
  const session = new Session(before.text);
  const out = body(session, before.model) || {};
  const parsed = check(before.file, session.text);
  if (!parsed.model) {
    throw new ToolError("Refused: the edit would leave the file unparseable, so nothing was written. Report this as a bug of the edit engine, with the arguments.");
  }
  guard?.(parsed, session.text);
  const changed = session.text !== before.text;
  if (changed) fs.writeFileSync(before.file, session.text, "utf-8");
  const diagnostics = outDiagnostics(session.text, parsed);
  const old = new Set(before.diagnostics.map(key));
  const now = new Set(diagnostics.map(key));
  const message = [out.message, ...session.messages].filter(Boolean).join(" ") || undefined;
  return {
    file: before.file,
    changed,
    ...(message ? { message } : {}),
    ...(out.ids ? { ids: out.ids } : {}),
    summary: summaryLine(diagnostics),
    introduced: diagnostics.filter((d) => !old.has(key(d))),
    resolved: before.diagnostics.filter((d) => !now.has(key(d))).length,
    diagnostics,
  };
}

/** Adds an object or a process with an exact identifier, or one derived from the label, and its fields. */
export function addThing(s: Session, model: Model, kind: "object" | "process", args: Json, patch: Json): string {
  const id = str(args, "id");
  const lbl = str(args, "label");
  if (!id && !lbl) throw new ToolError("Give \"id\" (camelCase), \"label\", or both.");
  if (id) checkNewId(model, id);
  const view = str(args, "view");
  if (view && !model.views?.[view]?.things) throw new ToolError(`"${view}" is not a custom view with a list of things.`);
  const parent = str(args, "parent");
  if (parent) thingOrFail(model, parent, "process");
  const r = s.apply({ op: "addElement", kind, viewId: view ?? "system", label: lbl ?? humanize(id!), parentId: parent });
  let newId = r.select![0];
  if (id && newId !== id) {
    s.apply({ op: "renameId", oldId: newId, newId: id });
    newId = id;
  }
  if (lbl) s.apply({ op: "setLabel", id: newId, label: lbl });
  else s.apply({ op: "updateElement", id: newId, patch: { label: null } });
  const fields = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null));
  if (Object.keys(fields).length) s.apply({ op: "updateElement", id: newId, patch: fields });
  return newId;
}
