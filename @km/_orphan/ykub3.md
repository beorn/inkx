---
id: "@km/_orphan/ykub3"
aliases:
  - km-ykub3
created_by: claude:8f007ba9
created_at: 2026-02-19T21:25:09Z
closed_at: 2026-02-19T21:37:58Z
---

# [x] Mode stack push/pop not validated — potential drift from UI state @km/_orphan #bug #P3 @claude:8f007ba9

In board-actions.ts, pushDialogMode/popDialogMode are manually paired. If UI booleans get out of sync with the mode stack (e.g., different code path sets showFilterDialog=false), the stack can drift. handleCloseOrQuit has 6 separate popDialogMode calls guarded by UI booleans. Fix: add debug assertion that validates popped mode matches expectations, or use popDialogMode(expectedMode) pattern.