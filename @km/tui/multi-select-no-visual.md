---
id: "@km/tui/multi-select-no-visual"
aliases:
  - km-tui.multi-select-no-visual
  - km-tui-multi-select-no-visual
created_by: Bjørn Stabell
created_at: 2026-04-06T20:46:36Z
closed_at: 2026-04-07T05:59:34Z
close_reason: Fixed via 3c65d0cee. Adds multiSelectedBg(theme) helper (14%
  primary blend; ANSI-16 fallback to blackBright). CardColumn cardBg now uses
  multiSelectedBg when isNodeSelected, selectedBg when only isCursorOnCard.
  TreeNode headRowBg adds the multi-select tint to sub-items. selection-style.ts
  rule 6 rewritten to document the actual implementation. Termless test
  'multi-selected cards show multi-select bg' confirms 3 distinct bg values
  (cursor=3 yellow, multi-select=8 blackBright, none=null).
---

# [x] [bug] Multi-selection has no visual highlight @km/tui #bug #P1 @Bjørn Stabell

Shift+J/K extends selection but no visual feedback on which items are selected. Status shows '2 items selected' but user flies blind. Need bg color or marker on selected items.