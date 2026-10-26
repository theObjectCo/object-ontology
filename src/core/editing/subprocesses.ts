import { Model, processes } from "../model";
import { EditError, EditResult, Operation } from "./contracts";
import { Doc } from "./document";

export function subprocessOperations(doc: Doc, model: Model, op: Extract<Operation, { op: "reorderSubprocess" | "addSubprocess" | "removeSubprocess" }>): Partial<EditResult> {
  switch (op.op) {

    case "reorderSubprocess": {
      const subs = [...(processes(model)[op.parent]?.zoomsInto ?? [])];
      const i = subs.indexOf(op.id);
      if (i < 0) throw new EditError(`${op.id} is not a subprocess of ${op.parent}.`);
      subs.splice(i, 1);
      subs.splice(Math.max(0, Math.min(op.index, subs.length)), 0, op.id);
      doc.set(["processes", op.parent, "zoomsInto"], subs);
      return {};
    }

    case "addSubprocess": {
      const procs = processes(model);
      if (!procs[op.parent]) throw new EditError(`Unknown process "${op.parent}".`);
      if (!procs[op.id]) throw new EditError(`Unknown process "${op.id}".`);
      if (op.parent === op.id) throw new EditError("A process cannot zoom into itself.");
      const subs = procs[op.parent].zoomsInto ?? [];
      if (subs.includes(op.id)) throw new EditError(`${op.id} is already a subprocess of ${op.parent}.`);
      const owner = Object.entries(procs).find(([, p]) => (p.zoomsInto ?? []).includes(op.id));
      if (owner) throw new EditError(`${op.id} is already a subprocess of ${owner[0]}; a subprocess has one parent.`);
      if (op.index === undefined || op.index >= subs.length) doc.push(["processes", op.parent, "zoomsInto"], op.id);
      else doc.set(["processes", op.parent, "zoomsInto"], [...subs.slice(0, Math.max(0, op.index)), op.id, ...subs.slice(Math.max(0, op.index))]);
      return {};
    }

    case "removeSubprocess": {
      const subs = processes(model)[op.parent]?.zoomsInto ?? [];
      const i = subs.indexOf(op.id);
      if (i < 0) throw new EditError(`${op.id} is not a subprocess of ${op.parent}.`);
      doc.remove(["processes", op.parent, "zoomsInto", i]);
      return {};
    }
  }
}
