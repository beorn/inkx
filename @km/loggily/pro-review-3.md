---
id: "@km/loggily/pro-review-3"
aliases:
  - km-loggily.pro-review-3
  - km-loggily-pro-review-3
created_by: claude:65d845d9
created_at: 2026-03-14T00:11:56Z
closed_at: 2026-03-14T02:00:00Z
close_reason: All P0/P1 bugs fixed, 374 tests pass
---

# [x] Pro Review 3: loggily — 2 P0, 6 P1, 2 P2 @km/loggily #task #P2

GPT 5.4 Pro code review of loggily (2026-03-13). Cost: $4.09. 10 findings total.

## P0 (correctness)
1. Span collection API never actually collects spans (core.ts:659-678)
2. Worker span forwarding emits the wrong span (worker.ts:655-668)

## P1 (safety/quality)
3. Logger formatting can throw on circular data/bigint (core.ts:375-425)
4. Worker logger silently drops logs when postMessage can't clone (worker.ts:308-321)
5. Manual out-of-order end() corrupts AsyncLocalStorage context (core.ts:656-667, context.ts:105-128)
6. File writer can lose buffered logs on write failure (file-writer.ts:60-64)
7. traceparent() always marks traces as sampled (tracing.ts:89-92)
8. Main-thread worker console handlers can throw formatting forwarded args (worker.ts:512-517)

## P2 (medium)
9. User fields can overwrite reserved metadata (core.ts:410-416)
10. Worker span endTime/duration keep changing after end (worker.ts:358-366)

Full review: /tmp/llm-65d845d9-1773446147088-qk3j.txt