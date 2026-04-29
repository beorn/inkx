---
id: "@km/_orphan/5mpn0"
aliases:
  - km-5mpn0
created_by: claude:b92140a2
created_at: 2026-03-17T08:32:40Z
closed_at: 2026-03-17T15:04:30Z
close_reason: Folder rename detects same-name index file and renames it
  atomically on disk + DB.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P0: Folder rename breaks same-name index files @km/_orphan #bug #P0 @claude:b92140a2

Renaming project/ to newname/ updates descendant fs_paths but does NOT rename project/project.md to newname/newname.md. The old file stops matching findIndexFile() and a new one may be created, causing duplicates. Fix: detect same-name index child during folder rename, rename it atomically.