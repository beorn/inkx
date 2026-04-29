---
id: "@km/tui/click-precision"
aliases:
  - km-tui.click-precision
  - km-tui-click-precision
created_by: claude:d3a7049b
created_at: 2026-02-20T15:52:54Z
closed_at: 2026-02-23T01:20:37Z
---

# [x] Precise click targeting: columns, card titles, sub-blocks @km/tui #feature #P2 @claude:97b8de73

Click interactions should be more precise and work at all levels:

## Column-level clicks
- Clicking a column header selects that column (moves cursor to it)
- Clicking empty space in a column selects the column

## Card-level clicks  
- Clicking the card title/heading = select the card (move cursor to it)
- Single click on a sub-item/block within a card = select that specific block
- Double-click on a sub-item = edit that block inline

## Current behavior
- Click resolves to a card via resolveMouseToNode() using GridNavigator position registry
- Double-click enters inline edit on the whole card
- No column-level click handling
- No sub-block precision

## Implementation notes
- resolveMouseToNode() in board-app.ts does column→card resolution
- Need to extend to resolve card→block (sub-item level)
- GridNavigator tracks card positions but not sub-item positions
- May need to register sub-item positions or use relative Y offset within card