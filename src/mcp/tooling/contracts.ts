import { Diagnostic } from "../../core/validate";

/**
 * The tools of the MCP server, without the transport: each one is a JSON Schema for its arguments and a handler
 * that reads or edits one model file. Tests call the handlers directly; src/mcp/server.ts exposes them over stdio.
 */

export type Json = Record<string, unknown>;

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  /** Reads only; edits write the file. */
  readOnly: boolean;
  destructive?: boolean;
  /** Returns a value that is sent as JSON, or a string that is sent as it is (markdown, OPL). */
  handler: (args: Json) => unknown;
}

/** A refusal or a bad argument: reported to the agent as a tool error, nothing is written. */
export class ToolError extends Error {}

export interface OutDiagnostic {
  severity: Diagnostic["severity"];
  code: string;
  message: string;
  /** JSON path of the value inside the file, e.g. ["processes", "pricing", "requires", 0]. */
  path: (string | number)[];
  /** The object or process the diagnostic is about. */
  element?: string;
  line: number;
  column: number;
}

// ---------------------------------------------------------------- links in the agent's vocabulary

/** A link as the tools report it: the field it is stored in, the thing that stores it and the thing it points at. */
export interface LinkInfo {
  kind: string;
  owner: string;
  target: string;
  state?: string;
  fromState?: string;
  toState?: string;
  tag?: string;
  note?: string;
}

export interface CallResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}
