import { editorLinks, stateOwner } from "../links";
import { Model, objects, refObject } from "../model";
import { EditError, EditResult, JsonPath, Operation } from "./contracts";
import { Doc } from "./document";
import { removeLinks, withNote } from "./links";
import { byPathDesc } from "./references";

export function stateOperations(doc: Doc, model: Model, op: Extract<Operation, { op: "addState" | "renameState" | "deleteState" | "moveState" }>): Partial<EditResult> {
  switch (op.op) {

    case "addState": {
      const o = objects(model)[op.object];
      if (!o) throw new EditError(`Unknown object "${op.object}".`);
      const states = o.states ?? [];
      let s = op.state ?? "state";
      if (!op.state) for (let i = 2; states.includes(s); i++) s = `state${i}`;
      if (states.includes(s)) throw new EditError(`${op.object} already has state "${s}".`);
      doc.push(["objects", op.object, "states"], s);
      return {};
    }

    case "renameState": {
      const o = objects(model)[op.object];
      const i = o?.states?.indexOf(op.oldState) ?? -1;
      if (i < 0) throw new EditError(`${op.object} has no state "${op.oldState}".`);
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(op.newState)) throw new EditError(`"${op.newState}" is not a valid state name.`);
      if (o.states!.includes(op.newState)) throw new EditError(`${op.object} already has state "${op.newState}".`);
      for (const path of statePaths(model, op.object, op.oldState)) doc.replaceString(path, op.newState);
      for (const [sid, s] of Object.entries(model.stories ?? {})) {
        (s.steps ?? []).forEach((st, k) => {
          if (st.handsOver?.object === op.object && st.handsOver.state === op.oldState) doc.replaceString(["stories", sid, "steps", k, "handsOver", "state"], op.newState);
        });
      }
      doc.replaceString(["objects", op.object, "states", i], op.newState);
      return {};
    }

    case "deleteState": {
      const o = objects(model)[op.object];
      const i = o?.states?.indexOf(op.state) ?? -1;
      if (i < 0) throw new EditError(`${op.object} has no state "${op.state}".`);
      clearState(doc, model, op.object, op.state);
      const states = doc.model.objects![op.object].states!.filter((s) => s !== op.state);
      if (states.length) doc.set(["objects", op.object, "states"], states);
      else doc.remove(["objects", op.object, "states"]);
      return {};
    }

    case "moveState": {
      const states = [...(objects(model)[op.object]?.states ?? [])];
      const i = states.indexOf(op.state);
      if (i < 0) throw new EditError(`${op.object} has no state "${op.state}".`);
      states.splice(i, 1);
      states.splice(Math.max(0, Math.min(op.index, states.length)), 0, op.state);
      doc.set(["objects", op.object, "states"], states);
      return {};
    }
  }
}

/** Paths of state names that refer to a state of an object. */
export function statePaths(model: Model, object: string, state: string): JsonPath[] {
  const out: JsonPath[] = [];
  for (const l of editorLinks(model)) {
    if (stateOwner(l) !== object) continue;
    const field = l.path[2];
    if (field === "changes") {
      if (l.fromState === state) out.push([...l.path, "from"]);
      if (l.toState === state) out.push([...l.path, "to"]);
    } else if ((l.fromState ?? l.toState) === state) out.push([...l.path, "state"]);
  }
  return out;
}

/** Removes a state from the links that name it: the link stays, without the state. */
export function clearState(doc: Doc, model: Model, object: string, state: string) {
  const links = editorLinks(model).filter((l) => stateOwner(l) === object && (l.fromState === state || l.toState === state));
  for (const l of [...links].sort((a, b) => byPathDesc(a.path, b.path))) {
    const field = l.path[2];
    if (field === "changes") {
      if (l.toState === state) {
        // a change without a target state becomes a plain effect
        removeLinks(doc, [l]);
        const cur = doc.model;
        const affects: JsonPath = ["processes", l.to, "affects"];
        if (!(cur.processes?.[l.to]?.affects ?? []).some((r) => refObject(r) === object)) doc.push(affects, withNote(affects, object, l.note));
      } else doc.remove([...l.path, "from"]);
    } else if (field === "conditions" || field === "events") doc.remove([...l.path, "state"]);
    else {
      const { state: _state, ...rest } = doc.value(l.path) as Record<string, unknown>;
      doc.set(l.path, withNote(l.path, rest, l.note));
    }
  }
}
