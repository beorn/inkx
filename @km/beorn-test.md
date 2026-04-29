---
id: "@km/beorn-test"
aliases:
  - km-beorn-test
  - "@km/_orphan/beorn-test"
created_at: 2026-02-02T14:11:44Z
closed_at: 2026-02-04T11:27:27Z
---

# [x] Extract @beorn/test - unified test framework with fuzz and AI modes @km/beorn-test #epic #P2 @claude:4731ed4e

Tracking bead for vitestx — unified test framework extending vitest with fuzz and AI modes. Lives at vendor/beorn-vitestx/.

## Done
- Package structure, core abstractions, fuzz runner with shrinking
- gen/take/test.fuzz ergonomic API (161 tests)
- Fuzz terms (Provider-based for inkx)
- Documentation (README, overview, concepts, conventions)

## Sub-beads
- @km/beorn-test/chaos — Extract generic chaos stream transformers [P2]
- @km/beorn-test/cli — Wire up vitest CLI modes (fuzz, ai, doc) [P3]
- @km/beorn-test/ai — AI mode LLM integration + directed exploration [P3]
- @km/beorn-test/mdtest — mdtest integration as vitest plugin [P3]
- @km/beorn-test/terms — Terminology review (surface → ?) [P3]