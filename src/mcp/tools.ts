/** MCP tool registry and invocation API; domain handlers live in tooling/. */
import { CallResult, Json, Tool, ToolError } from "./tooling/contracts";
import Ajv2020 from "ajv/dist/2020";
import { ValidateFunction } from "ajv/dist/2020";
import { modelTools } from "./tooling/modelTools";
import { queryTools } from "./tooling/queryTools";
import { renderTools } from "./tooling/renderTools";
import { creationTools } from "./tooling/creationTools";
import { linkTools } from "./tooling/linkTools";
import { elementTools } from "./tooling/elementTools";
import { storyTools } from "./tooling/storyTools";

export { Tool } from "./tooling/contracts";
export { ToolError } from "./tooling/contracts";
export { OutDiagnostic } from "./tooling/contracts";
export { LinkInfo } from "./tooling/contracts";
export { CallResult } from "./tooling/contracts";
export { summaryLine } from "./tooling/diagnostics";

export const TOOLS: Tool[] = [
  ...modelTools,
  ...queryTools,
  ...renderTools,
  ...creationTools,
  ...linkTools,
  ...elementTools,
  ...storyTools,
];

// ---------------------------------------------------------------- calling a tool

const ajv = new Ajv2020({ allErrors: true, strict: false });

const validators = new Map<string, ValidateFunction>(TOOLS.map((t) => [t.name, ajv.compile(t.inputSchema)]));

/** Checks the arguments against the tool's schema, runs it and turns the value or the refusal into an MCP result. */
export function callTool(name: string, args: Json = {}): CallResult {
  const tool = TOOLS.find((t) => t.name === name);
  const fail = (text: string): CallResult => ({ content: [{ type: "text", text }], isError: true });
  if (!tool) return fail(`Unknown tool "${name}". Tools: ${TOOLS.map((t) => t.name).join(", ")}.`);
  const valid = validators.get(name)!;
  if (!valid(args)) {
    const problems = (valid.errors ?? []).map((e) => `${e.instancePath || "arguments"} ${e.message}${e.params && "additionalProperty" in e.params ? ` (${String(e.params.additionalProperty)})` : ""}`);
    return fail(`Invalid arguments for ${name}: ${problems.join("; ")}.`);
  }
  try {
    const value = tool.handler(args);
    return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
  } catch (e) {
    if (e instanceof ToolError) return fail(e.message);
    return fail(`Internal error in ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
