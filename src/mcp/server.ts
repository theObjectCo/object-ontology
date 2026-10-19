import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import pkg from "../../package.json";
import { TOOLS, callTool } from "./tools";

const INSTRUCTIONS = `Tools for OPM (Object-Process Methodology, ISO 19450) models stored as *.opm.json files.
Find models with opm_list_models, read the outline with opm_summary and one thing with its links with opm_get.
Change a model only through the edit tools (opm_add_object, opm_add_process, opm_link, opm_unlink, opm_rename, opm_set, opm_delete, opm_add_story, opm_set_story), never by writing the JSON yourself: each edit is a minimal text change that keeps the formatting, and each returns the diagnostics after the edit with the ones it introduced, so check "introduced" after every call.
Every tool takes the absolute path of the model file.`;

/** The MCP server with every tool of src/mcp/tools.ts; no resources, no prompts. */
export function createServer(): Server {
  const server = new Server({ name: "opm", title: "OPM models", version: pkg.version }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object" },
      annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: t.destructive ?? false, idempotentHint: t.readOnly, openWorldHint: false },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(request.params.name, request.params.arguments ?? {}));
  return server;
}

/** Serves the tools over stdin and stdout until the client closes the connection. */
export async function serveStdio(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}
