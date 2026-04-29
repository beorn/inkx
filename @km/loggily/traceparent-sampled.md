---
id: "@km/loggily/traceparent-sampled"
aliases:
  - km-loggily.traceparent-sampled
  - km-loggily-traceparent-sampled
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:45Z
closed_at: 2026-03-14T01:28:33Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] loggily: traceparent() always marks traces as sampled @km/loggily #bug #P2

traceparent() always emits ...-01 (sampled) even when head-based sampling chose not to sample. Breaks W3C trace-context semantics, causes downstream services to treat unsampled traces as sampled. Fix: carry sampled boolean in span/trace context, emit 00 for unsampled. tracing.ts:89-92. Found by GPT 5.4 Pro review.