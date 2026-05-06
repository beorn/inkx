---
mentions:
  - km
id: "@km/infra/bench"
aliases:
  - "@km/all/bench"
  - km-all.bench
  - km-all-bench
created_by: Bjørn Stabell
created_at: 2026-04-08T23:54:18Z
owner: bjorn@stabell.org
---

# [ ] Benchmarking & perf observability @km/all #epic #P2

Perf observability across km, silvery, flexily, loggily. See docs/guide/benchmarking.md.

## Current state (2026-04-08)

Production per-press: ~6.6ms (well under 16ms budget). Startup: 1-2ms full, 9-11ms first render (testEnv overhead).

## Delivered (2026-04-08)

1. **loggily metrics API** — SpanRecorder, LazyProps, ambient recording, withMetrics(collector?)(logger) composable. loggily/metrics subpath export.
2. **Keypress spans** — silvery:perf namespace, perfLog.span?.() pattern, checkBudget, exit summary. Zero overhead when TRACE off.
3. **Startup bench** — benchmarks/startup.bench.ts: board setup (~3μs), first render (9-11ms), full startup (1-2ms). Under 500ms budget.
4. **Staleness check** — scripts/bench-staleness.ts + bun bench:check. Warns >24h+pipeline changes or >7d. Silent when fresh.
5. **Flexily spans** — loggily spans around computeLayout, node/cache stats in span data. Zero-cost via log?.span?.().
6. **docs/guide/benchmarking.md** — updated with startup bench, system-level table, staleness section, TRACE namespace.

## Still open

- Consumer simplification: silvery create-app.tsx startTracking/checkBudget/logExitSummary can be replaced by withMetrics() pattern
- Collector thresholds: createMetricsCollector({ thresholds }) for centralized slow-span warnings (deferred — YAGNI for now)
- Real-world perf test: run with TRACE=silvery:perf on ~vault, compare with bench numbers
- Full bench run: flexily passed, @km/tui/silvery benches not yet run (resource contention)

## Children

- @km/silvery/keypress-spans: DONE — spans in run(), budget alerts, exit summary

