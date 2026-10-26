import { Model, ProcessDef, essence, objects, processes, refIds, refObject } from "../model";
import { handOverTarget, takesPart, usesObject } from "../stories";
import { EditError, EditResult, Operation } from "./contracts";
import { Doc } from "./document";
import { ID, idFromLabel, uniqueId } from "./identifiers";

export function storyOperations(doc: Doc, model: Model, op: Extract<Operation, { op: "setStory" | "syncStory" }>): Partial<EditResult> {
  switch (op.op) {

    case "setStory": {
      if (!ID.test(op.id)) throw new EditError(`"${op.id}" is not a valid story key: use camelCase starting with a lowercase letter.`);
      if (op.story === null) {
        if (!model.stories?.[op.id]) throw new EditError(`Unknown story "${op.id}".`);
        doc.remove(["stories", op.id]);
        if (doc.model.stories && !Object.keys(doc.model.stories).length) doc.remove(["stories"]);
        return {};
      }
      if (!doc.node(["stories"])) doc.set(["stories"], {});
      doc.set(["stories", op.id], op.story);
      return {};
    }

    case "syncStory":
      return syncStoryToModel(doc, op.id);
  }
}

export const PERSON_PATTERNS = /^(?:user|customer|client|operator|staff|clerk|author|designer|manager|person|partner|buyer|seller|worker|consultant|engineer|salesperson|admin|administrator)$/i;

/** Materializes lanes, handed-over objects/states, step processes and OPM links from a Makigami story. */
export function syncStoryToModel(doc: Doc, storyId: string): Partial<EditResult> {
  const story = doc.model.stories?.[storyId];
  if (!story) throw new EditError(`Unknown story "${storyId}".`);
  if (!doc.node(["objects"])) doc.set(["objects"], {});
  if (!doc.node(["processes"])) doc.set(["processes"], {});

  let createdObjects = 0;
  let createdProcesses = 0;
  let createdLinks = 0;

  // 1. Ensure all lanes exist as modules or physical agents
  for (const lane of story.lanes ?? []) {
    if (!ID.test(lane)) continue;
    const cur = doc.model;
    const existing = objects(cur)[lane];
    if (!existing) {
      const isPerson = PERSON_PATTERNS.test(lane);
      doc.set(["objects", lane], isPerson ? { essence: "physical" } : { role: "module" });
      createdObjects++;
    } else if (existing.role !== "module" && essence(existing) !== "physical") {
      doc.set(["objects", lane, "role"], "module");
    }
  }

  // 2. Ensure all handed-over objects and their states exist (schema requires minItems: 2 when states are present)
  const statesByObj = new Map<string, string[]>();
  for (const st of story.steps ?? []) {
    const h = st.handsOver;
    if (!h || !ID.test(h.object)) continue;
    if (!statesByObj.has(h.object)) {
      statesByObj.set(h.object, [...(objects(doc.model)[h.object]?.states ?? [])]);
    }
    if (h.state && /^[A-Za-z][A-Za-z0-9_-]*$/.test(h.state)) {
      const list = statesByObj.get(h.object)!;
      if (!list.includes(h.state)) list.push(h.state);
    }
  }
  for (const [oid, states] of statesByObj) {
    if (!objects(doc.model)[oid]) {
      doc.set(["objects", oid], {});
      createdObjects++;
    }
    if (states.length === 1) {
      const extra = states[0] === "initial" ? "updated" : "initial";
      states.unshift(extra);
    }
    const currentStates = objects(doc.model)[oid]?.states ?? [];
    if (states.length >= 2 && JSON.stringify(states) !== JSON.stringify(currentStates)) {
      doc.set(["objects", oid, "states"], states);
    }
  }

  const isTransformed = (p: ProcessDef, oid: string) =>
    (p.consumes ?? []).some((r) => refObject(r) === oid) ||
    (p.yields ?? []).some((r) => refObject(r) === oid) ||
    refIds(p.affects).includes(oid) ||
    (p.changes ?? []).some((c) => c.object === oid);

  const isEnabler = (p: ProcessDef, oid: string) =>
    (p.requires ?? []).some((r) => refObject(r) === oid) ||
    refIds(p.handledBy).includes(oid);

  const hasAnyTransformation = (p: ProcessDef) =>
    Boolean((p.consumes?.length ?? 0) + (p.yields?.length ?? 0) + (p.affects?.length ?? 0) + (p.changes?.length ?? 0) + (p.zoomsInto?.length ?? 0));

  // 3. Ensure every step has a process, link the lane as enabler, and wire hand-over outputs
  const lastState = new Map<string, string>();
  const steps = story.steps ?? [];
  for (let k = 0; k < steps.length; k++) {
    const st = steps[k];
    let pid = st.process;
    if (!pid || !ID.test(pid) || objects(doc.model)[pid]) {
      const base = idFromLabel(st.does) || `${st.lane}Step${k + 1}`;
      pid = processes(doc.model)[base] ? base : uniqueId(doc.model, base);
      doc.set(["stories", storyId, "steps", k, "process"], pid);
    }
    if (!processes(doc.model)[pid]) {
      doc.set(["processes", pid], {});
      createdProcesses++;
    }

    // Link lane -> process (handledBy for agent, requires for module)
    const cur = doc.model;
    const laneObj = objects(cur)[st.lane];
    const procDef = processes(cur)[pid];
    if (laneObj && procDef && !takesPart(cur, st.lane, pid) && !isTransformed(procDef, st.lane)) {
      if (laneObj.role === "module") {
        doc.push(["processes", pid, "requires"], st.lane);
        createdLinks++;
      } else if (essence(laneObj) === "physical") {
        doc.push(["processes", pid, "handledBy"], st.lane);
        createdLinks++;
      }
    }

    // Wire handed-over object on the producing step's process
    const h = st.handsOver;
    if (h && objects(doc.model)[h.object]) {
      const mNow = doc.model;
      const pNow = processes(mNow)[pid];
      const prevState = lastState.get(h.object);
      if (pNow && !usesObject(mNow, pid, h.object) && !isEnabler(pNow, h.object)) {
        if (h.state && prevState && prevState !== h.state) {
          doc.push(["processes", pid, "changes"], { object: h.object, from: prevState, to: h.state });
          createdLinks++;
        } else {
          doc.push(["processes", pid, "yields"], h.state ? { object: h.object, state: h.state } : h.object);
          createdLinks++;
        }
      }
      if (h.state) lastState.set(h.object, h.state);
    }
  }

  // 4. Wire receiving steps and ensure every step process satisfies OPM's transformation rule
  const updatedStory = doc.model.stories![storyId];
  for (let k = 0; k < (updatedStory.steps ?? []).length; k++) {
    const st = updatedStory.steps[k];
    const h = st.handsOver;
    if (!h || !objects(doc.model)[h.object]) continue;
    const target = handOverTarget(updatedStory, k);
    if (target?.step === undefined) continue;
    const recvStep = updatedStory.steps[target.step];
    const recvPid = recvStep?.process;
    if (!recvPid || !processes(doc.model)[recvPid]) continue;
    const mNow = doc.model;
    const pRecv = processes(mNow)[recvPid];
    if (!usesObject(mNow, recvPid, h.object)) {
      // If the receiving process does not transform anything yet and has no handOver of its own, let it affect the received object
      if (!hasAnyTransformation(pRecv) && !recvStep.handsOver && objects(mNow)[h.object]?.role !== "module" && !isEnabler(pRecv, h.object)) {
        doc.push(["processes", recvPid, "affects"], h.object);
        createdLinks++;
      } else if (!isTransformed(pRecv, h.object)) {
        doc.push(["processes", recvPid, "requires"], h.state ? { object: h.object, state: h.state } : h.object);
        createdLinks++;
      }
    }
  }

  // 5. Fallback for any step process that still has no transformation (e.g. a step without hand-overs)
  const fallbackObj = [...statesByObj.keys()][0];
  for (const st of doc.model.stories![storyId].steps ?? []) {
    const pid = st.process;
    if (!pid) continue;
    const mNow = doc.model;
    const pNow = processes(mNow)[pid];
    if (!pNow || hasAnyTransformation(pNow)) continue;
    const targetObj = st.handsOver?.object ?? fallbackObj;
    if (targetObj && objects(mNow)[targetObj] && objects(mNow)[targetObj].role !== "module") {
      if (isEnabler(pNow, targetObj)) {
        // Replace requires entry with affects so the process transforms at least one object
        const reqs = (pNow.requires ?? []).filter((r) => refObject(r) !== targetObj);
        if (reqs.length) doc.set(["processes", pid, "requires"], reqs);
        else doc.remove(["processes", pid, "requires"]);
      }
      doc.push(["processes", pid, "affects"], targetObj);
      createdLinks++;
    }
  }

  return {
    message: `Synced story "${storyId}": +${createdObjects} object(s), +${createdProcesses} process(es), +${createdLinks} link(s).`,
  };
}
