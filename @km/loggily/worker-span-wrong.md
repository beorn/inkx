---
id: "@km/loggily/worker-span-wrong"
aliases:
  - km-loggily.worker-span-wrong
  - km-loggily-worker-span-wrong
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:10Z
closed_at: 2026-03-14T01:27:53Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] loggily: worker span forwarding emits wrong span @km/loggily #bug #P1

On main thread, worker span:end messages create a brand-new local span and end it immediately, discarding worker-provided spanId, traceId, parentId, startTime, endTime, duration. Emitted span has wrong IDs, wrong parentage, wrong timing. Fix: add internal primitive that writes a span from externally supplied metadata. worker.ts:655-668. Found by GPT 5.4 Pro review.