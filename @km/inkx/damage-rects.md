---
id: "@km/inkx/damage-rects"
aliases:
  - km-inkx.damage-rects
  - km-inkx-damage-rects
created_by: claude:ee8efc0f
created_at: 2026-02-22T23:29:30Z
closed_at: 2026-02-23T00:29:00Z
---

# [x] Evaluate: damage rectangles vs row ranges for diff optimization @km/inkx #task #P3 @claude:ee8efc0f

CC tracks damage as {x,y,width,height} rectangles and skips diff for undamaged regions. inkx tracks minDirtyRow/maxDirtyRow — simpler but coarser. Evaluate whether rectangle-based damage tracking would meaningfully improve diff performance for typical TUI layouts (wide screens with localized updates like cursor movement or single-cell edits). May not be worth the complexity for terminal UIs where most updates span full rows.