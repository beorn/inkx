---
aliases:
  - km-storage.sync-architecture.chaos-matrix-deterministic-seeds
  - km-storage-sync-architecture-chaos-matrix-deterministic-seeds
created_at: 2026-05-09T00:11:45.910Z
closed_at: 2026-05-09T00:26:44.403Z
closeReason: "Deferred — pinning fuzz seeds is theater while ULID generation is
  wall-clock-driven. Even with createSeededRandom(SEED) and gen(picker, SEED),
  node ID generation uses time + crypto.random independently of the fuzz seed,
  so reconciler-correctness assertions remain non-deterministic. Real fix:
  deterministic ULID factory in test mode. See
  @km/test-infra/deterministic-ulid-factory (#chore #P2). chaos-matrix.fuzz.ts
  left at status quo (createSeededRandom() no-arg). When the factory bead lands,
  this bead's intent ('pin seeds for chaos-matrix tests') resumes — file as a
  sub-bead under the factory bead at that point."
tags:
  - P2
  - chore
---

# [x] chaos-matrix.fuzz.ts must pin deterministic seeds — currently passes only by lucky-seed #chore #P2

chaos-matrix.fuzz.ts uses createSeededRandom() without args, picking a fresh seed per run. The 6 fuzz tests authored under @km/storage/sync-architecture/reconcile-chaos-matrix passed at the random-seed-of-the-moment when first committed (4b85258be) but fail at most other seeds — the failures expose real reconciler bugs (see sibling bead chaos-matrix-reconciler-stale-state-on-rewrite).

Pin each test's RNG to a deterministic seed and use `test.fails()` for cases whose deterministic outcome is a known reconciler-bug failure (cross-link to the bug bead in a comment) so the suite is deterministic AND green-when-expected:

- Tests that pass at the chosen seed: ordinary `test.fuzz` + deterministic seed.
- Tests that fail at the chosen seed because they hit a reconciler bug: `test.fails` with the chosen seed and a cross-link comment to `@km/storage/sync-architecture/chaos-matrix-reconciler-stale-state-on-rewrite`. When that bug lands and the test starts passing, vitest fails the build — flipping the marker back to ordinary `test.fuzz` is part of closing the reconciler bead.

Acceptance: every test in chaos-matrix.fuzz.ts uses createSeededRandom(<int>); each currently-failing test is annotated `test.fails` with the failing seed and a cross-link to the reconciler bead; `bun vitest run --project fuzz packages/km-storage/tests/sync/chaos/chaos-matrix.fuzz.ts` exits 0 across 10 consecutive runs. Code refs: createSeededRandom() call sites (one per test) and the failures at file:test lines 231 (rename+change matrix) and 335 (wikilink target swaps).

