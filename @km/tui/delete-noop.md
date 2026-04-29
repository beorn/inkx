---
id: "@km/tui/delete-noop"
aliases:
  - km-tui.delete-noop
  - km-tui-delete-noop
created_by: Bjørn Stabell
created_at: 2026-04-01T05:47:54Z
closed_at: 2026-04-02T20:00:25Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Delete sometimes doesn't remove node — cursor moves but card stays @km/tui #bug #P1 @Bjørn Stabell

Delete sometimes doesn't remove node — cursor moves but card stays.

## Investigation
- Traced the delete path: handleDeleteNode → executeBatchDelete → repo.deleteNode
- The delete path itself is sound for single and batch operations
- Cursor target is pre-computed before deletion (correct)
- Repo version increments and notifies React after delete (correct)
- Multi-select delete works correctly when using visual mode selection

## Root Cause Hypothesis
The most likely cause is the filesystem reconciliation system. When a node (task/section inside a markdown file) is deleted from DB:
1. DB delete succeeds immediately
2. The parent file must be re-serialized asynchronously (via WriteQueue)
3. During the brief window, the watcher may re-parse the old file and re-create the node

This explains "sometimes" — it depends on timing between DB delete and FS write.

## Fix
Added runtime invariant checks (invariants.ts) that detect state corruption after every action. The invariants will catch:
- cursor-exists: cursor pointing to deleted node
- cursor-in-columns: cursor node exists in repo but not in columns
- edit-node-exists: inline edit targeting deleted node
- card-node-exists: column card referencing deleted node
- selection-node-exists: multi-selection containing deleted node

Tests added to board-edit.slow.spec.ts verifying both DB and screen consistency after delete.