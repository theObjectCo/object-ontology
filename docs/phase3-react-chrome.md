# Phase 3: React host chrome and shared Studio header

The browser host now renders its header and live JSON drawer through React.
`WebAppHeader` uses the shared `StudioHeader` component; the vendored component,
Studio stylesheet and theme tokens are exact Git blobs from Object kit revision
`44a3a8b1d5ee6964e479b45694c410b1fb3dbf60`. The snapshot verifier checks all eleven
source files recursively, including unexpected files, and hashes their LF bytes.
The public GitHub build needs no access to the private upstream repository.

The document bridge still owns session, undo and redo state. A small external
store notifies React after document edits, cloud login and settings changes.
The JSON drawer remains mounted when hidden, preserves focused edits, debounces
input and mounts synchronously before a bridge request can reveal a selection.
Global keyboard shortcuts and file drops retain their existing handlers.

The Studio header is in normal flow above the diagram. It wraps its actions on
narrow screens, uses the kit's paper/ink tokens, and follows the persisted light
or dark preference. The diagram fills the remaining height. Native VS Code
webviews retain their existing theme integration.

Validation:

- Typecheck and production build passed; 97 unit and eight cloud tests passed.
- The Chrome host test covers cloud loading and untrusted file labels, JSON
  edits/undo/redo, message ordering, native file save and persisted preferences.
- Additional assertions cover the shared header, reachable actions at 1440 and
  390 pixels, diagram height, theme token loading and JSON drawer state.
- Desktop and narrow viewport screenshots were inspected locally.
- Diagram editing, passive/explicit JSON selection, Makigami interactions and
  both committed examples passed their browser/validation suites. One initial
  editor run stalled during Chrome shutdown and was not counted as a pass; the
  fixture now bounds shutdown and reports failures before cleanup. Its rerun
  completed successfully.

This is one stage of EPIC-29, not completion of the ontology UI migration.
Cloud dialog rendering, toast presentation and the diagram's remaining local UI
components still need migration to shared kit components. No site was deployed.
