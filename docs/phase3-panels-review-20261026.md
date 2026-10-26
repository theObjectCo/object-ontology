# Phase 3: editor panels and shared Studio controls

`src/webview/panels.tsx` previously combined 702 lines of inspector fields,
menus, toolbar, OPL and notifications. It now preserves its public exports as a
facade over focused modules in `src/webview/panels/` (22 files, maximum 105 lines).
The bodies of 17 extracted leaf components are unchanged.

The inspector uses the shared `StudioPanel` for object, link and multi-selection
views. Its body scrolls within the available host height. Diagram shortcuts stay
outside editable inspector controls. Creation buttons use `CanvasToolbar`, with
native disabled states when the model cannot be edited. Breadcrumbs and the
existing story/layout menus retain their behavior.

The kit snapshot is pinned to object-system commit
`2da18d9020595a56d7643deb77b067af5c52d036`. The previous 12 files are byte-identical
at that revision; only `CanvasToolbar.tsx` is added. All 13 hashes pass verification.
The shared widgets use a scoped adapter to inherit VS Code theme colors; the
standalone host retains its existing shared theme/header integration.

Validation:

- TypeScript and production build pass; 97 unit tests pass.
- Existing editor, Makigami and webapp/cloud Chromium scenarios pass.
- New `test/panels-browser.mjs` passes: toolbar creation/disabled states, persisted
  Markdown notes, classification, deployment field, close action and inspector
  bounds at 1500×1000 and 900×700. Included in GitHub CI.
- Desktop/tablet screenshots inspected under `dist/panel-shots/` (local artifacts).
- Authored files pass `git diff --check`; the verbatim upstream CanvasToolbar
  retains its existing extra blank line at EOF (reported by the full diff check).

This validates the built standalone application. Native VS Code runtime acceptance
and public deployment are separate checks, not claimed by these browser tests.
This change does not complete the entire fleet migration in EPIC-29.
