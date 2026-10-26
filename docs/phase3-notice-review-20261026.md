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
- Initial Windows attempts intermittently failed at the existing 10-second
  browser-shutdown deadline despite passing application assertions. The original
  main fixture (`4a3c1ca`) reproduced this failure with the same editor test,
  establishing that the problem predates the new worker cleanup. Trace showed
  it had already entered `browser.close()`, not stalled in a worker listener.
- A controlled probe using that baseline fixture but omitting manual page
  closure exited normally in 1.302 seconds. The final fixture therefore delegates
  target/process shutdown to `browser.close()` and removes the manual page and
  worker lifecycle code. It supports `BROWSER_CLOSE_TRACE=1` timing diagnostics.
- All four commands using this fixture then passed sequentially on Windows:
  notice, panels, editor and methods. Measured shutdown times were 7.012, 1.517,
  1.781 and 2.569 seconds; each browser exited normally with code 0. The deadline
  remains 10 seconds and a timeout still fails the command. This is measured
  verification, not a guarantee against every future environment-related timeout.
- Hosted Ubuntu CI passed the complete initial consumer head `8240826`, including
  all six browser commands. The simplified final fixture requires fresh exact-head
  hosted checks and independent review before merging.
- Upstream merge, deployment and public acceptance remain pending.

Merge the upstream kit PR with history preserved before merging this consumer,
so the pinned source revision remains reachable from upstream main.
