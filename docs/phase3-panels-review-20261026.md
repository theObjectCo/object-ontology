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

The four derived method views (IDEF0, SIPOC, N² and process flow) also use
`StudioPanel`, with the existing view selector and process/agent controls in its
header and the results in its scrollable body. Method switching previously lost
the selected process when passing through N², which has no process selector.
The state now retains that choice and reuses it when returning to a process view.
The new browser test reproduced the loss before this fix (pricing became
configuring after SIPOC → N² → process flow).

Makigami now uses `StudioPanel` for its story surface and selected-step editor,
and `CanvasToolbar` for adding lanes/steps. Its title editor, story details and
actions are separate focused components. The existing synchronization CTA keeps
its explanatory tooltip; diagram-specific forms and drag behavior remain in the
domain components. Scoped CSS keeps the lane grid scrollable within the host.

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
- `test/methods-browser.mjs` covers all four rendered projections, process selection
  across N², the agents toggle, unchanged model data, English/Polish close actions,
  Escape, shared-panel markup and desktop/tablet bounds. Screenshots under
  `dist/method-shots/` were inspected. This suite also runs in GitHub CI.
- The expanded Makigami browser suite passes with shared-panel markup, the lane
  toolbar toggle, inline input focus, step/wait/problem editing, handovers, title
  save/cancel, criteria, lane creation/reordering/deletion, ghost insertion,
  cross-lane drag, sync to model, read-only state and desktop/tablet bounds.
  The tablet screenshot in `dist/makigami-shots/` was inspected. Existing host
  Escape handling stays outside the shared panel; editable step controls still
  isolate diagram shortcuts.
- Authored files pass `git diff --check`; the verbatim upstream CanvasToolbar
  retains its existing extra blank line at EOF (reported by the full diff check).

This validates the built standalone application. Native VS Code runtime acceptance
and public deployment are separate checks, not claimed by these browser tests.
This change does not complete the entire fleet migration in EPIC-29.
