import { EditorLinkKind } from "../links";
import { ObjectDef, ProcessDef, StoryDef } from "../model";

export type Position = [number, number];

export type Positions = Record<string, Position>;

export type JsonPath = (string | number)[];

export interface Fragment {
  objects?: Record<string, ObjectDef>;
  processes?: Record<string, ProcessDef>;
  positions?: Positions;
}

export type Operation =
  | { op: "addElement"; kind: "object" | "process"; viewId: string; label?: string; pos?: Position; parentId?: string }
  | { op: "addState"; object: string; state?: string }
  | { op: "updateElement"; id: string; patch: Record<string, unknown> }
  | { op: "renameId"; oldId: string; newId: string }
  /** Sets the label; with deriveId the identifier follows the label, as for an element that was just created. */
  | { op: "setLabel"; id: string; label: string | null; deriveId?: boolean }
  | { op: "renameState"; object: string; oldState: string; newState: string }
  | { op: "deleteState"; object: string; state: string }
  | { op: "moveState"; object: string; state: string; index: number }
  | { op: "deleteElements"; ids: string[]; links?: string[] }
  | { op: "addLink"; kind: EditorLinkKind; from: string; to: string; fromState?: string; toState?: string; tag?: string; note?: string }
  | { op: "updateLink"; id: string; kind?: EditorLinkKind; fromState?: string | null; toState?: string | null; tag?: string; reverse?: boolean; note?: string | null }
  | { op: "moveElements"; viewId: string; positions: Positions; all?: Positions }
  | { op: "setLayout"; viewId: string; positions: Positions | null }
  | { op: "reorderSubprocess"; parent: string; id: string; index: number }
  | { op: "openZoom"; process: string }
  | { op: "saveView"; name: string; ids: string[]; positions?: Positions }
  | { op: "paste"; fragment: Fragment; viewId: string; offset?: Position; parentId?: string }
  | { op: "removeStaleLayout" }
  /** Sets the "schema" field of several objects in one edit. */
  | { op: "setSchemas"; schemas: Record<string, string> }
  /** Puts an existing process into the zoomsInto list of another one, at an index or at the end. */
  | { op: "addSubprocess"; parent: string; id: string; index?: number }
  /** Takes a process out of the zoomsInto list of its parent; the process itself stays. */
  | { op: "removeSubprocess"; parent: string; id: string }
  /** Writes a whole user story under its key, or removes it with null. */
  | { op: "setStory"; id: string; story: StoryDef | null }
  /** Materializes and wires OPM objects, states, processes and links from a Makigami story. */
  | { op: "syncStory"; id: string };

export interface EditResult {
  text: string;
  /** Things to select after the edit, e.g. a new element. */
  select?: string[];
  message?: string;
}

export class EditError extends Error {}
