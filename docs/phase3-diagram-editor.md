# Phase 3: diagram editor decomposition

`src/webview/App.tsx` is now a 231-line rendering facade. Its public `App` export
and React Flow provider boundary are unchanged. Nineteen focused modules under
`src/webview/app/` cover state, host messages, layout/view selection, node and edge
presentation, viewport synchronization, React Flow events, editing actions,
keyboard/clipboard routing, inspector/OPL presentation, stories and context menus.
Shared contracts, link operations, rectangle calculations and two leaf controls
are separate modules. All twenty source files are below 300 lines (maximum 231).

`useDiagramEditor` composes the responsibilities in a fixed order. Each hook takes
only a typed subset of its upstream outputs. Mutable refs stay in the owning App
instance; callbacks and effects retain their original dependency arrays. Runtime
imports are acyclic. Story derivation runs before keyboard setup to make the
previously forward-captured `story` value an explicit input; effect ordering is
unchanged. The complete JSX and event handlers remain structurally equivalent.

## Standalone JSON focus correction

The browser acceptance test exposed an existing host protocol bug. Diagram
selection sends `revealInText` with `open: false`, but the standalone bridge ignored
that flag and always opened and focused the JSON editor. Subsequent diagram
shortcuts therefore went into a textarea.

The bridge now forwards `open`, and the JSON view distinguishes passive reveal
from an explicit request. Passive selection does not open a closed pane and can
scroll an already-open pane without taking focus. Explicit "Show in JSON" still
opens/focuses the editor and selects the requested identifier.

## Validation

- Structural TypeScript AST comparison against `5115e76`: all 141 editor
  statements, all top-level helpers and the entire App return JSX are preserved
  by the extraction. The host focus correction is a separate commit.
- Both TypeScript configurations pass; 97 unit tests pass after extraction.
- Existing standalone host/cloud and Makigami browser regressions pass.
- New `test/editor-browser.mjs` runs the actual built standalone React editor in
  Chrome with external requests blocked. It covers keyboard object/process
  creation, derived IDs, inspector rename, state creation, clipboard copy/paste,
  cut/undo, process zoom/subprocess creation, context commands, selection
  shortcuts, frozen editing after a parse error and passive/explicit JSON reveal.
- The new regression is included in the GitHub verification workflow.

The five named ontology monoliths are now decomposed on this branch. Shared `@kit`
adoption, cloud integration and broader fleet migration remain Phase 3 work. No
website deployment is included.
