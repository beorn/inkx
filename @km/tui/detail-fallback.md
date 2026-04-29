---
id: "@km/tui/detail-fallback"
aliases:
  - km-tui.detail-fallback
  - km-tui-detail-fallback
created_by: claude:36393b5d
created_at: 2026-02-18T23:42:57Z
closed_at: 2026-02-19T22:18:29Z
---

# [x] Open detail panel instead of zooming when target yields flat list @km/tui #feature #P3 @claude:8f007ba9

O3 recommendation: If the optimal zoom still yields a single-column board with no meaningful structure, consider opening a detail panel for the target card instead of zooming to a flat list. Mirrors how Trello handles search (opens card modal rather than navigating board hierarchy). Hybrid approach: navigateToNode() returns action=DETAIL_VIEW when no multi-column ancestor exists.