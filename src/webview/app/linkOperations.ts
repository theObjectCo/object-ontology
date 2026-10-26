import { Operation } from "../../core/edit";
import { allowedKinds, EditorLinkKind, STATEFUL, thingKind } from "../../core/links";
import { Model, objects } from "../../core/model";
import { MenuState } from "./contracts";

/** Link kinds for a drawn pair, with the states that the kinds can keep. */
export function linkChoices(model: Model, from: string, to: string, fromState?: string, toState?: string) {
  const all = allowedKinds(model, from, to);
  let kinds = all.filter((k) => (!fromState || STATEFUL[k].from) && (!toState || STATEFUL[k].to));
  if (!kinds.length) {
    // no kind of this pair uses states (e.g. structure between objects): the states are dropped
    kinds = all;
    fromState = toState = undefined;
  }
  let effectTargets: string[] | undefined;
  if (fromState && kinds.includes("effect") && thingKind(model, from) === "object") {
    effectTargets = (objects(model)[from].states ?? []).filter((s) => s !== fromState);
    if (!effectTargets.length) kinds = kinds.filter((k) => k !== "effect");
  }
  return { kinds, fromState, toState, effectTargets };
}

/** The addLink operation for a kind picked from the menu; an effect is always stored from the object's side. */
export function linkOperation(model: Model, m: MenuState, kind: EditorLinkKind, target?: string): Operation {
  if (kind === "effect") {
    const fromObject = thingKind(model, m.from) === "object";
    return fromObject
      ? { op: "addLink", kind, from: m.from, to: m.to, fromState: m.fromState, toState: target }
      : { op: "addLink", kind, from: m.to, to: m.from, toState: m.toState };
  }
  return {
    op: "addLink", kind, from: m.from, to: m.to,
    fromState: STATEFUL[kind].from ? m.fromState : undefined,
    toState: STATEFUL[kind].to ? m.toState : undefined,
  };
}
