import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Starts a built server the way a client does and talks to it over stdio; npm test builds dist/ first. */
async function session(args: string[], body: (client: Client) => Promise<void>) {
  const client = new Client({ name: "opm-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args, stderr: "pipe" }));
  try {
    await body(client);
  } finally {
    await client.close();
  }
}

test("node dist/mcp.js lists the tools and answers a call", async () => {
  await session(["dist/mcp.js"], async (client) => {
    assert.equal(client.getServerVersion()?.name, "opm");
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 17 && tools.every((t) => t.name.startsWith("opm_")));
    assert.equal(tools.find((t) => t.name === "opm_get")?.annotations?.readOnlyHint, true);
    const r = await client.callTool({ name: "opm_validate", arguments: { path: path.resolve("examples/window-pricing/model.opm.json") } });
    const out = JSON.parse((r.content as { text: string }[])[0].text);
    assert.equal(out.errors, 0);
    const bad = await client.callTool({ name: "opm_validate", arguments: { path: "model.opm.json" } });
    assert.equal(bad.isError, true);
  });
});

test("opm mcp in the command line starts the same server", async () => {
  await session(["dist/cli.js", "mcp"], async (client) => {
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === "opm_link"));
  });
});
