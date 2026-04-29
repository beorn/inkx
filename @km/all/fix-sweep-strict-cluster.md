---
id: "@km/all/fix-sweep-strict-cluster"
aliases:
  - km-all.fix-sweep-strict-cluster
  - km-all-fix-sweep-strict-cluster
created_by: claude:cc081a9a
created_at: 2026-04-26T20:55:40Z
closed_at: 2026-04-26T22:43:15Z
close_reason: Closed
---

# [x] SILVERY_STRICT incremental-render mismatch cluster (~4 km-tui slow tests) @km/all #bug #P1 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

Cluster of slow-test failures sharing a root cause pattern: SILVERY_STRICT detects incremental != fresh render on certain transitions.

## Failing tests
- apps/@km/tui/tests/production-entry.slow.spec.ts:626 — perf: keypress latency w/ MISMATCH at (68,23) on render #4 (3 retries)
- apps/@km/tui/tests/production-entry.slow.spec.ts:732 — td chord date dialog
- apps/@km/tui/tests/board-zoom.slow.spec.ts:1267 — zoom-mismatch: cursor down causes incremental mismatch
- apps/@km/tui/tests/board-zoom.slow.spec.ts:1626 — selection bg stays within selected card bounds after zoom out at 200 cols
- apps/@km/tui/tests/column-top-disappears-realvault.slow.test.tsx:70 — REAL VAULT 200×120 — ▼N blank gap above (~30 rows)

## Repro
bun vitest run --project=slow apps/@km/tui/tests/production-entry.slow.spec.ts apps/@km/tui/tests/board-zoom.slow.spec.ts apps/@km/tui/tests/column-top-disappears-realvault.slow.test.tsx 2>&1 | tail -50

## Likely root causes
- Silvery pipeline incremental render bug (paint cells not invalidated correctly)
- Or: tests stale vs current rendering behavior (like card-borders was)

## Acceptance
- All 5 tests pass (or remaining failures documented with separate root causes + beads)
- Use silvery agent + worktree if real pipeline work needed

This is the highest-impact remaining cluster from @km/all/fix-sweep-0426.