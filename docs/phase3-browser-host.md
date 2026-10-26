# Phase 3: standalone browser host

`src/webapp/host.ts` is now the bootstrap entry point. It installs the browser
`acquireVsCodeApi` bridge before `webview.js` executes and retains the OAuth
callback and DOM-ready initialization order.

The implementation under `src/webapp/host/` separates presets, session persistence,
document operations/history, downloads, native file handling, exports, editor
messages, chrome rendering, cloud markup, cloud file loading, cloud controls, and
chrome event registration. There are 14 host files, at most 165 lines each, with
no internal import cycles.

Document version and native file handle live in one explicit shared runtime
object; controllers retain the same session and history arrays. Cloud list
loading closes the existing modal through a presentation helper, avoiding a
dependency back from the file list into the modal controller. Provider logic in
`cloudDrive.ts` is unchanged; migration to `@kit/cloud` remains separate work.

## Validation on 2026-10-26

Base: `4fb75f4` on `main`, independent of the core-editing and MCP refactors.

- TypeScript AST comparison verifies 37 declarations, bridge installation, and
  the cloud markup. Only explicit runtime-field access, markup extraction, and
  close-modal delegation are normalized in the comparison.
- `npm run typecheck`: both TypeScript configurations pass.
- `npm test`: production builds and all 97 tests pass, without failures/skips.
- `node tools/check-examples.mjs`: both examples validate and render with matching
  committed generated documentation.
- Expanded `node test/webapp-browser.mjs` passes against the built application:
  untrusted cloud labels/URLs remain safe; cloud load closes the modal and updates
  the document; JSON edits, invalid JSON, undo/redo, editor operation results and
  increasing model versions work; document/language/theme survive reload; a native
  file handle selected by Open is used by Save. No browser runtime errors occurred.

The cloud HTTP responses and native file handle are controlled test fixtures;
the test does not log in to live providers or write a user file. It exercises the
real built host and editor in Chrome.

Hosted CI and independent review remain merge prerequisites. React/`@kit`
adoption, `App.tsx`, and `makigami.tsx` remain part of the larger Phase 3 scope.
