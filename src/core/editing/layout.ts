import { Model, processes } from "../model";
import { listViews, viewContent } from "../viewmodel";
import { EditError, EditResult, Operation, Position, Positions } from "./contracts";
import { Doc } from "./document";
import { idFromLabel, uniqueId } from "./identifiers";

export function round(p: Position): Position {
  return [Math.round(p[0]), Math.round(p[1])];
}

export function roundAll(ps: Positions): Positions {
  return Object.fromEntries(Object.entries(ps).map(([k, p]) => [k, round(p)]));
}

export function removeStale(doc: Doc, model: Model): Partial<EditResult> {
  const known = new Set(listViews(model).map((v) => v.id));
  for (const [vid, positions] of Object.entries(model.layout ?? {})) {
    if (!known.has(vid)) { doc.remove(["layout", vid]); continue; }
    const nodes = new Set(viewContent(model, vid)!.nodes.map((n) => n.id));
    for (const id of Object.keys(positions)) if (!nodes.has(id)) doc.remove(["layout", vid, id]);
  }
  return {};
}

export function layoutOperations(doc: Doc, model: Model, op: Extract<Operation, { op: "moveElements" | "setLayout" | "openZoom" | "saveView" | "removeStaleLayout" }>): Partial<EditResult> {
  switch (op.op) {

    case "moveElements": {
      const existing = model.layout?.[op.viewId];
      if (!existing) {
        doc.set(["layout", op.viewId], roundAll({ ...(op.all ?? {}), ...op.positions }));
        return {};
      }
      for (const [id, p] of Object.entries(op.positions)) doc.set(["layout", op.viewId, id], round(p));
      return {};
    }

    case "setLayout": {
      if (op.positions === null) doc.remove(["layout", op.viewId]);
      else doc.set(["layout", op.viewId], roundAll(op.positions));
      if (op.positions === null && doc.model.layout && !Object.keys(doc.model.layout).length) doc.remove(["layout"]);
      return {};
    }

    case "openZoom": {
      if (!processes(model)[op.process]) throw new EditError(`Unknown process "${op.process}".`);
      if (processes(model)[op.process].zoomsInto === undefined) doc.set(["processes", op.process, "zoomsInto"], []);
      return {};
    }

    case "saveView": {
      const id = uniqueId(model, idFromLabel(op.name) || "view");
      if (!doc.node(["views"])) doc.set(["views"], {});
      doc.set(["views", id], { title: op.name, things: op.ids });
      if (op.positions && Object.keys(op.positions).length) doc.set(["layout", id], roundAll(op.positions));
      return { message: `View "${op.name}" saved` };
    }

    case "removeStaleLayout":
      return removeStale(doc, model);
  }
}
