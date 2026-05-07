---
mentions:
  - km
  - claude
id: "@km/logger/benchmarks"
aliases:
  - km-logger.benchmarks
  - km-logger-benchmarks
created_by: claude:fbad9cb1
created_at: 2026-03-04T16:14:47Z
closed_at: 2026-03-04T16:24:34Z
owner: bjorn@stabell.org
assignee: claude:fbad9cb1
---

# [x] Phase 1: Published benchmarks — ?. overhead vs pino/winston/debug noop @km/logger #task #P2 @claude:fbad9cb1

Create a benchmark suite that demonstrates the zero-overhead advantage:

- Disabled log call: logger?.debug() vs pino.debug() vs winston.debug() vs debug()
- Enabled log call: structured data, string interpolation
- Span creation and timing overhead
- Bundle size comparison
- Publish results in docs/ with methodology and reproduction steps

