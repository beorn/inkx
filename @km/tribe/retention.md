---
id: "@km/tribe/retention"
aliases:
  - km-tribe.retention
  - km-tribe-retention
created_by: claude:19080504
created_at: 2026-03-26T17:11:34Z
closed_at: 2026-03-26T17:25:41Z
close_reason: All fixed and pushed. From GPT 5.4 Pro review triage.
---

# [x] TTL-based retention for messages, events, reads tables @km/tribe #feature #P2

Tables grow unbounded. Add retention: delete reads older than 7d, compact messages older than 30d, archive events. Keep cursor semantics robust with seq-based approach.