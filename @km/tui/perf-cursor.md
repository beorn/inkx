---
id: "@km/tui/perf-cursor"
aliases:
  - km-tui.perf-cursor
  - km-tui-perf-cursor
created_by: claude:c7c59180
created_at: 2026-02-10T16:55:45Z
closed_at: 2026-02-12T14:12:32Z
owner: bjorn@stabell.org
assignee: claude:586bad48
---

# [x] Optimize cursor navigation for large sibling lists (O(N) findIndex → O(1)) @km/tui #task #P2 @claude:586bad48

view-navigation.ts getSibling() calls findIndex() on full children array — O(N) per j/k keypress. With /tmp/vt vault directories (3700 siblings), this is ~3700 comparisons per cursor move. Fix: add getChildIndex() to ChildrenCache with O(1) reverse lookup Map.