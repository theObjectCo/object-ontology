# Shared Object kit sources

This is the cloud subset of `object-system/code/Applications/object-themes/kit`.
`SOURCE.json` pins the upstream revision and SHA-256 of every copied file.
Files are copied verbatim from Git blobs, without local adaptations. GitHub CI
and application builds use this snapshot and need no private repository access.

`src/webapp/cloudDrive.ts` preserves the existing application import surface.
Configuration and session storage keys remain compatible with previous versions.
Saving also emits the kit's `phenome-workspace` BroadcastChannel notification;
this reaches listeners on the same origin, not other application domains.

To update, copy the selected cloud files from a reviewed upstream commit and
update the revision and SHA-256 map together. Run `node tools/check-object-kit.mjs`,
the cloud contract tests, typecheck and the webapp browser test. Fix reusable
behavior upstream first; do not maintain a second implementation here.
