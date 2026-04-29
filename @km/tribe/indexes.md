---
id: "@km/tribe/indexes"
aliases:
  - km-tribe.indexes
  - km-tribe-indexes
created_by: claude:19080504
created_at: 2026-03-26T17:11:34Z
closed_at: 2026-03-26T17:25:41Z
close_reason: All fixed and pushed. From GPT 5.4 Pro review triage.
---

# [x] Add missing SQLite indexes for poll/session queries @km/tribe #task #P2

reads PK order is wrong for polling. Add idx_reads_session_message(session_id, message_id) and idx_sessions_role_pruned_heartbeat.