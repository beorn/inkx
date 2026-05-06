---
mentions:
  - km
  - claude
id: "@km/tui/click-subitem-global"
aliases:
  - km-tui.click-subitem-global
  - km-tui-click-subitem-global
created_by: claude:d3a7049b
created_at: 2026-02-20T16:58:20Z
closed_at: 2026-02-20T17:45:53Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Click on card subitem selects subitems on all cards @km/tui #bug #P2 @claude:d3a7049b

When clicking on a subitem/block within a card, the subIndex is set globally in UIState. This causes ALL cards to show a subitem as selected (the same block index), not just the clicked card. The subIndex highlight should only render on the cursor card (the one that was clicked).

