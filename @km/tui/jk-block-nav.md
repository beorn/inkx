---
id: "@km/tui/jk-block-nav"
aliases:
  - km-tui.jk-block-nav
  - km-tui-jk-block-nav
created_by: claude:ee8efc0f
created_at: 2026-02-22T00:42:26Z
closed_at: 2026-02-22T00:59:34Z
---

# [x] J/K block navigation is stub — should drill into/out of cards @km/tui #bug #P2 @claude:ee8efc0f

J/K (uppercase) are bound to block_nav_down/block_nav_up but board-actions-nav.ts:52 says: 'block_up/block_down are stubs that map to regular up/down for now (TODO: auto-unfold + block jump)'. Expected: J on a card selects first subitem (drills in), K backs out. Actual: J/K just move to next/prev sibling card (same as j/k).