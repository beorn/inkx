---
mentions:
  - km
id: "@km/loggily/span-context-corrupt"
aliases:
  - km-loggily.span-context-corrupt
  - km-loggily-span-context-corrupt
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:31Z
closed_at: 2026-03-14T01:28:10Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] loggily: out-of-order end() corrupts AsyncLocalStorage context @km/loggily #bug #P2

Context exit hook only restores parentId/traceId, not exact previously active context. Non-LIFO span.end() ordering corrupts context — ending parent while child still active. Fix: capture full previous SpanContext at enterSpanContext() time and restore on exit, only if currently active context belongs to span being ended. core.ts:656-667, context.ts:105-128. Found by GPT 5.4 Pro review.

