export type Essence = "informatical" | "physical";
export type Affiliation = "systemic" | "environmental";

/** A link target: an identifier, or an identifier with a state of the target object. */
export type Ref = string | { object: string; state?: string };

export interface Tagged {
  object: string;
  tag: string;
}

export interface ObjectDef {
  label?: string;
  description?: string;
  role?: "module";
  essence?: Essence;
  affiliation?: Affiliation;
  states?: string[];
  schema?: string;
  consistsOf?: string[];
  exhibits?: string[];
  isA?: string;
  tagged?: Tagged[];
}

export interface StateChange {
  object: string;
  from?: string;
  to: string;
}

export interface StateRef {
  object: string;
  state?: string;
}

export interface ProcessDef {
  label?: string;
  description?: string;
  essence?: Essence;
  affiliation?: Affiliation;
  handledBy?: string[];
  requires?: Ref[];
  consumes?: Ref[];
  yields?: Ref[];
  affects?: string[];
  changes?: StateChange[];
  conditions?: StateRef[];
  events?: StateRef[];
  zoomsInto?: string[];
  invokes?: string[];
  consistsOf?: string[];
  isA?: string;
}

export interface ViewDef {
  title?: string;
  description?: string;
  process?: string;
  things?: string[];
}

/** View id -> thing id -> [x, y] of the top-left corner. */
export type Layout = Record<string, Record<string, [number, number]>>;

export interface Model {
  $schema?: string;
  name?: string;
  description?: string;
  objects?: Record<string, ObjectDef>;
  processes?: Record<string, ProcessDef>;
  views?: Record<string, ViewDef>;
  layout?: Layout;
}

/** Procedural link kinds, in the order they are listed in OPL and drawn in diagrams. */
export type LinkKind =
  | "handledBy" | "requires" | "consumes" | "yields" | "affects"
  | "changes" | "conditions" | "events" | "invokes";

export interface Link {
  kind: LinkKind;
  process: string;
  target: string;
  from?: string;
  to?: string;
  state?: string;
}

const ACRONYMS = new Set(["ui", "erp", "bom", "mes", "cam", "cad", "api", "id", "uuid", "json", "cnc", "wms", "tms", "opl", "opm"]);

/** priceResult -> Price Result; ui -> UI. */
export function humanize(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export function objects(model: Model): Record<string, ObjectDef> {
  return model.objects ?? {};
}

export function processes(model: Model): Record<string, ProcessDef> {
  return model.processes ?? {};
}

export function label(model: Model, id: string): string {
  return objects(model)[id]?.label ?? processes(model)[id]?.label ?? humanize(id);
}

export function essence(o: { essence?: Essence }): Essence {
  return o.essence ?? "informatical";
}

export function affiliation(o: { affiliation?: Affiliation }): Affiliation {
  return o.affiliation ?? "systemic";
}

export function refObject(r: Ref): string {
  return typeof r === "string" ? r : r.object;
}

export function refState(r: Ref): string | undefined {
  return typeof r === "string" ? undefined : r.state;
}

/** All procedural links declared directly on one process. */
export function linksOf(id: string, p: ProcessDef): Link[] {
  const out: Link[] = [];
  for (const target of p.handledBy ?? []) out.push({ kind: "handledBy", process: id, target });
  for (const kind of ["requires", "consumes", "yields"] as const) {
    for (const r of p[kind] ?? []) out.push({ kind, process: id, target: refObject(r), state: refState(r) });
  }
  for (const target of p.affects ?? []) out.push({ kind: "affects", process: id, target });
  for (const c of p.changes ?? []) out.push({ kind: "changes", process: id, target: c.object, from: c.from, to: c.to });
  for (const c of p.conditions ?? []) out.push({ kind: "conditions", process: id, target: c.object, state: c.state });
  for (const e of p.events ?? []) out.push({ kind: "events", process: id, target: e.object, state: e.state });
  for (const target of p.invokes ?? []) out.push({ kind: "invokes", process: id, target });
  return out;
}

/** Parent process of each subprocess. */
export function parents(model: Model): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, p] of Object.entries(processes(model))) {
    for (const sub of p.zoomsInto ?? []) if (!out.has(sub)) out.set(sub, id);
  }
  return out;
}

/** Subprocesses of a process at every depth, without the process itself. */
export function descendants(model: Model, id: string, seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const sub of processes(model)[id]?.zoomsInto ?? []) {
    if (seen.has(sub)) continue;
    seen.add(sub);
    out.push(sub, ...descendants(model, sub, seen));
  }
  return out;
}
