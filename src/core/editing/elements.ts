import { editorLinks } from "../links";
import { Model, humanize, objects, processes } from "../model";
import { EditError, EditResult, Operation } from "./contracts";
import { Doc } from "./document";
import { checkId, groupOf, idFromLabel, takenIds, uniqueId } from "./identifiers";
import { round } from "./layout";
import { removeLinks } from "./links";
import { byPathDesc, referencePaths, removeReference, rename } from "./references";

export function elementOperations(doc: Doc, model: Model, op: Extract<Operation, { op: "addElement" | "updateElement" | "renameId" | "setLabel" | "deleteElements" | "setSchemas" }>): Partial<EditResult> {
  switch (op.op) {

    case "addElement": {
      const group = op.kind === "object" ? "objects" : "processes";
      const label = op.label?.trim() || (op.kind === "object" ? "New Object" : "New Process");
      const id = uniqueId(model, idFromLabel(label));
      if (!doc.node([group])) doc.set([group], {});
      // the label is written only when it differs from the one derived from the identifier
      doc.set([group, id], humanize(id) === label || !op.label ? {} : { label });
      if (op.parentId) {
        if (op.kind !== "process" || !processes(model)[op.parentId]) throw new EditError("Only a process can be added inside a zoomed process.");
        doc.push(["processes", op.parentId, "zoomsInto"], id);
      }
      if (model.views?.[op.viewId]?.things) doc.push(["views", op.viewId, "things"], id);
      if (op.pos && doc.value(["layout", op.viewId])) doc.set(["layout", op.viewId, id], round(op.pos));
      return { select: [id] };
    }

    case "updateElement": {
      const group = objects(model)[op.id] ? "objects" : processes(model)[op.id] ? "processes" : undefined;
      if (!group) throw new EditError(`Unknown element "${op.id}".`);
      for (const [field, v] of Object.entries(op.patch)) {
        if (v === null || v === undefined || v === "" || (field === "role" && v === false) || (Array.isArray(v) && !v.length)) {
          doc.remove([group, op.id, field]);
        } else {
          doc.set([group, op.id, field], field === "role" && v === true ? "module" : v);
        }
      }
      return {};
    }

    case "renameId": {
      if (op.oldId === op.newId) return {};
      checkId(model, op.newId);
      rename(doc, model, op.oldId, op.newId);
      return { select: [op.newId] };
    }

    case "setLabel": {
      const group = groupOf(model, op.id);
      const text = op.label?.trim() || null;
      let id = op.id;
      if (op.deriveId && text) {
        const taken = takenIds(model);
        taken.delete(op.id);
        id = uniqueId(model, idFromLabel(text) || op.id, taken);
        if (id !== op.id) rename(doc, model, op.id, id);
      }
      if (!text || text === humanize(id)) doc.remove([group, id, "label"]);
      else doc.set([group, id, "label"], text);
      return { select: [id] };
    }

    case "deleteElements": {
      const ids = new Set(op.ids);
      const linkIds = new Set(op.links ?? []);
      // links first, by descending index so that paths stay valid
      const links = editorLinks(model).filter((l) => linkIds.has(l.id));
      removeLinks(doc, links);
      let cur = doc.model;
      for (const id of ids) {
        for (const path of referencePaths(cur, id).sort(byPathDesc)) removeReference(doc, path);
        cur = doc.model;
        const group = objects(cur)[id] ? "objects" : processes(cur)[id] ? "processes" : undefined;
        if (group) doc.remove([group, id]);
        for (const [vid, positions] of Object.entries(cur.layout ?? {})) if (id in positions) doc.remove(["layout", vid, id]);
        if (cur.layout?.[id]) doc.remove(["layout", id]);
        cur = doc.model;
      }
      return { select: [] };
    }

    case "setSchemas":
      for (const [id, schema] of Object.entries(op.schemas)) {
        if (!objects(model)[id]) throw new EditError(`Unknown object "${id}".`);
        doc.set(["objects", id, "schema"], schema);
      }
      return {};
  }
}
