---
id: "@km/rev-0129/4-delete-bak-files-and-add-to-gitignore"
aliases:
  - km-rev-0129.4
  - km-rev-0129-4
  - "@km/rev-0129/4"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
assignee: claude:298008b9
---

# [x] Delete .bak files and add to .gitignore @km/rev-0129 #task #P3 @claude:298008b9

8 backup files in source tree:
- apps/@km/tui/src/board-actions-nav.ts.bak
- apps/@km/tui/src/board-actions-zoom.ts.bak
- apps/@km/tui/src/views/board-bottom-bar.tsx.bak
- apps/@km/tui/src/views/use-board-dialogs.ts.bak
- apps/@km/_orphan/cli/src/commands/tasks/list.ts.bak
- apps/@km/_orphan/cli/src/commands/tasks/queries.ts.bak

Delete all and add *.bak to .gitignore