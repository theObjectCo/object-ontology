# Phase 3: shared cloud client

`src/webapp/cloudDrive.ts` is now a 9-line compatibility facade over the shared
`object-system/code/Applications/object-themes/kit/cloud` implementation. Its
seven modules contain at most 184 lines each, replacing the local 603-line copy.
The snapshot is pinned in `vendor/object-kit/SOURCE.json`; CI checks every hash
and the file inventory. `.gitattributes` preserves upstream LF bytes on Windows.
No private repository access is needed to build or test ontology.

The existing imports, configuration/session storage keys, provider selection,
file operations and local-folder reconnect behavior remain compatible. Successful
saves now publish the kit's `phenome-workspace` message on BroadcastChannel.
This notification is limited to listeners on the same origin.

The shared source also fixes a pre-existing login race: callback messages must
come from the specific login popup, as well as the correct origin. Concurrent
logins in different windows no longer consume one another's responses. The fix
and its regression tests live upstream in commit
`016380486c9140a5c846f01de15a3c99ca350093`.

Validation:

- `node tools/check-object-kit.mjs`: seven upstream files match their hashes.
- `node --test test/cloud-*.test.mjs`: eight contract tests cover storage,
  concurrent popups, local folder list/read/write, OneDrive transport, Google
  create/update/read/list and errors without a success notification.
- `npm run typecheck` and `npm test`: both TS configurations and 97 unit tests.
- `node test/webapp-browser.mjs`: real Chrome host/cloud load, safe text rendering,
  JSON editing/undo/redo, editor messages, persistence and native file save.
- Upstream `phenome-map` build includes two popup regressions and passes TypeScript
  and Vite compilation.

Provider tests use synthetic tokens and mocked HTTP responses; they do not claim
a live Microsoft/Google account login. React host chrome and shared visual
components remain separate Phase 3 work. This change does not deploy a website.
