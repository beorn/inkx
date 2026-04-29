---
id: "@km/silvery/use-ag-node-signals"
aliases:
  - km-silvery.use-ag-node-signals
  - km-silvery-use-ag-node-signals
created_by: claude:cc081a9a
created_at: 2026-04-27T00:09:45Z
closed_at: 2026-04-27T04:36:13Z
close_reason: silvery 354da34a / km 1157841bc. Tests had wrong expectations from
  creation (commit 953afc44, never passed) — useAgNode reads parent NodeContext
  correctly, but tests assumed function components own AgNodes. Fixed to invoke
  Inspector inside the Box instead of returning it. 6/6 pass.
---

# [x] [bug] vendor/silvery use-ag-node — 3 unrelated layout/signal bugs (lines 16, 69, 171) @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

Discovered during @km/silvery/editcontext-export work. The 3 failing use-ag-node tests are NOT export-related — they're layout/signal regressions:

- vendor/silvery/tests/features/use-ag-node.test.tsx:16 — useAgNode > returns null outside component tree (got non-null)
- vendor/silvery/tests/features/use-ag-node.test.tsx:69 — useAgNode > signals update after layout changes (expected 40 to be 10)
- vendor/silvery/tests/features/use-ag-node.test.tsx:171 — useAgNode > screenRect signal returns screen-space position (expected 0 to be 3)

Distinct from the export fix in silvery dfa27c08 (click-to-position now 26/26). useAgNode hook in vendor/silvery/packages/ag-react/src/hooks/.

/complete: bun vitest run --project vendor vendor/silvery/tests/features/use-ag-node.test.tsx → 0 failures.