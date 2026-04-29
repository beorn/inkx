---
id: "@km/tribe/poll-mutex"
aliases:
  - km-tribe.poll-mutex
  - km-tribe-poll-mutex
created_by: claude:19080504
created_at: 2026-03-26T17:11:32Z
closed_at: 2026-03-26T17:25:40Z
close_reason: All fixed and pushed. From GPT 5.4 Pro review triage.
---

# [x] Poll loop can overlap — add async mutex @km/tribe #bug #P1

pollMessages() is async but setInterval has no in-flight guard. If delivery >1s, overlapping polls cause duplicate delivery. Fix: add polling=false mutex.