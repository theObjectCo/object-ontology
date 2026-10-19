import { Model, label, objects, processes } from "../model";
import { agents, givenBy, isModule, performers, quote, usedBy, unique } from "./common";

export interface Dsm {
  /** Rows and columns, in the partitioned order. */
  order: string[];
  /** cells[a][b]: the objects that a gives and b takes, for a ≠ b. */
  cells: Record<string, Record<string, string[]>>;
  /** Groups of rows that exchange objects in a cycle; each has two or more members. */
  cycles: string[][];
  agents: boolean;
}

/**
 * The N² matrix of modules: cell (A, B) lists the objects that a process performed by A gives (yields, changes
 * or affects) and another process performed by B takes in (consumes, requires, is conditioned on or triggered
 * by, affects or changes). A process is performed by the modules it requires and the agents that handle it,
 * or by those of its nearest ancestor that has any. With `agents`, agents get rows and columns too.
 */
export function dsm(model: Model, options: { agents?: boolean } = {}): Dsm {
  const withAgents = options.agents ?? true;
  const handlers = agents(model);
  const members = Object.keys(objects(model)).filter((id) => isModule(model, id) || (withAgents && handlers.has(id)));
  const set = new Set(members);
  const cells: Dsm["cells"] = Object.fromEntries(members.map((m) => [m, {}]));
  const procs = Object.keys(processes(model)).map((id) => ({ id, by: performers(model, id).filter((p) => set.has(p)) }));
  for (const giver of procs) {
    const given = new Set(givenBy(model, giver.id));
    if (!given.size || !giver.by.length) continue;
    for (const taker of procs) {
      if (taker.id === giver.id) continue;
      const taken = usedBy(model, taker.id).filter((o) => given.has(o));
      if (!taken.length) continue;
      for (const a of giver.by) for (const b of taker.by) {
        if (a !== b) cells[a][b] = unique([...(cells[a][b] ?? []), ...taken]);
      }
    }
  }
  const groups = partition(members, (a) => Object.keys(cells[a]).filter((b) => cells[a][b].length));
  // objects in a cell follow the declaration order of the model
  const rank = new Map(Object.keys(objects(model)).map((id, i) => [id, i]));
  for (const row of Object.values(cells)) for (const b of Object.keys(row)) row[b].sort((x, y) => (rank.get(x) ?? 0) - (rank.get(y) ?? 0));
  return { order: groups.flat(), cells, cycles: groups.filter((g) => g.length > 1), agents: withAgents };
}

/**
 * Strongly connected groups (Tarjan) in topological order of the graph between them, so that a giver comes
 * before its takers and a cycle stays together. Ties and the members of a group keep the given order.
 */
export function partition(ids: string[], next: (id: string) => string[]): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groupOf = new Map<string, number>();
  const groups: string[][] = [];
  let counter = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of next(v)) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        groupOf.set(w, groups.length);
        group.push(w);
      } while (w !== v);
      groups.push(group);
    }
  };
  for (const id of ids) if (!index.has(id)) visit(id);
  const position = new Map(ids.map((id, i) => [id, i]));
  for (const g of groups) g.sort((a, b) => position.get(a)! - position.get(b)!);

  // Kahn's algorithm on the groups, always taking the waiting group that comes first in the given order
  const incoming = groups.map(() => new Set<number>());
  groups.forEach((g, i) => {
    for (const v of g) for (const w of next(v)) if (groupOf.get(w) !== i) incoming[groupOf.get(w)!].add(i);
  });
  const out: string[][] = [];
  const done = new Set<number>();
  while (out.length < groups.length) {
    const ready = groups.map((_, i) => i).filter((i) => !done.has(i) && [...incoming[i]].every((j) => done.has(j)));
    const pick = ready.sort((a, b) => position.get(groups[a][0])! - position.get(groups[b][0])!)[0];
    done.add(pick);
    out.push(groups[pick]);
  }
  return out;
}

/** The matrix as a markdown table: rows give, columns take. */
export function dsmMarkdown(model: Model, options: { agents?: boolean } = {}): string[] {
  const d = dsm(model, options);
  if (!d.order.length) return [];
  const L = (id: string) => label(model, id);
  const out = [
    "## N² matrix of modules",
    "",
    `Rows give, columns take: the cell in row A and column B lists the objects that processes performed by A yield, change or affect and processes performed by B use.${d.agents ? " Agents are included." : ""} The order puts every module that gives before the modules that take from it, and keeps modules that exchange objects in a cycle next to each other; a filled cell below the diagonal belongs to a cycle.`,
    "",
    `| | ${d.order.map((_, i) => i + 1).join(" | ")} |`,
    `|---|${d.order.map(() => "---").join("|")}|`,
  ];
  d.order.forEach((a, i) => {
    const row = d.order.map((b) => (a === b ? "■" : (d.cells[a][b] ?? []).map(L).join(", ").replace(/\|/g, "\\|")));
    out.push(`| ${i + 1}. ${L(a)} | ${row.join(" | ")} |`);
  });
  out.push("");
  out.push(d.cycles.length ? `Cycles: ${d.cycles.map((g) => g.map(L).join(", ")).join("; ")}.` : "No cycles.", "");
  if (d.order.some((a) => Object.values(d.cells[a]).some((c) => c.length))) out.push("```mermaid", dsmMermaid(model, d), "```", "");
  return out;
}

/** The exchanges as a Mermaid graph, one arrow per filled cell. */
export function dsmMermaid(model: Model, d: Dsm): string {
  const lines = ["flowchart LR"];
  for (const id of d.order) lines.push(`  m_${id}[${quote(label(model, id))}]`);
  for (const a of d.order) for (const b of d.order) {
    const list = d.cells[a][b];
    if (list?.length) lines.push(`  m_${a} -->|${quote(list.map((o) => label(model, o)).join(", "))}| m_${b}`);
  }
  return lines.join("\n");
}
