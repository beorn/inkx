---
id: "@km/silvery/selection/walk-iter"
aliases:
  - km-silvery.selection.walk-iter
  - km-silvery-selection-walk-iter
created_by: Bjørn Stabell
created_at: 2026-04-05T15:51:42Z
closed_at: 2026-04-05T15:53:39Z
close_reason: Merged into km-tui.signals.4 — will add prev/next to ViewSnapshot
  as part of PaneSignals migration
owner: bjorn@stabell.org
---

# [x] Selection tree interface: next(id)/prev(id) instead of walkOrder array @km/silvery #task #P3

Selection library currently requires walkOrder(root): ID[] — materializes the full DFS array. For cursor nav (j/k), only next/prev is needed. Add next(id)/prev(id) to SelectionApp.tree interface. The ViewTree already has ViewTree.next()/prev() — just needs to be exposed through the adapter. Makes cursor nav O(1) instead of O(N-once-per-snapshot).