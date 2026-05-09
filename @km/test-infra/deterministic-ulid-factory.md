---
aliases:
  - km-test-infra.deterministic-ulid-factory
  - km-test-infra-deterministic-ulid-factory
created_at: 2026-05-09T00:27:15.680Z
---

# Deterministic ULID factory in test mode — unblocks reconciler-correctness fuzz #chore #P2

Reconciler-correctness chaos tests are flaky because node IDs are ULIDs (time + crypto.random), generated independently of any fuzz seed. Even with deterministic event sequences via createSeededRandom(SEED) + gen(picker, SEED), whether reconciler bugs (node identity churn, stale link rows) manifest depends on wall-clock time rather than the test seed.

Solution: introduce a ULID factory injection seam in km-storage (and any other package generating IDs). Default implementation produces real ULIDs (current behavior). Tests can override with a factory that pins time and uses a seeded RNG, making node IDs deterministic across runs.

Acceptance: a single factory function (e.g. createIdFactory(opts?: { time?: () => number; rng?: SeededRandom })) is the only path to new node IDs in km-storage; production code uses the default; chaos / fuzz / round-trip tests can pass a deterministic factory; downstream consumers can build on this:
- @km/storage/sync-architecture/chaos-matrix-deterministic-seeds resumes (currently deferred — sibling bead) once the factory exists; pin seeds + deterministic IDs makes chaos-matrix.fuzz.ts truly reproducible.
- @km/storage/sync-architecture/chaos-matrix-reconciler-stale-state-on-rewrite needs the factory to write a deterministic regression test for the bug it tracks.
