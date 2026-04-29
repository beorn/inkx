---
id: "@km/silvery/feedback-trace-loggily"
aliases:
  - km-silvery.feedback-trace-loggily
  - km-silvery-feedback-trace-loggily
created_by: claude:cc081a9a
created_at: 2026-04-27T07:05:35Z
closed_at: 2026-04-27T08:42:03Z
close_reason: Path A confirmed by team-lead 2026-04-27. Shipped state (silvery
  32335883 + e0fc140c, km 01b2df30 + c787f291) is the canonical C3a-loggily
  migration. Loggily Stage is the idiomatic extension point for categorical
  aggregation; /pro review confirmed log.span / loggily/metrics are wrong shape
  (durations meaningless, props dropped). 11367 vendor + 2534 km-tui pass. C3b's
  edge/node breakdown preserved.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.feedback-trace-loggily
    depends_on_id: km-silvery.structural-hardening
    type: parent-child
    created_at: 2026-04-27T00:05:35Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Migrate pass-cause instrumentation to loggily @km/silvery #task #P2

blocks:: [[@km/silvery/structural-hardening]]

C3a (@km/silvery/renderer-feedback-trace) shipped pass-cause instrumentation as a custom 280-LOC module (vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts) with its own SILVERY_INSTRUMENT env, JSONL flush, and aggregation. User explicitly directed loggily integration before the work started; the agent built a parallel logging path instead.

The instrumentation works and the histogram baseline is real (191 897 records, 729 teardowns). Migration scope is purely refactoring the emit/aggregate plumbing without changing the categorization or data shape.

## Why this matters

- Two parallel logging paths in silvery (loggily + custom SILVERY_INSTRUMENT) means observability fragments. Tooling that consumes one won't see the other.
- loggily's metric collector + spans give: namespace filtering (TRACE=silvery:passes:layout-invalidate), stackable collectors (test code can inject a collector via withMetrics), Disposable-pattern spans, automatic histogram via log.metrics.summary(). The custom path reimplements all of these in 280 LOC.
- C3b (bounded-convergence) will consume the histogram; if migration happens after C3b, the consumer surface changes. Better to do this BEFORE C3b runs.

## Migration plan

1. Replace custom recordPassCause with `using span = log.span("pass", { cause, nodeId, edge, detail })` where log = createLogger("silvery:passes", [{ metrics: true }, console]) gated by env-var.
2. Replace custom histogram building with log.metrics.summary() / log.metrics.stats(\"pass\").
3. Namespace by cause: silvery:passes:layout-invalidate, silvery:passes:scrollto-settle, etc. so DEBUG/TRACE filtering works without code changes.
4. Map SILVERY_INSTRUMENT=1 to TRACE=silvery:passes for backwards compat (or document the change).
5. Update tools/aggregate-pass-histogram.ts to consume loggily's JSONL format.
6. Update hub/silvery/design/pass-cause-histogram.md with the new reproducer commands.

## /complete
- grep \"SILVERY_INSTRUMENT\" vendor/silvery → only env-var-mapping mention(s); no parallel logging logic
- grep \"recordPassCause\" → 0 hits (replaced by log.span)
- vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts: < 100 LOC (down from 280) — only PassCause type + namespace mapping + the createLogger factory
- bun vitest run --project=vendor: still 11 367 passing
- bun vitest run apps/@km/tui/tests/: still 2 534 passing
- Histogram from loggily-based path matches custom-path baseline within ±5% on the same fixture corpus

## Branch & timing

Source branch: feat/feedback-trace (where C3a's commits live). Migration commits go on top.

Should run BEFORE C3b (bounded-convergence) so C3b consumes the loggily-based histogram, not the custom one. C3b is otherwise unblocked by C3a data.

Origin: @km/all/plateau-90 follow-on (created 2026-04-27).