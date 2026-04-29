---
id: "@km/tui/selection-clear-on-nav"
aliases:
  - km-tui.selection-clear-on-nav
  - km-tui-selection-clear-on-nav
created_by: claude:703e68be
created_at: 2026-02-11T14:19:30Z
closed_at: 2026-02-12T14:18:11Z
---

# [x] Non-shift cursor moves reset selection @km/tui #task #P3 @claude:586bad48

When user moves cursor with non-shift keys (j/k/h/l), any existing multi-selection should be cleared and cursor becomes the sole selection. Only Shift+movement keys should extend/modify the selection range. Currently selection may persist after plain cursor navigation. Needs description from original author — verify expected behavior before implementing.