# Shared StudioNotice integration

The editor now renders operation feedback through the shared `StudioNotice`
component instead of a local Toast implementation. Ontology retains placement
and its existing success/error dismissal timers; the shared component owns the
surface, wrapping and status semantics. VS Code tokens supply its colors.

## Source provenance

All 15 vendored files are pinned to object-system commit
`cd9840d173cbdf229ebd778c1156936e8ea9e933` and verified by
`node tools/check-object-kit.mjs`. The previous 13 files are unchanged blobs;
only StudioNotice and its props are new. Upstream PR:
https://git.infra.object.pl/Object/object-system/pulls/6

## Validation and limits

- Typecheck and production build passed locally.
- Compiled unit tests: 97 passed, zero failed or skipped.
- The new browser test exercises the built standalone editor, injects failure
  and success responses at its host-message boundary, and checks escaped text,
  the VS Code error token, status attributes, wrapping at two widths and the
  existing dismissal behavior. It does not prove native VS Code operation
  handling or screen-reader announcements.
- With the final fixture, notice and panel browser commands exited successfully.
  Editor assertions passed, but its command failed at the existing 10-second
  browser-shutdown deadline. Earlier attempts also showed intermittent shutdown
  timeouts in the other browser commands. This is not a fully green browser run.
- The fixture explicitly waits for its page workers to stop before closing
  pages, and supports `BROWSER_CLOSE_TRACE=1` timing diagnostics. The final
  shutdown deadline remains 10 seconds; a timeout still fails the command.
  A temporary 30-second diagnostic probe completed quickly and did not establish
  that a longer deadline would solve the intermittent issue.
- Hosted CI, upstream merge, deployment and public acceptance remain pending.

The PR must remain unmerged until the browser shutdown failure is resolved or
isolated with sufficient evidence, and hosted checks validate the exact head.
