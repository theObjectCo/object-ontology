# Phase 3: model editing modules

The editing API remains at `src/core/edit.ts`, shared by the VS Code extension,
standalone web application, and MCP server. Its implementation now lives in
`src/core/editing/`:

| Module | Responsibility |
| --- | --- |
| `contracts.ts` | Operation union, edit results, clipboard and position types, errors |
| `document.ts` | JSON text edits that preserve indentation and unchanged entries |
| `identifiers.ts` | Identifier generation, uniqueness, and validation |
| `references.ts` | Reference paths, renaming, and reference removal |
| `elements.ts` | Create, update, rename, label, delete, and assign schemas |
| `states.ts` | State editing and references to states |
| `links.ts` | Link storage, notes, creation, updates, and removal |
| `layout.ts` | Positions, saved views, zoom views, and stale layout cleanup |
| `subprocesses.ts` | Add, remove, and reorder subprocesses |
| `clipboard.ts` | Copy selection and paste with identifier remapping |
| `stories.ts` | Store stories and synchronize their OPM objects/processes/links |
| `operations.ts` | Exhaustive dispatch by the operation discriminator |

The dispatcher keeps each operation narrowed to its domain's union. Internal
modules import each other directly, without a dependency on the compatibility
facade. All 13 affected TypeScript files are at most 217 lines.

## Validation on 2026-10-26

Base: `4fb75f4` on `main`.

- TypeScript AST comparison: all 43 declarations other than the split dispatcher
  and all 23 operation case clauses preserve their original text, allowing only
  export modifiers and line-ending normalization. Public import paths are retained.
- `npm run typecheck`: both extension and browser TypeScript configurations pass.
- `npm test`: production extension/CLI/MCP/browser builds and all 97 tests pass,
  including JSON formatting, state/reference edits, clipboard behavior, model
  validation, direct MCP handlers, and the stdio transport.
- `node tools/check-examples.mjs`: both example models validate and render;
  committed generated documents match.
- `node test/webapp-browser.mjs`: standalone model/JSON and untrusted cloud
  text/URL browser regression passes.

This change covers `core/edit.ts` in EPIC-26-03. The remaining frontend, host,
and MCP modularization plus `@kit` adoption are separate Phase 3 work.
