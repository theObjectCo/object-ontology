// The MCP server for OPM models over stdio: node dist/mcp.js
import { serveStdio } from "./mcp/server";

serveStdio().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
