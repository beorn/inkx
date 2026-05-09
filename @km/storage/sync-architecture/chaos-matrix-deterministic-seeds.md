---
aliases:
  - km-storage.sync-architecture.chaos-matrix-deterministic-seeds
  - km-storage-sync-architecture-chaos-matrix-deterministic-seeds
created_at: 2026-05-09T00:11:45.910Z
---

# chaos-matrix.fuzz.ts must pin deterministic seeds — currently passes only by lucky-seed #chore #P2

chaos-matrix.fuzz.ts uses createSeededRandom() without args, picking a fresh seed per run. The 6 fuzz tests authored under @km/storage/sync-architecture/reconcile-chaos-matrix passed at the random-seed-of-the-moment when first committed (4b85258be) but fail at most other seeds — the failures expose real reconciler bugs (see sibling bead chaos-matrix-reconciler-stale-state-on-rewrite).

Pin each test's RNG to a deterministic seed and use `test.fails()` for cases whose deterministic outcome is a known reconciler-bug failure (cross-link to the bug bead in a comment) so the suite is deterministic AND green-when-expected:

- Tests that pass at the chosen seed: ordinary `test.fuzz` + deterministic seed.
- Tests that fail at the chosen seed because they hit a reconciler bug: `test.fails` with the chosen seed and a cross-link comment to `@km/storage/sync-architecture/chaos-matrix-reconciler-stale-state-on-rewrite`. When that bug lands and the test starts passing, vitest fails the build — flipping the marker back to ordinary `test.fuzz` is part of closing the reconciler bead.

Acceptance: every test in chaos-matrix.fuzz.ts uses createSeededRandom(<int>); each currently-failing test is annotated `test.fails` with the failing seed and a cross-link to the reconciler bead; `bun vitest run --project fuzz packages/km-storage/tests/sync/chaos/chaos-matrix.fuzz.ts` exits 0 across 10 consecutive runs. Code refs: createSeededRandom() call sites (one per test) and the failures at file:test lines 231 (rename+change matrix) and 335 (wikilink target swaps).
