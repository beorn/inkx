---
id: "@km/tui/col-scroll"
aliases:
  - km-tui.col-scroll
  - km-tui-col-scroll
created_by: claude:e5580cd5
created_at: 2026-02-12T16:09:01Z
closed_at: 2026-02-14T09:08:06Z
---

# [x] Vertical scroll indicator not showing in COLUMNS view @km/tui #bug #P3 @claude:124bfbe5

VerticalScrollIndicator (the left/right chevron indicators showing more columns exist offscreen) does not appear in COLUMNS view when there are more columns than fit on screen. Works correctly in CARDS view. The calcColumnWidths utility sets hasLeftIndicator/hasRightIndicator, and ColumnsView renders them, but they may not be triggering or visible.