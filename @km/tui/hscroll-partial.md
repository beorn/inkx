---
id: "@km/tui/hscroll-partial"
aliases:
  - km-tui.hscroll-partial
  - km-tui-hscroll-partial
created_by: claude:717696c0
created_at: 2026-02-15T22:03:03Z
closed_at: 2026-02-16T00:02:30Z
---

# [x] Cursoring to partially visible columns doesn't trigger horizontal scroll @km/tui #bug #P2

When navigating right to a column that requires horizontal scrolling, the cursor column's right edge extends exactly 1 character past the viewport boundary at certain viewport widths. The rightmost character of the column is clipped/invisible.

Confirmed failing widths (3 columns): 60, 65, 73, 75, 77, 85.
Confirmed passing widths: 70, 72, 74, 76, 78, 80, 90.

Root cause: The estimatedVisibleCount in useVirtualization (line 162) uses Math.ceil which overcounts visible items. With overflow indicators reserving 2 chars (effectiveViewport = width - 2), the scroll algorithm places items such that their total physical width (items + gaps) exceeds the effective viewport by 1 char.

Example at width=73: expandedWidth=36, gap=1, effectiveViewport=71. Two items + gap = 36+1+36 = 73 > 71. But estimatedVisibleCount=ceil(71/37)=2, so calcEdgeBasedScrollOffset thinks 2 items fit.

Fix is in vendor/beorn-inkx/src/hooks/useVirtualization.ts or scroll-utils.ts — the visible count estimation needs to account for the actual physical width of items + gaps, not just item count.