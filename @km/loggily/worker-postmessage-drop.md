---
id: "@km/loggily/worker-postmessage-drop"
aliases:
  - km-loggily.worker-postmessage-drop
  - km-loggily-worker-postmessage-drop
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:24Z
closed_at: 2026-03-14T01:27:53Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] loggily: worker logger silently drops logs when postMessage can't clone @km/loggily #bug #P2

createWorkerLogger() forwards raw props/data/spanData through postMessage. Non-structured-cloneable values cause postMessage to throw, silently swallowing the entire message. Fix: reuse serializeArg() for structured log data, span props, custom spanData. Send fallback diagnostic on failure. worker.ts:308-321. Found by GPT 5.4 Pro review.