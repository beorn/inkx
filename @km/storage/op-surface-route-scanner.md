---
id: "@km/storage/op-surface-route-scanner"
aliases:
  - km-storage.op-surface-route-scanner
  - km-storage-op-surface-route-scanner
created_by: claude:8b5b9e1c
created_at: 2026-04-22T06:45:13Z
closed_at: 2026-04-22T15:00:42Z
close_reason: "Shipped: expandUnexploredDirectory (scanner) + applyChanges
  (loader replay) now route through emitter. Scanner uses emitter.apply with
  source=fs-import so fs-writer skip-filter prevents echo. Loader uses
  emitter.commit with skipPersist+skipBroadcast to avoid re-journaling + avoid
  fs-writer echo during replay. Zero emitter contract changes — EmitOptions
  already supported all the needed flags. Tests: scanner-emits.test.ts +
  loader-replay-skips-persist.test.ts (4 tests). 7167 fast-suite pass. Surfaced
  follow-up: reconcile-origin node_createds arguably should be journaled — left
  as separate question."
---

# [x] Route scanner/lazy-expand bulk inserts through emitter.apply @km/storage #task #P1 @claude:8b5b9e1c

blocks:: [[@km/storage]]

Audit finding G1: packages/@km/storage/src/repo/repo.ts:1359 and loader.ts:1107 bulk-insert nodes directly during cold-start without emitting node_created through emitter.apply. Blocks Phase B. Options: (a) emit node_created per row with skipPersist for loader (which IS the replay), (b) tag both paths as replay/bootstrap and emit a single bootstrap_complete marker. Effort ~1 day per path.