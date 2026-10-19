import * as fs from "fs";
import * as path from "path";
import Ajv2020, { ValidateFunction } from "ajv/dist/2020";
import modelSchema from "../../schema/opm-model.schema.json";
import { EditError, EditResult, Operation, applyOperation } from "../core/edit";
import { EditorLink, EditorLinkKind, editorLinks, thingKind } from "../core/links";
import { Parsed, check, lineColumn, locate, structureErrors } from "../core/load";
import { Model, StoryDef, descendants, essence, humanize, label, objects, parents, processes } from "../core/model";
import { oplAbout, oplSentences, sentenceText } from "../core/opl";
import { laneKind, stories, storyTitle } from "../core/stories";
import { Diagnostic } from "../core/validate";
import { listViews, viewsContaining } from "../core/viewmodel";
import { METHODS, MethodId, documentWithMethods } from "../core/methods/index";
import { givenBy, performers, usedBy } from "../core/methods/common";
import { dsm, dsmMarkdown } from "../core/methods/dsm";
import { flowMarkdown } from "../core/methods/flow";
import { idef0Markdown } from "../core/methods/idef0";
import { sipocMarkdown } from "../core/methods/sipoc";

/**
 * The tools of the MCP server, without the transport: each one is a JSON Schema for its arguments and a handler
 * that reads or edits one model file. Tests call the handlers directly; src/mcp/server.ts exposes them over stdio.
 */

type Json = Record<string, unknown>;

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  /** Reads only; edits write the file. */
  readOnly: boolean;
  destructive?: boolean;
  /** Returns a value that is sent as JSON, or a string that is sent as it is (markdown, OPL). */
  handler: (args: Json) => unknown;
}

/** A refusal or a bad argument: reported to the agent as a tool error, nothing is written. */
export class ToolError extends Error {}

// ---------------------------------------------------------------- files and diagnostics

const SKIP_DIRS = new Set(["node_modules", "dist", "out", ".git"]);
const MODEL_FILE = /\.opm\.json$/i;

/** The absolute path of an existing *.opm.json file, or a refusal that says what is wrong with the argument. */
function modelFile(p: unknown): string {
  if (typeof p !== "string" || !p.trim()) throw new ToolError("\"path\" is required: the absolute path of a *.opm.json file.");
  if (!path.isAbsolute(p)) throw new ToolError(`"${p}" is not an absolute path. Pass the full path of the *.opm.json file.`);
  if (!MODEL_FILE.test(p)) throw new ToolError(`"${p}" is not a *.opm.json file; these tools read and edit OPM model files only.`);
  const full = path.resolve(p);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(full);
  } catch {
    throw new ToolError(`${full} does not exist.`);
  }
  if (!stat.isFile()) throw new ToolError(`${full} is not a file.`);
  return full;
}

export interface OutDiagnostic {
  severity: Diagnostic["severity"];
  code: string;
  message: string;
  /** JSON path of the value inside the file, e.g. ["processes", "pricing", "requires", 0]. */
  path: (string | number)[];
  /** The object or process the diagnostic is about. */
  element?: string;
  line: number;
  column: number;
}

function outDiagnostics(text: string, parsed: Parsed): OutDiagnostic[] {
  return parsed.errors.map((d) => {
    const { line, column } = lineColumn(text, locate(parsed.tree, d.path).offset);
    return { severity: d.severity, code: d.code, message: d.message, path: d.path, ...(d.element ? { element: d.element } : {}), line, column };
  });
}

function count(diags: { severity: string }[], severity: string): number {
  return diags.filter((d) => d.severity === severity).length;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "OK: no errors or warnings (2 infos)" or "1 error, 3 warnings, 0 infos". */
export function summaryLine(diags: { severity: string }[]): string {
  const e = count(diags, "error"), w = count(diags, "warning"), i = count(diags, "info");
  if (!e && !w) return `OK: no errors or warnings${i ? ` (${plural(i, "info")})` : ""}.`;
  return `${plural(e, "error")}, ${plural(w, "warning")}, ${plural(i, "info")}.`;
}

interface Loaded extends Parsed {
  file: string;
  text: string;
  diagnostics: OutDiagnostic[];
}

function load(file: string): Loaded {
  const text = fs.readFileSync(file, "utf-8");
  const parsed = check(file, text);
  return { file, text, ...parsed, diagnostics: outDiagnostics(text, parsed) };
}

/** A loaded model that parsed; a file that is not JSON is refused with the parser's messages. */
function loadModel(p: unknown): Loaded & { model: Model } {
  const loaded = load(modelFile(p));
  if (!loaded.model) {
    const where = loaded.diagnostics.map((d) => `line ${d.line}, column ${d.column}: ${d.message}`).join("; ");
    throw new ToolError(`${loaded.file} is not valid JSON (${where}). Fix the text first; opm_validate lists the positions.`);
  }
  return loaded as Loaded & { model: Model };
}

/** Rendering needs a model without errors, as on the command line. */
function loadClean(p: unknown): Loaded & { model: Model } {
  const loaded = loadModel(p);
  const errors = count(loaded.diagnostics, "error");
  if (errors) throw new ToolError(`${loaded.file} has ${plural(errors, "error")}; fix them first (opm_validate lists them).`);
  return loaded;
}

// ---------------------------------------------------------------- arguments

function str(args: Json, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

function need(args: Json, key: string, what: string): string {
  const v = str(args, key);
  if (!v) throw new ToolError(`"${key}" is required: ${what}.`);
  return v;
}

function thingOrFail(model: Model, id: string, expected?: "object" | "process"): "object" | "process" {
  const kind = thingKind(model, id);
  if (!kind) throw new ToolError(`No object or process "${id}" in the model.${didYouMean(model, id)}`);
  if (expected && kind !== expected) throw new ToolError(`"${id}" is ${kind === "object" ? "an object" : "a process"}; ${expected === "object" ? "an object" : "a process"} is needed here.`);
  return kind;
}

/** " Did you mean: a, b?" for identifiers or labels that contain the given text, ignoring case. */
function didYouMean(model: Model, id: string): string {
  const needle = id.toLowerCase();
  const all = [...Object.keys(objects(model)), ...Object.keys(processes(model)), ...Object.keys(stories(model)), ...Object.keys(model.views ?? {})];
  const hits = all.filter((x) => x.toLowerCase().includes(needle) || needle.includes(x.toLowerCase()) || label(model, x).toLowerCase().includes(needle));
  return hits.length ? ` Did you mean: ${hits.slice(0, 8).join(", ")}?` : "";
}

function checkState(model: Model, object: string, state: string) {
  const states = objects(model)[object]?.states ?? [];
  if (!states.includes(state)) {
    throw new ToolError(`${object} has no state "${state}". ${states.length ? `Its states are: ${states.join(", ")}.` : "It has no states; add them with opm_set first."}`);
  }
}

// ---------------------------------------------------------------- links in the agent's vocabulary

/** A link as the tools report it: the field it is stored in, the thing that stores it and the thing it points at. */
export interface LinkInfo {
  kind: string;
  owner: string;
  target: string;
  state?: string;
  fromState?: string;
  toState?: string;
  tag?: string;
  note?: string;
}

function linkInfo(l: EditorLink): LinkInfo {
  const owner = String(l.path[1]);
  const kind = String(l.path[2]);
  const out: LinkInfo = { kind, owner, target: l.from === owner ? l.to : l.from };
  if (kind === "changes") {
    if (l.fromState) out.fromState = l.fromState;
    if (l.toState) out.toState = l.toState;
  } else if (l.fromState ?? l.toState) out.state = l.fromState ?? l.toState;
  if (l.tag) out.tag = l.tag;
  if (l.note) out.note = l.note;
  return out;
}

type End = "object" | "process" | "same";

/** Every link field of the format: who stores it, what it points at, and the editor link kind behind it. */
const LINK_KINDS: Record<string, { owner: End; target: End; editor?: EditorLinkKind; state?: boolean }> = {
  handledBy: { owner: "process", target: "object", editor: "agent" },
  requires: { owner: "process", target: "object", editor: "instrument", state: true },
  consumes: { owner: "process", target: "object", editor: "consumption", state: true },
  yields: { owner: "process", target: "object", editor: "result", state: true },
  affects: { owner: "process", target: "object", editor: "effect" },
  changes: { owner: "process", target: "object", editor: "effect" },
  conditions: { owner: "process", target: "object", editor: "condition", state: true },
  events: { owner: "process", target: "object", editor: "event", state: true },
  invokes: { owner: "process", target: "process", editor: "invocation" },
  zoomsInto: { owner: "process", target: "process" },
  consistsOf: { owner: "same", target: "same", editor: "aggregation" },
  exhibits: { owner: "object", target: "object", editor: "exhibition" },
  isA: { owner: "same", target: "same", editor: "generalization" },
  tagged: { owner: "object", target: "object", editor: "tagged" },
};
const LINK_KIND_NAMES = Object.keys(LINK_KINDS);

function checkEnds(model: Model, kind: string, owner: string, target: string) {
  const spec = LINK_KINDS[kind];
  if (!spec) throw new ToolError(`Unknown link kind "${kind}". Known: ${LINK_KIND_NAMES.join(", ")}.`);
  const ownerKind = thingOrFail(model, owner);
  const targetKind = thingOrFail(model, target);
  if (owner === target) throw new ToolError(`${owner} cannot link to itself.`);
  if (spec.owner !== "same" && ownerKind !== spec.owner) throw new ToolError(`${kind} is stored on a ${spec.owner}, and "${owner}" is ${ownerKind === "object" ? "an object" : "a process"}.`);
  if (spec.target === "same" ? targetKind !== ownerKind : targetKind !== spec.target) {
    const want = spec.target === "same" ? ownerKind : spec.target;
    throw new ToolError(`${kind} of ${owner} points at ${want === "object" ? "an object" : "a process"}, and "${target}" is ${targetKind === "object" ? "an object" : "a process"}.`);
  }
}

// ---------------------------------------------------------------- edits

/** The text of a model while a tool applies one or more operations to it; nothing is written until the end. */
class Session {
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

const key = (d: OutDiagnostic) => `${d.severity}|${d.code}|${d.message}|${d.path.join("/")}`;

/**
 * Runs an edit on a model file: the operations go through the edit engine, the result is parsed and validated,
 * and only a result that is still valid JSON is written. Returns the diagnostics after the edit and those it added.
 */
function edit(p: unknown, body: (s: Session, model: Model) => { ids?: string[]; message?: string } | void, guard?: (after: Parsed, text: string) => void) {
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

const ID = /^[a-z][A-Za-z0-9]*$/;

function checkNewId(model: Model, id: string) {
  if (!ID.test(id)) throw new ToolError(`"${id}" is not a valid identifier: use camelCase starting with a lowercase letter, for example priceResult.`);
  const taken = new Set([...Object.keys(objects(model)), ...Object.keys(processes(model)), ...Object.keys(model.views ?? {}), "system", "structure"]);
  if (taken.has(id)) throw new ToolError(`"${id}" is already used in this model.`);
}

/** Adds an object or a process with an exact identifier, or one derived from the label, and its fields. */
function addThing(s: Session, model: Model, kind: "object" | "process", args: Json, patch: Json): string {
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

// ---------------------------------------------------------------- read helpers

function walkModels(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) visit(path.join(dir, e.name));
      } else if (e.isFile() && MODEL_FILE.test(e.name)) out.push(path.join(dir, e.name));
    }
  };
  visit(root);
  return out.sort();
}

interface ZoomNode {
  id: string;
  label: string;
  subprocesses?: ZoomNode[];
}

function zoomTree(model: Model): ZoomNode[] {
  const procs = processes(model);
  const parentOf = parents(model);
  const seen = new Set<string>();
  const node = (id: string): ZoomNode => {
    seen.add(id);
    const subs = (procs[id]?.zoomsInto ?? []).filter((s) => procs[s] && !seen.has(s));
    return { id, label: label(model, id), ...(subs.length ? { subprocesses: subs.map(node) } : {}) };
  };
  const roots = Object.keys(procs).filter((id) => !parentOf.has(id)).map(node);
  // processes in a zoomsInto cycle have a parent each and no root; list them at the top so none is lost
  for (const id of Object.keys(procs)) if (!seen.has(id)) roots.push(node(id));
  return roots;
}

/** Where a thing occurs in the user stories. */
function storyUses(model: Model, id: string) {
  const out: { story: string; as: string; step?: number; does?: string }[] = [];
  for (const [sid, s] of Object.entries(stories(model))) {
    if ((s.lanes ?? []).includes(id)) out.push({ story: sid, as: "lane" });
    (s.steps ?? []).forEach((st, i) => {
      if (st.lane === id) out.push({ story: sid, as: "step lane", step: i, does: st.does });
      if (st.process === id) out.push({ story: sid, as: "step process", step: i, does: st.does });
      if (st.handsOver?.object === id) out.push({ story: sid, as: "handed over", step: i, does: st.does });
      if (st.handsOver?.to === id) out.push({ story: sid, as: "receiving lane", step: i, does: st.does });
    });
  }
  return out;
}

function storyLanes(model: Model, sid: string) {
  const s = stories(model)[sid];
  if (!s) throw new ToolError(`No story "${sid}". Stories: ${Object.keys(stories(model)).join(", ") || "none"}.`);
  const steps = s.steps ?? [];
  return {
    story: sid,
    title: storyTitle(sid, s),
    lanes: (s.lanes ?? []).map((lane) => ({
      id: lane,
      label: label(model, lane),
      kind: laneKind(model, lane) ?? "not an agent or a module",
      steps: steps.flatMap((st, i) => (st.lane === lane ? [{ step: i, does: st.does, ...(st.process ? { process: st.process } : {}) }] : [])),
      handsOver: steps.flatMap((st, i) => (st.lane === lane && st.handsOver ? [{ step: i, object: st.handsOver.object, ...(st.handsOver.state ? { state: st.handsOver.state } : {}), to: st.handsOver.to }] : [])),
      receives: steps.flatMap((st, i) => (st.handsOver?.to === lane ? [{ step: i, object: st.handsOver.object, ...(st.handsOver.state ? { state: st.handsOver.state } : {}), from: st.lane }] : [])),
    })),
  };
}

// ---------------------------------------------------------------- schemas of the arguments

const PATH = { type: "string", description: "Absolute path of the *.opm.json model file." };
const ID_ARG = (what: string) => ({ type: "string", description: what });
const NULLABLE_TEXT = (what: string) => ({ type: ["string", "null"], description: what });

/** A definition of the model format schema with its $refs replaced by the definitions they point to. */
function inlineDef(name: string): Json {
  const defs = (modelSchema as unknown as { $defs: Record<string, Json> }).$defs;
  const inline = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(inline);
    if (!v || typeof v !== "object") return v;
    const o = v as Json;
    if (typeof o.$ref === "string" && o.$ref.startsWith("#/$defs/")) {
      const { $ref, ...rest } = o;
      return { ...(inline(defs[$ref.slice(8)]) as Json), ...(inline(rest) as Json) };
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, inline(x)]));
  };
  return inline(defs[name]) as Json;
}

const STORY_SCHEMA = inlineDef("story");

const READ = { readOnly: true };

// ---------------------------------------------------------------- the tools

export const TOOLS: Tool[] = [
  {
    name: "opm_list_models",
    title: "List OPM models",
    ...READ,
    description: `Lists every OPM model file (*.opm.json) under a folder, recursively, skipping node_modules, dist, out and .git.

Parameters:
- root: absolute path of the folder to search.

Returns a JSON array, one entry per file: path, name, the counts of objects, modules, agents, processes, views and stories, and the counts of errors and warnings the validator finds. A file that is not valid JSON has "error" instead of the counts.

Example: {"root": "C:/work/project"} -> [{"path": "C:/work/project/model.opm.json", "name": "Window pricing", "objects": 22, "modules": 5, ...}]`,
    inputSchema: { type: "object", properties: { root: { type: "string", description: "Absolute path of the folder to search." } }, required: ["root"], additionalProperties: false },
    handler: (args) => {
      const root = need(args, "root", "the absolute path of a folder");
      if (!path.isAbsolute(root)) throw new ToolError(`"${root}" is not an absolute path.`);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new ToolError(`${root} is not a folder.`);
      return walkModels(path.resolve(root)).map((file) => {
        const loaded = load(file);
        if (!loaded.model) return { path: file, error: "not valid JSON" };
        const m = loaded.model;
        const objs = Object.entries(objects(m));
        return {
          path: file,
          name: m.name ?? path.basename(file),
          objects: objs.length,
          modules: objs.filter(([, o]) => o.role === "module").length,
          agents: objs.filter(([, o]) => o.role !== "module" && essence(o) === "physical").length,
          processes: Object.keys(processes(m)).length,
          views: Object.keys(m.views ?? {}).length,
          stories: Object.keys(stories(m)).length,
          errors: count(loaded.diagnostics, "error"),
          warnings: count(loaded.diagnostics, "warning"),
        };
      });
    },
  },
  {
    name: "opm_validate",
    title: "Validate an OPM model",
    ...READ,
    description: `Validates one OPM model: JSON syntax, the format schema, and the OPM rules (references, states, transformations, zoom cycles, JSON Schema enums, user stories).

Parameters:
- path: absolute path of the *.opm.json file.

Returns JSON: "summary" (one line, e.g. "1 error, 2 warnings, 0 infos." or "OK: no errors or warnings."), the counts, and "diagnostics": a list of {severity, code, message, path, element, line, column}. "path" is the JSON path of the value inside the file, e.g. ["processes", "pricing", "requires", 0]; line and column are 1-based.

Example: {"path": "C:/work/model.opm.json"}`,
    inputSchema: { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
    handler: (args) => {
      const loaded = load(modelFile(args.path));
      const d = loaded.diagnostics;
      return { file: loaded.file, summary: summaryLine(d), errors: count(d, "error"), warnings: count(d, "warning"), infos: count(d, "info"), diagnostics: d };
    },
  },
  {
    name: "opm_summary",
    title: "Summarise an OPM model",
    ...READ,
    description: `Gives the outline of one OPM model: what is in it, by identifier and label, without the links.

Parameters:
- path: absolute path of the *.opm.json file.

Returns JSON with: name, description, agents (physical objects), modules (objects with role "module"), objects (the rest, with states, essence, affiliation and schema where set), processes as a zoom tree (each process with its "subprocesses" in execution order), views (generated and custom: id, kind, code such as SD1.2, title), stories (id, title, lanes, number of steps) and the validation summary line. Use opm_get for the links of one thing.

Example: {"path": "C:/work/model.opm.json"}`,
    inputSchema: { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
    handler: (args) => {
      const { file, model, diagnostics } = loadModel(args.path);
      const objs = Object.entries(objects(model));
      const brief = (id: string) => ({ id, label: label(model, id) });
      return {
        file,
        name: model.name,
        ...(model.description ? { description: model.description } : {}),
        agents: objs.filter(([, o]) => o.role !== "module" && essence(o) === "physical").map(([id]) => brief(id)),
        modules: objs.filter(([, o]) => o.role === "module").map(([id]) => brief(id)),
        objects: objs.filter(([, o]) => o.role !== "module" && essence(o) !== "physical").map(([id, o]) => ({
          ...brief(id),
          ...(o.states ? { states: o.states } : {}),
          ...(o.affiliation ? { affiliation: o.affiliation } : {}),
          ...(o.schema ? { schema: o.schema } : {}),
        })),
        processes: zoomTree(model),
        views: listViews(model).map((v) => ({ id: v.id, kind: v.kind, code: v.code, title: v.title, ...(v.process ? { process: v.process } : {}) })),
        stories: Object.entries(stories(model)).map(([id, s]) => ({ id, title: storyTitle(id, s), lanes: s.lanes, steps: (s.steps ?? []).length })),
        summary: summaryLine(diagnostics),
      };
    },
  },
  {
    name: "opm_get",
    title: "Get one thing with its links",
    ...READ,
    description: `Gives everything about one object, process, story or custom view of a model.

Parameters:
- path: absolute path of the *.opm.json file.
- id: identifier of an object, a process, a story or a custom view.

For an object or a process, returns JSON with: kind, label, "definition" (the JSON entry as written, notes included), "outgoing" (links stored on this thing), "incoming" (links stored on other things that point at it), for a process "parent" and "subprocesses" (zoomsInto), "stories" (where it is a lane, a step's lane or process, handed over or receiving), "views" (ids of the views that show it), "opl" (its OPL sentences) and the diagnostics about it.
A link is {kind, owner, target, state?, fromState?, toState?, tag?, note?}: kind is the field of the format (handledBy, requires, consumes, yields, affects, changes, conditions, events, invokes, consistsOf, exhibits, isA, tagged), owner is the thing whose field holds it, target is what it points at. So "which processes require snapshot" is incoming with kind "requires".
For a story or a view, returns its definition and the diagnostics inside it.

Example: {"path": "C:/work/model.opm.json", "id": "snapshot"} -> {"kind": "object", "incoming": [{"kind": "yields", "owner": "freezing", "target": "snapshot"}, ...]}`,
    inputSchema: { type: "object", properties: { path: PATH, id: ID_ARG("Identifier of an object, process, story or custom view.") }, required: ["path", "id"], additionalProperties: false },
    handler: (args) => {
      const { model, diagnostics } = loadModel(args.path);
      const id = need(args, "id", "an identifier");
      const kind = thingKind(model, id);
      if (kind) {
        const links = editorLinks(model).map(linkInfo);
        const def = kind === "object" ? objects(model)[id] : processes(model)[id];
        const parent = kind === "process" ? parents(model).get(id) : undefined;
        return {
          id,
          kind: kind === "object" && def && (def as { role?: string }).role === "module" ? "module" : kind === "object" && essence(def) === "physical" ? "agent" : kind,
          label: label(model, id),
          definition: def,
          outgoing: links.filter((l) => l.owner === id),
          incoming: links.filter((l) => l.target === id && l.owner !== id),
          ...(kind === "process" ? { parent: parent ?? null, subprocesses: processes(model)[id].zoomsInto ?? [] } : {}),
          stories: storyUses(model, id),
          views: viewsContaining(model, id),
          opl: oplAbout(model, [id]).map(sentenceText),
          diagnostics: diagnostics.filter((d) => d.element === id),
        };
      }
      if (stories(model)[id]) {
        return { id, kind: "story", title: storyTitle(id, stories(model)[id]), definition: stories(model)[id], diagnostics: diagnostics.filter((d) => d.path[0] === "stories" && d.path[1] === id) };
      }
      if (model.views?.[id]) {
        return { id, kind: "view", definition: model.views[id], diagnostics: diagnostics.filter((d) => d.path[0] === "views" && d.path[1] === id) };
      }
      throw new ToolError(`Nothing called "${id}" in the model.${didYouMean(model, id)}`);
    },
  },
  {
    name: "opm_query",
    title: "Ask a question about a model",
    ...READ,
    description: `Answers one of four questions about a model.

Parameters:
- path: absolute path of the *.opm.json file.
- question: one of
  - "modulesOfProcess" (needs "process"): the modules a process requires, itself or through its subprocesses at every depth (zoomsInto), each with the processes that require it.
  - "processesOfObject" (needs "object"): every process that links to the object, with the link kind (handledBy, requires, consumes, yields, affects, changes, conditions, events) and the states.
  - "exchange" (needs "from" and "to", modules or agents): the N² matrix cell, i.e. the objects that processes performed by "from" yield, change or affect and processes performed by "to" take in, with the pair of processes for each; also the reverse cell and whether the two are in a cycle.
  - "storyLanes" (needs "story"): the lanes of a user story with their kind (agent or module), their steps, what each lane hands over and what it receives.

Returns JSON.

Examples: {"path": "C:/work/model.opm.json", "question": "modulesOfProcess", "process": "pricing"}; {"path": "...", "question": "exchange", "from": "generator", "to": "pricingModule"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        question: { type: "string", enum: ["modulesOfProcess", "processesOfObject", "exchange", "storyLanes"], description: "Which question to answer." },
        process: ID_ARG("Process id, for modulesOfProcess."),
        object: ID_ARG("Object id, for processesOfObject."),
        from: ID_ARG("Giving module or agent, for exchange."),
        to: ID_ARG("Receiving module or agent, for exchange."),
        story: ID_ARG("Story id, for storyLanes."),
      },
      required: ["path", "question"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { model } = loadModel(args.path);
      switch (args.question) {
        case "modulesOfProcess": {
          const pid = need(args, "process", "the process to ask about");
          thingOrFail(model, pid, "process");
          const scope = [pid, ...descendants(model, pid)];
          const found = new Map<string, string[]>();
          for (const l of editorLinks(model).map(linkInfo)) {
            if (l.kind === "requires" && scope.includes(l.owner) && objects(model)[l.target]?.role === "module") {
              found.set(l.target, [...(found.get(l.target) ?? []), l.owner]);
            }
          }
          return { process: pid, scope, modules: [...found].map(([id, by]) => ({ id, label: label(model, id), requiredBy: by })) };
        }
        case "processesOfObject": {
          const oid = need(args, "object", "the object to ask about");
          thingOrFail(model, oid, "object");
          const links = editorLinks(model).map(linkInfo).filter((l) => l.target === oid && processes(model)[l.owner]);
          return { object: oid, links: links.map(({ target: _t, owner, ...rest }) => ({ process: owner, ...rest })) };
        }
        case "exchange": {
          const from = need(args, "from", "the giving module or agent");
          const to = need(args, "to", "the receiving module or agent");
          const d = dsm(model, { agents: true });
          for (const id of [from, to]) {
            if (!d.order.includes(id)) throw new ToolError(`"${id}" is not in the N² matrix: it must be a module or an agent that handles a process. Rows: ${d.order.join(", ")}.`);
          }
          const procs = Object.keys(processes(model));
          const via = (a: string, b: string, obj: string) => procs.flatMap((g) =>
            performers(model, g).includes(a) && givenBy(model, g).includes(obj)
              ? procs.filter((t) => t !== g && performers(model, t).includes(b) && usedBy(model, t).includes(obj)).map((t) => ({ giver: g, taker: t }))
              : []);
          const cell = (a: string, b: string) => (d.cells[a]?.[b] ?? []).map((o) => ({ id: o, label: label(model, o), via: via(a, b, o) }));
          return {
            from, to,
            objects: cell(from, to),
            reverse: cell(to, from),
            cycle: d.cycles.some((c) => c.includes(from) && c.includes(to)),
          };
        }
        case "storyLanes":
          return storyLanes(model, need(args, "story", "the story id"));
        default:
          throw new ToolError(`Unknown question "${String(args.question)}".`);
      }
    },
  },
  {
    name: "opm_opl",
    title: "OPL sentences",
    ...READ,
    description: `Gives the OPL sentences (Object-Process Language, the controlled-English text of ISO 19450) of a whole model or of some things in it.

Parameters:
- path: absolute path of the *.opm.json file.
- ids (optional): identifiers of objects or processes; only the sentences that mention any of them are returned.

Returns plain text, one sentence per line, e.g. "Pricing requires Pricing Module, valid Snapshot, Customer and Department Data."

Example: {"path": "C:/work/model.opm.json", "ids": ["pricing"]}`,
    inputSchema: {
      type: "object",
      properties: { path: PATH, ids: { type: "array", items: { type: "string" }, description: "Optional: only sentences about these things." } },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { model } = loadModel(args.path);
      const ids = (args.ids as string[] | undefined) ?? undefined;
      if (ids) for (const id of ids) thingOrFail(model, id);
      const sentences = ids ? oplAbout(model, ids) : oplSentences(model);
      return sentences.map(sentenceText).join("\n") || "No OPL sentences.";
    },
  },
  {
    name: "opm_render",
    title: "Render the markdown document",
    ...READ,
    description: `Renders the markdown document of a model, the same as "opm render": Mermaid diagrams of every view, the module table, state diagrams, OPL, the user stories, then the method sections (IDEF0, SIPOC, N² matrix, flow). The model must have no errors.

Parameters:
- path: absolute path of the *.opm.json file.
- methods (optional): which method sections to append, a subset of ["idef0", "sipoc", "dsm", "flow"]; [] for none; all four when omitted.
- write (optional, default false): when true, writes the document to <model>.md next to the model file and returns only the path, instead of returning the text.

Returns the markdown text, or a line naming the written file.

Example: {"path": "C:/work/model.opm.json", "methods": []}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        methods: { type: "array", items: { type: "string", enum: METHODS }, description: "Method sections to append; [] for none; all when omitted." },
        write: { type: "boolean", description: "Write <model>.md next to the model instead of returning the text." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { file, model } = loadClean(args.path);
      const methods = (args.methods as MethodId[] | undefined) ?? METHODS;
      const text = documentWithMethods(model, METHODS.filter((m) => methods.includes(m)));
      if (args.write !== true) return text;
      const out = file.replace(MODEL_FILE, "") + ".md";
      fs.writeFileSync(out, text, "utf-8");
      return `Written ${out} (${text.length} characters).`;
    },
  },
  {
    name: "opm_method",
    title: "IDEF0, SIPOC, N² or flow",
    ...READ,
    description: `Gives one of the four views computed from the links of a model, as markdown. The model must have no errors.

Parameters:
- path: absolute path of the *.opm.json file.
- method: "idef0" (ICOM boxes of the top-level and zoomed processes with the A0 decomposition), "sipoc" (suppliers, inputs, process, outputs, customers of each top-level process), "dsm" (N² matrix of modules and agents with cycles), "flow" (swimlane flow of each zoomed process).
- process (optional): one process instead of all; not used by "dsm".
- agents (optional, default true): for "dsm", whether agents get rows and columns.

Returns markdown text.

Example: {"path": "C:/work/model.opm.json", "method": "idef0", "process": "pricing"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        method: { type: "string", enum: METHODS, description: "Which method." },
        process: ID_ARG("Optional: one process instead of all."),
        agents: { type: "boolean", description: "For dsm: include agents (default true)." },
      },
      required: ["path", "method"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { model } = loadClean(args.path);
      const pid = str(args, "process");
      if (pid) thingOrFail(model, pid, "process");
      const ids = pid ? [pid] : undefined;
      const lines = args.method === "idef0" ? idef0Markdown(model, ids)
        : args.method === "sipoc" ? sipocMarkdown(model, ids)
        : args.method === "flow" ? flowMarkdown(model, ids)
        : dsmMarkdown(model, { agents: args.agents !== false });
      return lines.join("\n").trimEnd() || `Nothing to show: ${args.method === "flow" ? "no process has subprocesses" : "no process fits"}${pid ? ` (${pid})` : ""}.`;
    },
  },

  // ------------------------------------------------------------ edits

  {
    name: "opm_add_object",
    title: "Add an object",
    readOnly: false,
    description: `Adds an object to a model and writes the file. Every edit tool writes a minimal change of the JSON text (the rest of the file keeps its formatting), validates the result and returns the diagnostics.

Parameters:
- path: absolute path of the *.opm.json file.
- id and/or label: the identifier (camelCase, e.g. "priceResult") and the display label. With only a label the id is derived from it; with only an id the label is derived from the id and not written.
- description, note (Markdown, skipped by OPL), states (at least two names), essence ("informatical" default, "physical" for agents and material things), affiliation ("systemic" default, "environmental" for things outside the system), role ("module" for a part of the system that processes require), schema ("file#/json/pointer" relative to the model).
- view (optional): a custom view with a "things" list to add the object to.

Returns JSON: changed, ids (the new identifier), summary, "introduced" (diagnostics the edit added), resolved (how many it removed) and all diagnostics after the edit. A new object linked to nothing gets an "unused-object" warning until opm_link connects it.

Example: {"path": "C:/work/model.opm.json", "id": "invoice", "states": ["draft", "sent"]}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Identifier, camelCase."),
        label: ID_ARG("Display label."),
        description: { type: "string" },
        note: { type: "string", description: "Markdown note; skipped by the validator and OPL." },
        states: { type: "array", items: { type: "string" }, minItems: 2, description: "State names, at least two." },
        essence: { type: "string", enum: ["informatical", "physical"] },
        affiliation: { type: "string", enum: ["systemic", "environmental"] },
        role: { type: "string", enum: ["module"] },
        schema: { type: "string", description: "JSON Schema definition, file#/json/pointer relative to the model." },
        view: ID_ARG("Optional custom view (with a things list) to add the object to."),
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const { description, note, states, essence: ess, affiliation, role, schema } = args;
      const id = addThing(s, model, "object", args, { description, note, states, essence: ess, affiliation, role, schema });
      return { ids: [id] };
    }),
  },
  {
    name: "opm_add_process",
    title: "Add a process",
    readOnly: false,
    description: `Adds a process to a model and writes the file, optionally as a subprocess of another process.

Parameters:
- path: absolute path of the *.opm.json file.
- id and/or label: as in opm_add_object (e.g. id "invoicing").
- parent (optional): the process this one is a subprocess of; it is added to the parent's zoomsInto.
- index (optional, with parent): position in the parent's execution order, 0 = first; at the end when omitted.
- description, note, essence, affiliation: as in opm_add_object.
- view (optional): a custom view with a "things" list to add the process to.

Returns the same JSON as every edit tool. A new process has the error "no-transformation" until it consumes, yields, affects or changes an object: link it with opm_link.

Example: {"path": "C:/work/model.opm.json", "id": "discounting", "parent": "pricing", "index": 1}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Identifier, camelCase."),
        label: ID_ARG("Display label."),
        parent: ID_ARG("Optional parent process (zoomsInto)."),
        index: { type: "integer", minimum: 0, description: "Position among the parent's subprocesses, 0 = first." },
        description: { type: "string" },
        note: { type: "string", description: "Markdown note; skipped by the validator and OPL." },
        essence: { type: "string", enum: ["informatical", "physical"] },
        affiliation: { type: "string", enum: ["systemic", "environmental"] },
        view: ID_ARG("Optional custom view (with a things list) to add the process to."),
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      if (args.index !== undefined && !args.parent) throw new ToolError("\"index\" needs \"parent\".");
      const { description, note, essence: ess, affiliation } = args;
      const id = addThing(s, model, "process", args, { description, note, essence: ess, affiliation });
      if (typeof args.index === "number") s.apply({ op: "reorderSubprocess", parent: String(args.parent), id, index: args.index });
      return { ids: [id] };
    }),
  },
  {
    name: "opm_link",
    title: "Add a link",
    readOnly: false,
    description: `Adds a link between two things and writes the file. The link is stored in a field of the "owner", exactly as in the JSON format: {"kind": "requires", "owner": "pricing", "target": "snapshot"} writes "snapshot" into processes.pricing.requires.

Parameters:
- path: absolute path of the *.opm.json file.
- kind: the field of the format:
  - stored on a process, pointing at an object: handledBy (agent), requires (instrument), consumes, yields, affects, changes (state change), conditions, events;
  - stored on a process, pointing at a process: invokes, zoomsInto (makes target a subprocess of owner);
  - stored on an object, pointing at an object: exhibits, tagged;
  - stored on an object or a process, pointing at the same kind: consistsOf, isA (isA holds one target and replaces the previous one).
- owner: the thing whose field holds the link (the process, for every procedural link).
- target: the thing the link points at.
- state (optional): a state of the target object, for requires, consumes, yields, conditions and events.
- fromState, toState: for "changes"; toState is required, fromState optional.
- tag: for "tagged", the phrase of the sentence, e.g. "is made for" gives "Price Request is made for Customer."
- note (optional): Markdown note on the link. Given for a link that already exists, it sets the note of that link.
- index (optional): for zoomsInto, position among the subprocesses.

States must exist on the object; unknown ids and wrong ends are refused before anything is written. Adding a link that already exists changes nothing.

Returns the same JSON as every edit tool.

Examples: {"path": "...", "kind": "conditions", "owner": "pricing", "target": "snapshot", "state": "valid"}; {"path": "...", "kind": "changes", "owner": "expiring", "target": "snapshot", "fromState": "valid", "toState": "expired"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        kind: { type: "string", enum: LINK_KIND_NAMES, description: "Field of the format that holds the link." },
        owner: ID_ARG("The thing whose field holds the link."),
        target: ID_ARG("The thing the link points at."),
        state: ID_ARG("State of the target object (requires, consumes, yields, conditions, events)."),
        fromState: ID_ARG("For changes: the state before."),
        toState: ID_ARG("For changes: the state after (required)."),
        tag: ID_ARG("For tagged: the phrase between the two labels."),
        note: { type: "string", description: "Markdown note on the link." },
        index: { type: "integer", minimum: 0, description: "For zoomsInto: position among the subprocesses." },
      },
      required: ["path", "kind", "owner", "target"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const kind = need(args, "kind", "the link field");
      const owner = need(args, "owner", "the thing that stores the link");
      const target = need(args, "target", "the thing the link points at");
      checkEnds(model, kind, owner, target);
      const spec = LINK_KINDS[kind];
      const state = str(args, "state");
      const fromState = str(args, "fromState");
      const toState = str(args, "toState");
      const note = str(args, "note");
      if (state && !spec.state) throw new ToolError(`A ${kind} link has no "state"${kind === "affects" ? "; a link with states is \"changes\", with fromState and toState" : ""}.`);
      if ((fromState || toState) && kind !== "changes") throw new ToolError(`"fromState" and "toState" belong to "changes" links only${spec.state ? `; for ${kind} use "state"` : ""}.`);
      if (str(args, "tag") && kind !== "tagged") throw new ToolError("\"tag\" belongs to \"tagged\" links only.");
      if (args.index !== undefined && kind !== "zoomsInto") throw new ToolError("\"index\" belongs to \"zoomsInto\" links only.");
      if (state) checkState(model, target, state);
      if (kind === "changes") {
        if (!toState) throw new ToolError("A \"changes\" link needs \"toState\" (and optionally \"fromState\"); a change without states is \"affects\".");
        checkState(model, target, toState);
        if (fromState) checkState(model, target, fromState);
      }
      if (kind === "zoomsInto") {
        if (note) throw new ToolError("A zoomsInto entry cannot carry a note; put the note on the subprocess with opm_set.");
        s.apply({ op: "addSubprocess", parent: owner, id: target, index: typeof args.index === "number" ? args.index : undefined });
        return;
      }
      const editor = spec.editor!;
      // the editor's link kinds read from the object to the process for links that a process stores about an object
      const objectFirst = spec.owner === "process" && spec.target === "object" && kind !== "yields";
      const [from, to] = objectFirst ? [target, owner] : [owner, target];
      const existing = editorLinks(model).find((l) => {
        const i = linkInfo(l);
        return i.kind === kind && i.owner === owner && i.target === target && i.state === state && i.fromState === fromState && i.toState === toState && (kind !== "tagged" || i.tag === (str(args, "tag") || "relates to"));
      });
      if (existing) {
        if (note !== undefined && note !== existing.note) {
          s.apply({ op: "updateLink", id: existing.id, note });
          return { message: "The link already existed; its note was set." };
        }
        return { message: "The link already exists; nothing changed." };
      }
      s.apply({
        op: "addLink", kind: editor, from, to,
        fromState: kind === "changes" ? fromState : objectFirst ? state : undefined,
        toState: kind === "changes" ? toState : kind === "yields" ? state : undefined,
        tag: str(args, "tag"),
        note,
      });
    }),
  },
  {
    name: "opm_unlink",
    title: "Remove a link",
    readOnly: false,
    destructive: true,
    description: `Removes a link and writes the file. The link is named the same way as in opm_link: the field (kind), the thing that stores it (owner) and the thing it points at (target).

Parameters:
- path: absolute path of the *.opm.json file.
- kind: handledBy, requires, consumes, yields, affects, changes, conditions, events, invokes, zoomsInto, consistsOf, exhibits, isA or tagged.
- owner, target: identifiers.
- state (optional): when the owner has several links of this kind to the target in different states, removes only the one that names this state (for changes, the fromState or the toState).

Every matching link is removed. For zoomsInto the subprocess leaves its parent but stays in the model. An empty field is removed with its last entry.

Returns the same JSON as every edit tool.

Example: {"path": "...", "kind": "requires", "owner": "pricing", "target": "customer"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        kind: { type: "string", enum: LINK_KIND_NAMES },
        owner: ID_ARG("The thing whose field holds the link."),
        target: ID_ARG("The thing the link points at."),
        state: ID_ARG("Optional: only the link that names this state."),
      },
      required: ["path", "kind", "owner", "target"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const kind = need(args, "kind", "the link field");
      const owner = need(args, "owner", "the thing that stores the link");
      const target = need(args, "target", "the thing the link points at");
      if (!LINK_KINDS[kind]) throw new ToolError(`Unknown link kind "${kind}". Known: ${LINK_KIND_NAMES.join(", ")}.`);
      thingOrFail(model, owner);
      if (kind === "zoomsInto") {
        s.apply({ op: "removeSubprocess", parent: owner, id: target });
        return { message: `${target} is no longer a subprocess of ${owner}.` };
      }
      const state = str(args, "state");
      const own = editorLinks(model).filter((l) => String(l.path[1]) === owner);
      const matches = own.filter((l) => {
        const i = linkInfo(l);
        return i.kind === kind && i.target === target && (state === undefined || [i.state, i.fromState, i.toState].includes(state));
      });
      if (!matches.length) {
        const list = own.map(linkInfo).map((i) => `${i.kind} ${i.target}${i.state ? ` (${i.state})` : ""}${i.toState ? ` (${i.fromState ?? ""}->${i.toState})` : ""}`);
        throw new ToolError(`${owner} has no ${kind} link to ${target}${state ? ` in state "${state}"` : ""}. Its links: ${list.join("; ") || "none"}.`);
      }
      s.apply({ op: "deleteElements", ids: [], links: matches.map((l) => l.id) });
      return { message: `Removed ${plural(matches.length, "link")}.` };
    }),
  },
  {
    name: "opm_rename",
    title: "Rename an identifier or a state",
    readOnly: false,
    description: `Renames the identifier of an object or a process, or a state of an object, and writes the file. Every reference follows: links, zoomsInto, custom views, layout keys, and in user stories the lanes, step lanes, step processes, handed-over objects, receiving lanes and handed-over states.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the object or process (for a state rename: the object that has the state).
- newId: the new identifier (camelCase). Give either newId, or state and newState.
- state, newState: rename the state "state" of object "id" to "newState".

The label is not changed: a thing without an explicit label shows the label derived from the new id. To change the label, use opm_set.

Returns the same JSON as every edit tool.

Examples: {"path": "...", "id": "priceResult", "newId": "quote"}; {"path": "...", "id": "snapshot", "state": "valid", "newState": "current"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Object or process identifier."),
        newId: ID_ARG("New identifier, camelCase."),
        state: ID_ARG("State of the object to rename."),
        newState: ID_ARG("New state name."),
      },
      required: ["path", "id"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const id = need(args, "id", "the object or process");
      const newId = str(args, "newId");
      const state = str(args, "state");
      const newState = str(args, "newState");
      if (newId && (state || newState)) throw new ToolError("Give either \"newId\", or \"state\" and \"newState\", not both.");
      if (newId) {
        thingOrFail(model, id);
        if (newId !== id) checkNewId(model, newId);
        s.apply({ op: "renameId", oldId: id, newId });
        return { ids: [newId] };
      }
      if (!state || !newState) throw new ToolError("Give \"newId\" to rename the thing, or \"state\" and \"newState\" to rename a state.");
      thingOrFail(model, id, "object");
      checkState(model, id, state);
      s.apply({ op: "renameState", object: id, oldState: state, newState });
      return { ids: [id] };
    }),
  },
  {
    name: "opm_set",
    title: "Set fields of a thing",
    readOnly: false,
    description: `Sets or removes descriptive fields of an object or a process and writes the file. Only the fields given change; null removes a field.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the object or process.
- label: display label; null (or the label derived from the id) removes the explicit label.
- description: plain text.
- note: Markdown, kept apart from the description; the validator and OPL skip it.
- states: the full list of states of an object (at least two), or null to remove them. Links that name a removed state are left as they are and reported by the validator: to rename a state use opm_rename, which updates the links too.
- role: "module" or null (objects only).
- essence: "informatical", "physical" or null.
- affiliation: "systemic", "environmental" or null.
- schema: "file#/json/pointer" of the JSON Schema definition, or null (objects only).

Returns the same JSON as every edit tool.

Example: {"path": "...", "id": "customer", "description": "The buyer, as kept in the ERP.", "affiliation": "environmental"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Object or process identifier."),
        label: NULLABLE_TEXT("Display label, or null to derive it from the id."),
        description: NULLABLE_TEXT("Description, or null to remove it."),
        note: NULLABLE_TEXT("Markdown note, or null to remove it."),
        states: { type: ["array", "null"], items: { type: "string" }, minItems: 2, description: "All states of the object, or null to remove them." },
        role: { type: ["string", "null"], enum: ["module", null], description: "\"module\" or null." },
        essence: { type: ["string", "null"], enum: ["informatical", "physical", null] },
        affiliation: { type: ["string", "null"], enum: ["systemic", "environmental", null] },
        schema: NULLABLE_TEXT("JSON Schema reference file#/pointer, or null."),
      },
      required: ["path", "id"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const id = need(args, "id", "the object or process");
      const kind = thingOrFail(model, id);
      const fields = ["label", "description", "note", "states", "role", "essence", "affiliation", "schema"].filter((f) => f in args);
      if (!fields.length) throw new ToolError("Nothing to set: give at least one of label, description, note, states, role, essence, affiliation, schema.");
      if (kind === "process") {
        const bad = fields.filter((f) => f === "states" || f === "role" || f === "schema");
        if (bad.length) throw new ToolError(`A process has no ${bad.join(", ")}; these fields belong to objects.`);
      }
      if ("label" in args) s.apply({ op: "setLabel", id, label: (args.label as string | null) ?? null });
      const patch = Object.fromEntries(fields.filter((f) => f !== "label").map((f) => [f, args[f] ?? null]));
      if (Object.keys(patch).length) s.apply({ op: "updateElement", id, patch });
      return { ids: [id] };
    }),
  },
  {
    name: "opm_delete",
    title: "Delete things or states",
    readOnly: false,
    destructive: true,
    description: `Deletes objects, processes or states and writes the file.

Parameters:
- path: absolute path of the *.opm.json file.
- ids (optional): objects and processes to delete. Each goes with every link that points at it, its zoomsInto entries, custom views built on it and its layout positions. User stories are left as they are, because steps are written by people: the validator then reports the steps that name a deleted thing, and they appear in "introduced".
- states (optional): [{"object": "...", "state": "..."}] states to delete. Links that name the state stay without it; a change whose target state is deleted becomes "affects".

Returns the same JSON as every edit tool.

Example: {"path": "...", "ids": ["hash"], "states": [{"object": "priceResult", "state": "partial"}]}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        ids: { type: "array", items: { type: "string" }, description: "Objects and processes to delete." },
        states: {
          type: "array",
          items: { type: "object", properties: { object: { type: "string" }, state: { type: "string" } }, required: ["object", "state"], additionalProperties: false },
          description: "States to delete.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const ids = (args.ids as string[] | undefined) ?? [];
      const states = (args.states as { object: string; state: string }[] | undefined) ?? [];
      if (!ids.length && !states.length) throw new ToolError("Nothing to delete: give \"ids\", \"states\" or both.");
      for (const id of ids) thingOrFail(model, id);
      for (const st of states) {
        thingOrFail(model, st.object, "object");
        checkState(model, st.object, st.state);
      }
      for (const st of states) if (!ids.includes(st.object)) s.apply({ op: "deleteState", object: st.object, state: st.state });
      if (ids.length) s.apply({ op: "deleteElements", ids });
      return { message: `Deleted ${[ids.length ? plural(ids.length, "thing") : "", states.length ? plural(states.length, "state") : ""].filter(Boolean).join(" and ")}.` };
    }),
  },
  {
    name: "opm_add_story",
    title: "Add a user story",
    readOnly: false,
    description: `Adds a user story (a makigami) to the "stories" section and writes the file. The story must match the format: the edit is refused when it does not.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the story key, camelCase, not used by another story.
- story: the whole story object:
  - story (required): the sentence, "As a ... I want ..., so that ...".
  - lanes (required): agents (physical objects) or modules of the model, top to bottom.
  - steps (required, in time order): {lane, does, process?, handsOver?: {object, state?, to}, waits?, problem?, note?}. lane and handsOver.to are among the lanes; process is a process of the model; object is an object of the model, state one of its states.
  - title, doneWhen (list of sentences), note: optional.

The validator then checks the references against the model; its findings are in the returned diagnostics.

Returns the same JSON as every edit tool.

Example: {"path": "...", "id": "orderWindow", "story": {"story": "As a user I want to order the priced window.", "lanes": ["user", "ui"], "steps": [{"lane": "user", "does": "Presses Order.", "process": "configuring", "handsOver": {"object": "configuration", "to": "ui"}}]}}`,
    inputSchema: {
      type: "object",
      properties: { path: PATH, id: ID_ARG("Story key, camelCase."), story: STORY_SCHEMA },
      required: ["path", "id", "story"],
      additionalProperties: false,
    },
    handler: (args) => {
      const id = need(args, "id", "the story key");
      return edit(args.path, (s, model) => {
        if (stories(model)[id]) throw new ToolError(`Story "${id}" already exists; use opm_set_story to replace it.`);
        s.apply({ op: "setStory", id, story: args.story as StoryDef });
        return { ids: [id] };
      }, storyGuard(id));
    },
  },
  {
    name: "opm_set_story",
    title: "Replace or delete a user story",
    readOnly: false,
    destructive: true,
    description: `Replaces a whole user story, or deletes it, and writes the file. Read the current story with opm_get first, change it, and pass the whole object back. The new story must match the format (see opm_add_story); the edit is refused when it does not.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the key of an existing story.
- story: the whole new story object. Omit it and pass "delete": true to remove the story.
- delete (optional): true removes the story.

Returns the same JSON as every edit tool.

Example: {"path": "...", "id": "getPrice", "delete": true}`,
    inputSchema: {
      type: "object",
      properties: { path: PATH, id: ID_ARG("Key of an existing story."), story: STORY_SCHEMA, delete: { type: "boolean", description: "true removes the story." } },
      required: ["path", "id"],
      additionalProperties: false,
    },
    handler: (args) => {
      const id = need(args, "id", "the story key");
      return edit(args.path, (s, model) => {
        if (!stories(model)[id]) throw new ToolError(`No story "${id}". Stories: ${Object.keys(stories(model)).join(", ") || "none"}; opm_add_story adds one.`);
        if (args.delete === true) {
          if (args.story !== undefined) throw new ToolError("Give either \"story\" or \"delete\": true, not both.");
          s.apply({ op: "setStory", id, story: null });
          return { message: `Story ${id} deleted.` };
        }
        if (!args.story) throw new ToolError("Give the whole new \"story\", or \"delete\": true.");
        s.apply({ op: "setStory", id, story: args.story as StoryDef });
        return { ids: [id] };
      }, storyGuard(id));
    },
  },
];

/** Refuses a story that does not match the format, so a broken story is never written. */
function storyGuard(id: string) {
  return (after: Parsed) => {
    const bad = structureErrors(after.model).filter((d) => d.path[0] === "stories" && d.path[1] === id);
    if (bad.length) throw new ToolError(`Refused: the story does not match the format, nothing was written. ${bad.map((d) => d.message).join(" ")}`);
  };
}

// ---------------------------------------------------------------- calling a tool

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>(TOOLS.map((t) => [t.name, ajv.compile(t.inputSchema)]));

export interface CallResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/** Checks the arguments against the tool's schema, runs it and turns the value or the refusal into an MCP result. */
export function callTool(name: string, args: Json = {}): CallResult {
  const tool = TOOLS.find((t) => t.name === name);
  const fail = (text: string): CallResult => ({ content: [{ type: "text", text }], isError: true });
  if (!tool) return fail(`Unknown tool "${name}". Tools: ${TOOLS.map((t) => t.name).join(", ")}.`);
  const valid = validators.get(name)!;
  if (!valid(args)) {
    const problems = (valid.errors ?? []).map((e) => `${e.instancePath || "arguments"} ${e.message}${e.params && "additionalProperty" in e.params ? ` (${String(e.params.additionalProperty)})` : ""}`);
    return fail(`Invalid arguments for ${name}: ${problems.join("; ")}.`);
  }
  try {
    const value = tool.handler(args);
    return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
  } catch (e) {
    if (e instanceof ToolError) return fail(e.message);
    return fail(`Internal error in ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
