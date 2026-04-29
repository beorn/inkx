---
id: "@km/tui/body-block-navigation"
aliases:
  - km-tui.body-block-navigation
  - km-tui-body-block-navigation
created_by: Bjørn Stabell
created_at: 2026-04-02T20:57:22Z
closed_at: 2026-04-02T22:01:20Z
---

# [x] ctrl-n fails on body block nodes — navigation model assumes outline items @km/tui #bug #P1 @Bjørn Stabell

When user clicks directly on a body block (type p) and presses ctrl-n, gets 'no adjacent node' error. ArrowDown works because it goes through text.cursor_down -> cursorDown fallback -> handleEditBlockNavigate. But ctrl-n goes directly to EDIT_BLOCK_NAVIGATE which calls findAdjacentEditNode, which only navigates between extractBody().items (outline items). Body blocks are not in items, so the node is not found.

Root cause: navigation model assumes inlineEditBlock.nodeId is always either a card or an outline item. Body blocks are supposed to be navigated via blockIndex within their parent. But clicking on a body block directly sets nodeId to the body block, not the parent.

Fix: in handleEditBlockNavigate, if the edit node is a body block (not outline), resolve it to its parent outline item first, then navigate from there. Or: in findAdjacentEditNode, when node is not found in items, check if it is a body block and navigate from parent instead.

Discovered via /why analysis in @km/_orphan/work session. testEnv passes because test fixtures always create outline items, not body blocks at the click target level.