---
id: "@km/tui/overflow-count"
aliases:
  - km-tui.overflow-count
  - km-tui-overflow-count
created_by: claude:5f0aee02
created_at: 2026-02-18T10:15:24Z
closed_at: 2026-02-18T22:38:19Z
owner: bjorn@stabell.org
---

# [x] Missing child count on subitems and overflow count on zoomed cards @km/tui #bug #P2

1) When a node with children appears as a subitem, it shows date but no child count. E.g., 'Plan - Cindy, Bjorn...' shows date but not subitem count. 2) When zoomed into a section (shown as card), no overflow count indicator shown. 3) Content may be overly truncated when viewed as a card. Test with ^1208517608529889 (China task in Asana import).