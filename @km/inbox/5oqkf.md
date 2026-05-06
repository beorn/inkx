---
mentions:
  - km
  - claude
id: "@km/inbox/5oqkf"
aliases:
  - km-5oqkf
  - "@km/_orphan/5oqkf"
created_at: 2026-02-01T20:57:02Z
closed_at: 2026-02-01T21:02:44Z
assignee: claude:3e1beaa0
---

# [x] Orphaned .km with empty database shows Empty board @km/_orphan #bug #P1 @claude:3e1beaa0

When km init or sync is interrupted, .km/state.db may contain only the root node while events.jsonl has fs-watch events. This causes km view to show 'Empty board' despite vault having thousands of files.

Root cause: Initialization creates .km/ and root node, but sync can be interrupted before populating the database. The watcher then emits events for non-existent nodes.

Evidence from tst-vault9:

- state.db had 1 node (root only)
- events.jsonl had node_updated/node_deleted events from fs-watch
- These events referenced nodes that didn't exist

Fix needed:

1. Detect incomplete initialization on startup
2. Make sync more atomic (don't leave partial state)
3. Add health check: warn if .km exists but node count < expected

