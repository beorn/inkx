---
id: "@km/loggily/span-collection-broken"
aliases:
  - km-loggily.span-collection-broken
  - km-loggily-span-collection-broken
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:03Z
closed_at: 2026-03-14T01:28:10Z
close_reason: Closed
---

# [x] loggily: span collection API never collects spans @km/loggily #bug #P1

startCollecting()/stopCollecting()/getCollectedSpans() expose a span collection API, but the span disposal path never checks collectSpans and never pushes anything into collectedSpans. Collection always returns empty array. Fix: in span dispose/end path, append immutable snapshot to collectedSpans when collectSpans is enabled. core.ts:659-678, 713-735. Found by GPT 5.4 Pro review.