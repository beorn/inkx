---
mentions:
  - km
  - claude
id: "@km/rev-0129/11-organize-km-tui-src-into-subdirectories"
aliases:
  - km-rev-0129.11
  - km-rev-0129-11
  - "@km/rev-0129/11"
created_at: 2026-01-29T16:36:06Z
closed_at: 2026-01-29T18:09:24Z
assignee: claude:298008b9
---

# [x] Organize km-tui src/ into subdirectories @km/rev-0129 #task #P4 @claude:298008b9

apps/@km/tui/src/ has 28 files at root level. Consider:

- board/actions/ - board-actions*.ts (5 files, 1347 lines total)
- keyboard/ - keyboard-*.ts (3 files)
- handlers/ - navigation-handlers.ts, mouse-handler.ts, paste-handler.ts

Check for duplicated code patterns when reorganizing.

