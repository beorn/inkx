---
mentions:
  - km
  - Bjørn
id: "@km/inbox/0kqt3"
aliases:
  - km-0kqt3
  - "@km/_orphan/0kqt3"
created_by: Bjørn Stabell
created_at: 2026-04-01T06:10:05Z
closed_at: 2026-04-02T04:09:52Z
close_reason: Already fixed — reconcileIfChanged removed from all DB-origin
  handlers in prior work. Cleaned up unused import in sync.ts (commit a229e29e).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] reconcileIfChanged still called for create/delete/move/task handlers — data loss @km/_orphan #bug #P0 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/event-handlers.ts:171-340
Classification: P0

reconcileIfChanged() was removed from handleNodeUpdated() to fix the reconcile-clobbers-edits bug, but it is STILL called in handleNodeCreated(), handleNodeDeleted(), handleNodeMoved(), and handleTaskEvent(). These can still trigger the same data-loss pattern: reading stale file content and applying it back to DB, overwriting current DB state.

This likely explains the remaining delete-noop failures.

Suggested fix: Remove reconcileIfChanged() from ALL DB-origin handlers. Move conflict detection to a dedicated sync-state layer.

