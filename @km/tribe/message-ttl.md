---
id: "@km/tribe/message-ttl"
aliases:
  - km-tribe.message-ttl
  - km-tribe-message-ttl
created_by: claude:19080504
created_at: 2026-03-31T18:24:51Z
closed_at: 2026-03-31T18:27:08Z
close_reason: Messages, events, event_log auto-deleted after 7 days in cleanupOldData()
---

# [x] Message TTL — auto-delete messages older than 7 days @km/tribe #task #P4

DB accumulates messages for dead sessions forever. Add TTL cleanup in cleanupOldData().