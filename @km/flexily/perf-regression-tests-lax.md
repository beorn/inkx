---
id: "@km/flexily/perf-regression-tests-lax"
aliases:
  - km-flexily.perf-regression-tests-lax
  - km-flexily-perf-regression-tests-lax
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:20Z
closed_at: 2026-03-13T05:47:29Z
close_reason: "Tightened all 7 performance thresholds from 50-67x headroom to
  ~10x actual: small 2ms→0.5ms, medium 5ms→1.5ms, dirty-leaf 1ms→0.2ms,
  no-change 0.1ms→0.01ms, large 10ms→2ms, large-nested 15ms→3ms, large-dirty
  5ms→1ms. All tests pass."
owner: bjorn@stabell.org
---

# [x] Testing: Performance regression test thresholds too lax to catch meaningful regressions @km/flexily #task #P1
