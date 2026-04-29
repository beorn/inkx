---
id: "@km/loggily/collectspans-testing"
aliases:
  - km-loggily.collectspans-testing
  - km-loggily-collectspans-testing
created_by: Bjørn Stabell
created_at: 2026-04-11T23:37:15Z
closed_at: 2026-04-12T00:14:09Z
close_reason: Superseded by km-loggily.api-v2 — becomes withMetrics() plugin or
  testing helper
---

# [x] Porcelain API: collectSpans() — testing helper for span assertions @km/loggily #feature #P2

blocks:: [[@km/loggily]]

Enable/disable span collection for testing; collectSpans().spans() returns array of emitted spans. Eliminates need to patch the writer or inspect internals.