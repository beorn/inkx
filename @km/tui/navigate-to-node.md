---
mentions:
  - km
id: "@km/tui/navigate-to-node"
aliases:
  - km-tui.navigate-to-node
  - km-tui-navigate-to-node
created_by: claude:36393b5d
created_at: 2026-02-18T23:42:46Z
closed_at: 2026-02-19T07:19:01Z
owner: bjorn@stabell.org
---

# [x] Unified navigateToNode() replacing findZoomTarget + inline zoom logic @km/tui #task #P2

O3 recommendation: Extract a single navigateToNode(target, repo) function that replaces both findZoomTarget() and the inline logic in handleSearchSelect(). Structure-aware ancestor walking: walk up the chain, stop at the lowest ancestor that yields a multi-column layout (>=2 oi children). Returns { action: SELECT|ZOOM_IN|DETAIL_VIEW, zoomTarget?, cursorTarget? }. Reusable for search, deep links, breadcrumb navigation, any 'go to' feature. Current findZoomTarget() always picks grandparent regardless of structure — this is the root cause of single-column board landings.

