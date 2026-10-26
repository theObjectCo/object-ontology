# Phase 3: MCP tool modules

`src/mcp/tools.ts` remains the public registry and invocation API. The 18 tool
definitions now live in focused modules under `src/mcp/tooling/`, grouped by
model discovery/validation, querying, rendering, creation, links, element edits,
and stories. Tool order, names, argument schemas, annotations, descriptions,
examples, handlers, and error responses are preserved.

Shared modules own contracts, diagnostics, model-file loading, argument checks,
link metadata, validated edit sessions, model projections, and schema expansion.
The story format guard stays with the story tools. The registry still compiles
all AJV validators once and exposes the same `TOOLS`, `callTool`, `summaryLine`,
error class, and public types through the original import path.

All 16 affected TypeScript files are at most 169 lines. This addresses
`mcp/tools.ts` in Phase 3 EPIC-26-03; the frontend and web host remain separate work.

## Validation on 2026-10-26

Base: `4fb75f4` on `main`; independent of the core-editing refactor in PR #3.

- TypeScript AST comparison confirms all 51 declarations outside the reorganized
  registry and all 18 tool object definitions retain their exact text, excluding
  export modifiers and line-ending normalization. The registry preserves order.
- `npm run typecheck`: extension and browser configurations pass.
- `npm test`: production extension/CLI/MCP/browser builds and all 97 tests pass,
  with no failures or skips. Existing tests cover MCP discovery, diagnostics,
  all edit families, schema rejection without writes, round trips, and stdio.
- `node tools/check-examples.mjs`: both example models validate and render;
  committed generated output matches.

Hosted CI and independent review are required before merge.
