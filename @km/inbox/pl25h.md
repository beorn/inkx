---
id: "@km/inbox/pl25h"
aliases:
  - km-pl25h
  - "@km/_orphan/pl25h"
created_by: claude:b92140a2
created_at: 2026-03-17T17:29:14Z
closed_at: 2026-03-17T19:05:08Z
close_reason: All 5 bugs fixed with tests. 1216 tests passing.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P1: Renamed mdfiles not added to modifiedIndexFiles @km/_orphan #bug #P1 @claude:b92140a2

handleRename doesn't add renamed markdown files to ctx.modifiedIndexFiles. A rename like notes.md→index.md won't trigger syncIndexFileToFolder before folder refresh, causing stale overwrites. Fix: add all renamed mdfiles to modifiedIndexFiles.