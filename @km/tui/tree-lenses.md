---
id: "@km/tui/tree-lenses"
aliases:
  - km-tui.tree-lenses
  - km-tui-tree-lenses
created_by: Bjørn Stabell
created_at: 2026-04-05T18:25:59Z
closed_at: 2026-04-06T08:56:15Z
close_reason: "Quality plateau architecture achieved. 14/14 children closed. All
  live code paths (action handlers, Board.tsx rendering, find/search-replace,
  buildOpCtx board mode) use ViewTreeProjection — no ColumnView. Components take
  string IDs and self-resolve via useNode(). Legacy pipeline fully deleted:
  viewNodeToColumnViews=0, buildViewTree=0, ViewSnapshot=0, CardView=0.
  ColumnView confined to initialization and test harness only."
---

# [x] ViewTree: RepoTree + ViewTree with useNode(id) — quality plateau architecture @km/tui #feature #P2 @Bjørn Stabell

Name and formalize the three tree representations in @km/tui:
1. RepoTree (data) → 2. ViewTree (structural visibility) → 3. VisibleTree (render visibility)

Each is a narrowing lens with mirrored APIs (get, children, nextInWalk, walkOrder).
The cursor lives in VisibleTree. Navigation uses VisibleTree.walkOrder.

This eliminates the "cursor on hidden/filtered/collapsed node" class of bugs
by making VisibleTree the single source of truth for what's navigable.

Currently ViewTree exists (ViewSnapshot). VisibleTree is implicit (Board.tsx useMemo chains).
The work is to make VisibleTree a first-class concept and wire navigation to it.