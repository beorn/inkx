---
id: "@km/tui/dead-code-p1"
aliases:
  - km-tui.dead-code-p1
  - km-tui-dead-code-p1
created_by: claude:36393b5d
created_at: 2026-02-19T13:28:43Z
closed_at: 2026-02-19T14:02:47Z
---

# [x] Delete dead code: store fields, ActionCtx fields, hooks, types @km/tui #task #P2 @claude:36393b5d

Batch delete dead code identified in review:
1a. tuiBoardState on store — never read
1b. 6 dead ActionCtx fields (maxOutlineDepth, maxContentLines, navHistory, navHistoryIndex, curswantX/Y)
1c. curswantX/curswantY on BoardAppState — superseded by GridNavigator
1d. Dead cursor hooks: useIsCursorInColumn, useCursorSelectionLevel
1e. Dead React integration in input-mode.ts (ModeStackProvider, useInputMode, ModeStackContext)
1f. Dead useCursorPosition hook
1g. Root-level navHistory/navHistoryIndex on store — never read
1h. Dead BoardAction type in types.ts
~200 lines of safe deletions.