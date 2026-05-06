---
mentions:
  - km
  - claude
id: "@km/tui/nodeindex-perf"
aliases:
  - km-tui.nodeindex-perf
  - km-tui-nodeindex-perf
created_by: claude:97b8de73
created_at: 2026-02-23T02:16:47Z
closed_at: 2026-02-23T02:31:12Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Eliminate 20k getChildren calls from buildNodeIndex @km/tui #task #P1 @claude:97b8de73

buildNodeIndex calls mapDescendants on every card, triggering 20k getChildren SQL queries on zoom for the Asana vault (298k nodes). This causes 2s+ freeze. Solutions: (1) parent-walk cursor resolution instead of pre-mapping descendants, (2) incremental column loading via generator, (3) batch query for descendant mapping. Immediate fix: skip descendants in nodeIndex, walk parent chain on cursor miss.

