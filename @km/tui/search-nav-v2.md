---
id: "@km/tui/search-nav-v2"
aliases:
  - km-tui.search-nav-v2
  - km-tui-search-nav-v2
created_by: claude:fcaad2fa
created_at: 2026-02-18T14:33:41Z
closed_at: 2026-02-18T14:53:43Z
---

# [x] Search: still doesn't navigate to the matched node — should zoom to grandparent so node becomes a card @km/tui #bug #P2 @claude:fcaad2fa

Search navigation still lands on wrong level. The fix in findZoomTarget() (session 0218b) changed depth>=4 to zoom to grandparent with cursor on target, but it's still not working correctly. The node should become a visible card by making its grandparent the board root. Re-examine findZoomTarget() logic.