---
mentions:
  - km
id: "@km/tui/perf-regr"
aliases:
  - km-tui.perf-regr
  - km-tui-perf-regr
created_at: 2026-02-06T16:31:55Z
closed_at: 2026-02-07T09:20:03Z
---

# [x] Performance regression after Phase 6 store refactoring @km/tui #bug #P2

Cursoring around is noticeably slower after the Phase 6 Maximum Store Refactoring. Prior fix (@km/_orphan/mr1km) reduced nav from 200-700ms to 115-135ms by limiting maxChildren. New regression may be from: (1) extra store subscriptions/selectors, (2) ActionCtx rebuilding on every key, (3) additional object allocation in set() calls. Needs profiling with large vault (~29k nodes) to compare before/after.

