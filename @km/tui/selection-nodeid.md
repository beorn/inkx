---
mentions:
  - km
  - claude
id: "@km/tui/selection-nodeid"
aliases:
  - km-tui.selection-nodeid
  - km-tui-selection-nodeid
created_by: claude:703e68be
created_at: 2026-02-11T13:23:21Z
closed_at: 2026-02-11T13:39:53Z
owner: bjorn@stabell.org
assignee: claude:703e68be
---

# [x] Selection model: convert anchor/focus from positional indices to nodeIds @km/tui #task #P4 @claude:703e68be

Currently selectionAnchor is { col: number, card: number, sub: number } — positional indices that break if layout reflows during selection. Convert to nodeId-based: selectionAnchor: string | null (nodeId), resolve to position via layout.nodeIndex when computing selection range. Not urgent since selections are transient and layout doesn't change mid-selection.

