---
id: "@km/silvery/signal-graph-scale-limits"
aliases:
  - km-silvery.signal-graph-scale-limits
  - km-silvery-signal-graph-scale-limits
created_by: claude:8b5b9e1c
created_at: 2026-04-21T08:37:21Z
---

# [ ] Signal graph scale ceiling — alien-signals + React reconciliation at 100K+ nodes @km/silvery #task #P1

blocks:: [[@km/all/plateau]]

Dual-pro review 2026-04-21 flagged the reactive graph as the likely actual 10x bottleneck, not storage. K2.6: 'For a single-process JS TUI with fine-grained reactivity, the comfortable limit is 50K-100K in-memory nodes total. Above 150K, you are gambling with GC non-determinism.'

## Investigation scope

Measure alien-signals + React + silvery reconciliation behavior at 10K / 50K / 100K / 250K / 500K registered nodes:

1. Per-node heap overhead (V8 object + signal + subscriptions)
2. Registration time (mount storm)
3. Subscription fanout cost on a common mutation (e.g., focus change that touches 10% of registered nodes)
4. Full-GC pause distribution under sustained navigation load
5. Time-to-idle after a 1K-node mutation burst
6. React reconciliation cost when the underlying structure is mostly-unchanged-but-reactive-signals-updated

## Deliverables

- Benchmarks at each scale, ideally integrated with @km/storage/scale-benchmarks
- Recommended realistic ceiling for km's reactive layer (reactive entities in JS)
- Policy: at what point does km need to STOP registering every node as reactive?
- Mitigation options: visible-only reactivity, chunk-level reactivity, signal pooling, lazy subscription

## Why this matters for scale-architecture

If signal graph is the ceiling at ~100K nodes (not SQLite), the scale-architecture decision must not assume 'memory holds 650K hydrated active nodes and everything's fine'. Lazy hydration must be MORE aggressive than storage-level caching.

## Prerequisite

None hard. Benefits from but doesn't require lazy-hydration implementation. Can run against HEAD today with synthetic fixtures.