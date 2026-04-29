---
id: "@km/beorn-test/chaos"
aliases:
  - km-beorn-test.chaos
  - km-beorn-test-chaos
created_at: 2026-02-03T12:51:04Z
closed_at: 2026-02-03T13:03:16Z
assignee: claude:4731ed4e
---

# [x] vitestx: Extract generic chaos stream transformers @km/beorn-test #task #P2 @claude:4731ed4e

Port the 6 generic async iterable transformers from km's chaos tests into vitestx/chaos. These operate on AsyncIterable<T> with no domain knowledge:

- drop(source, rate, rng) — skip items probabilistically
- reorder(source, windowSize, rng) — shuffle within sliding window
- duplicate(source, rate, rng) — yield some items twice
- burst(source, burstSize) — buffer then flush
- initGap(source, count) — skip first N items
- delay(source, minMs, maxMs, rng) — await before yield
- chaos(source, configs, rng) — compose transformers into pipeline

Source: packages/@km/storage/tests/sync/chaos/transformers.ts (already written, just needs generalization from FsEvent to T).