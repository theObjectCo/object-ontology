// Stable editing API shared by the extension, web app, and MCP server.
export { Position } from "./editing/contracts";
export { Positions } from "./editing/contracts";
export { Fragment } from "./editing/contracts";
export { Operation } from "./editing/contracts";
export { EditResult } from "./editing/contracts";
export { EditError } from "./editing/contracts";
export { compact } from "./editing/document";
export { idFromLabel } from "./editing/identifiers";
export { uniqueId } from "./editing/identifiers";
export { fragmentOf } from "./editing/clipboard";

import { EditResult, Operation } from "./editing/contracts";
import { Doc } from "./editing/document";
import { run } from "./editing/operations";

export function applyOperation(text: string, op: Operation): EditResult {
  const doc = new Doc(text);
  const model = doc.model;
  const select = run(doc, model, op);
  return { text: doc.text, ...select };
}

/** The smallest replacement that turns one text into another: [start, end, replacement]. */
export function minimalEdit(before: string, after: string): [number, number, string] | undefined {
  if (before === after) return undefined;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length, endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return [start, endBefore, after.slice(start, endAfter)];
}
