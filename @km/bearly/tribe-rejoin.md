---
id: "@km/bearly/tribe-rejoin"
aliases:
  - km-bearly.tribe-rejoin
  - km-bearly-tribe-rejoin
created_by: claude:19080504
created_at: 2026-03-25T21:13:21Z
closed_at: 2026-03-25T22:36:07Z
close_reason: Soft pruning (pruned_at column), auto-rejoin via heartbeat,
  tribe_join MCP tool. 6 new tests.
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] tribe_join tool: self-registration after compaction/pruning @km/bearly #feature #P3 @claude:19080504

After compaction, a session's MCP process is still running but the session loses its identity context. Add a tribe_join tool that lets a session re-announce its name, role, and domains without chief intervention. Currently sessions can only recover by sending messages (which keeps heartbeat alive) but can't update their registration metadata.