import { LinkKind, Model, descendants, label, linksOf, objects, parents, processes, refIds } from "../model";

/** The other views of a model: each is computed from the links, so it cannot disagree with the OPM diagram. */
export type MethodId = "idef0" | "sipoc" | "dsm" | "flow";

export const METHODS: MethodId[] = ["idef0", "sipoc", "dsm", "flow"];

/**
 * One object on a side of a process box: the link it comes from, with the state it names. `kept` marks a
 * required object, which enters the process and leaves it unchanged.
 */
export interface Entry {
  object: string;
  kind: LinkKind;
  state?: string;
  from?: string;
  to?: string;
  kept?: boolean;
}

export const isModule = (model: Model, id: string) => objects(model)[id]?.role === "module";

/** Objects that handle at least one process. */
export function agents(model: Model): Set<string> {
  return new Set(Object.values(processes(model)).flatMap((p) => refIds(p.handledBy)));
}

/** A process with its subprocesses at every depth. */
export function subtree(model: Model, id: string): Set<string> {
  return new Set([id, ...descendants(model, id)]);
}

/** Top-level processes, in declaration order. */
export function topLevel(model: Model): string[] {
  const parentOf = parents(model);
  return Object.keys(processes(model)).filter((id) => !parentOf.has(id));
}

/** Processes with at least one subprocess, in declaration order. */
export function zoomed(model: Model): string[] {
  return Object.keys(processes(model)).filter((id) => (processes(model)[id].zoomsInto ?? []).some((s) => processes(model)[s]));
}

/** Subprocesses of a process that exist, in the order of execution. */
export function steps(model: Model, id: string): string[] {
  return (processes(model)[id]?.zoomsInto ?? []).filter((s) => processes(model)[s]);
}

/**
 * The modules and agents that perform a process: the modules it requires and the agents that handle it. A
 * process with neither is performed by those of its nearest ancestor that has some.
 */
export function performers(model: Model, id: string): string[] {
  const parentOf = parents(model);
  const seen = new Set<string>();
  for (let cur: string | undefined = id; cur !== undefined && !seen.has(cur); cur = parentOf.get(cur)) {
    seen.add(cur);
    const p = processes(model)[cur];
    if (!p) break;
    const own = [...refIds(p.requires).filter((o) => isModule(model, o)), ...refIds(p.handledBy)];
    if (own.length) return [...new Set(own)];
  }
  return [];
}

/** Links through which a process takes an object in: consumes, requires, conditions, events, affects, changes. */
export const USES = new Set<LinkKind>(["consumes", "requires", "conditions", "events", "affects", "changes"]);

/** Links through which a process gives an object out: yields, affects, changes. */
export const GIVES = new Set<LinkKind>(["yields", "affects", "changes"]);

/** Objects a process gives out through its own links; modules and agents are not data and are left out. */
export function givenBy(model: Model, id: string): string[] {
  const p = processes(model)[id];
  return p ? linksOf(id, p).filter((l) => GIVES.has(l.kind)).map((l) => l.target) : [];
}

/** Objects a process takes in through its own links, without modules and agents. */
export function usedBy(model: Model, id: string): string[] {
  const p = processes(model)[id];
  const handlers = agents(model);
  return p ? linksOf(id, p).filter((l) => USES.has(l.kind) && !isModule(model, l.target) && !handlers.has(l.target)).map((l) => l.target) : [];
}

/** Keeps the first of equal values. */
export function unique<T>(list: T[], key: (x: T) => string = String): T[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Words that qualify an entry; the webview passes its own translation. */
export interface EntryWords {
  affected: string;
  event: string;
  agent: string;
  notConsumed: string;
}

export const ENTRY_WORDS: EntryWords = { affected: "affected", event: "event", agent: "agent", notConsumed: "not consumed" };

/** The words after an object's label: its state, a state change, or what kind of entry it is. */
export function entryNotes(e: Entry, words: EntryWords = ENTRY_WORDS): string[] {
  const out: string[] = [];
  if (e.kind === "changes" && e.to) out.push(e.from ? `${e.from} → ${e.to}` : `→ ${e.to}`);
  else if (e.state) out.push(e.state);
  if (e.kind === "affects") out.push(words.affected);
  if (e.kind === "events") out.push(words.event);
  if (e.kind === "handledBy") out.push(words.agent);
  if (e.kept) out.push(words.notConsumed);
  return out;
}

/** Snapshot (valid, not consumed). */
export function entryText(model: Model, e: Entry, words: EntryWords = ENTRY_WORDS): string {
  const notes = entryNotes(e, words);
  return notes.length ? `${label(model, e.object)} (${notes.join(", ")})` : label(model, e.object);
}

/** A markdown table cell: labels joined with commas, pipes escaped, "none" when empty. */
export function cell(texts: string[]): string {
  return texts.map((t) => t.replace(/\|/g, "\\|")).join(", ") || "none";
}

/** A Mermaid label in quotes. */
export const quote = (text: string) => `"${text.replace(/"/g, "#quot;")}"`;
