---
id: "@km/tui/click-select-card"
aliases:
  - km-tui.click-select-card
  - km-tui-click-select-card
created_by: claude:656602a3
created_at: 2026-03-17T06:45:12Z
closed_at: 2026-03-18T19:32:06Z
close_reason: "Fixed: reordered ancestor walk in handleMouse — isColumnNode now
  derived as firstIdIsColumn && !cardId. Added data-card-id to Card wrappers. 6
  tests pass."
---

# [x] Click on any part of a card should select the card (not just the title node) @km/tui #bug #P0 @claude:d29abbfa

Two related click selection bugs:

## Bug 1: Click-to-focus regression (was @km/_orphan/19f41, P0)
Clicking on a card in the board view no longer selects that specific card. Instead, clicks focus the entire board pane. This is a regression — click-to-card-focus worked previously.

## Bug 2: Sub-block hit resolution
Currently clicking on a sub-block within a card selects that sub-block's node, not the card. The hitTest walks up to the first ancestor with an id prop, which may be a sub-block. Should resolve to the card-level node for selection purposes.

Also: parent breadcrumb shown above embedded nodes should be a Link - clicking it navigates to the parent. On Cmd+hover it shows underline like other links.

## Repro
km view on any repo, click on a specific card. Expected: cursor moves to that card. Actual: board pane gets focus but cursor doesn't move to the clicked card.