# Phase 3: Makigami editor decomposition

The public `Makigami` component and `MakigamiProps` import path remain
`src/webview/makigami.tsx`. The facade composes seven presentation components:
header, step editor, lane headers, grid, step cards, handovers and done criteria.
`useMakigamiEditor` owns editor state and edit operations; `getMakigamiLayout`
computes the shared lane/card/arrow geometry. Props and dimensions have separate
cohesive modules. The twelve source files are each below 300 lines.

The extraction keeps the existing DOM, CSS classes, labels and handlers. Components
receive typed subsets of the shared editor result, have stable identities and add
no DOM wrappers. The state hook owns the textarea ref, so controlled edits keep
focus across renders. The geometry helper is shared by rendering and drag previews.

## Inserted-step selection regression

The original standalone host acknowledged an operation before broadcasting the
updated model (a 20 ms delay). Inserting the fifth step immediately selected
index 4 while the component still saw four steps. Its bounds effect clamped the
selection to index 3, causing editing to target the previous step.

This was reproduced against the original `4fb75f4` Makigami bundle as well as the
initial extraction. The fix waits for both a successful operation acknowledgement
and the model's expected step count before selecting and focusing the new card.
A rejected operation does not schedule selection; changing stories clears the
pending selection. Both acknowledgement/model arrival orders are supported. The subsequent App
integration also changes the standalone host to publish its model before
acknowledging; the hook remains compatible with hosts that acknowledge first.

## Validation

- Structural TypeScript AST comparison of the initial extraction: all seven JSX
  sections (including handlers) and all 54 editor statements preserved. The
  inserted-step fix is a separate, intentional behavior change.
- `npm run typecheck`: both TypeScript configurations pass.
- `npm test`: 97 tests pass.
- `node tools/check-examples.mjs`: both bundled examples pass.
- `node test/webapp-browser.mjs`: standalone host/cloud regression passes.
- `node test/makigami-browser.mjs`: actual built React application in headless
  Chrome, external network blocked. Covers controlled input focus, step text,
  wait/problem edits and lane height, handover state, story title, done criteria,
  lane creation/order/removal, ghost-card insertion and cross-lane drag/reorder.
  The inserted-card selection assertion fails on the pre-fix implementation.
- The Makigami browser regression is included in the GitHub verification workflow.

This completes the Makigami file-size decomposition, not the full frontend epic.
`App.tsx` decomposition and adoption of shared `@kit` components remain separate
work. No deployment or object.pl changes are included.
