---
id: "@km/inbox/mkzzr"
aliases:
  - km-mkzzr
  - "@km/_orphan/mkzzr"
created_by: claude:b92140a2
created_at: 2026-03-17T17:29:15Z
closed_at: 2026-03-17T19:05:08Z
close_reason: All 5 bugs fixed with tests. 1216 tests passing.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P1: In-app folder rename doesn't refresh index file content @km/_orphan #bug #P1 @claude:b92140a2

handleFolderRename renames the directory and same-name index file, but doesn't regenerate index content. Title in index file stays as old name. Fix: call handleFolderIndexUpdate after successful folder rename.