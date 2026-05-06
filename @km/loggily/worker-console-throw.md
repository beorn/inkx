---
mentions:
  - km
id: "@km/loggily/worker-console-throw"
aliases:
  - km-loggily.worker-console-throw
  - km-loggily-worker-console-throw
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:53Z
closed_at: 2026-03-14T01:27:53Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] loggily: main-thread worker console handlers throw formatting args @km/loggily #bug #P2

Both worker console handlers use raw JSON.stringify(a) for message building. serializeArg() on worker returns some structured-cloneable values unchanged, and structured clone supports values JSON.stringify rejects (bigint, cyclic graphs). Handler throws while formatting forwarded console call. Fix: use non-throwing safe serializer. worker.ts:512-517, 601-606. Found by GPT 5.4 Pro review.

