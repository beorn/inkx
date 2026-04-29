---
id: "@km/tui/add-progress"
aliases:
  - km-tui.add-progress
  - km-tui-add-progress
created_by: claude:bca35d62
created_at: 2026-02-11T16:29:25Z
closed_at: 2026-02-18T07:58:52Z
owner: bjorn@stabell.org
assignee: claude:5f0aee02
---

# [x] km add: show progress for query, resolve, and link creation phases @km/tui #feature #P3 @claude:5f0aee02

Currently km add shows progress only for Load repo (via loadRepo spinner). The actual work phases are silent:

1. Resolve target node
2. Query/glob match sources (can find 100+ tasks)
3. Find default column
4. Create link nodes (one emitNodeCreatedWithEmitter per task)

With 122 tasks, steps 2 and 4 could take noticeable time. Should show progress like:

  ✔ Load repo 304ms
  ✔ Resolving target 2ms
  ✔ Querying tasks (122 found) 45ms
  ✔ Creating links (122/122) 80ms
  ✓ Linked 122 task(s) to Next Actions

File: apps/@km/_orphan/cli/src/commands/add.ts