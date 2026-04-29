---
id: "@km/_orphan/z0k8z"
aliases:
  - km-z0k8z
created_by: claude:b92140a2
created_at: 2026-03-17T17:29:13Z
closed_at: 2026-03-17T19:05:08Z
close_reason: All 5 bugs fixed with tests. 1216 tests passing.
---

# [x] P0: handleRename doesn't update parent_id for cross-folder moves @km/_orphan #bug #P0 @claude:b92140a2

External rename from a/task.md to b/task.md updates fs_path and name but not parent_id. Breaks getChildren(), index re-materialization, folder zoom. Fix: compute new parent from dirname(op.path) and emit parent_id update.