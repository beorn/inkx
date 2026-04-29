---
id: "@km/tui/search-misses-cards"
aliases:
  - km-tui.search-misses-cards
  - km-tui-search-misses-cards
created_by: Bjørn Stabell
created_at: 2026-04-06T20:46:34Z
closed_at: 2026-04-06T20:58:29Z
close_reason: "Fixed in 6fb5970fe. findMatchingNodeIds now walks tree.walkOrder
  (full visible DFS projection) and matches against getNodeDisplayName. Root
  cause: the old code duplicated tree-walking logic assuming a 2-level
  root→col→card shape, instead of trusting the visible-lens walkOrder. Also
  missed headings/columns that store titles in data.name rather than
  node.content/node.name. Verified with 2 new regression tests in
  local-find.slow.test.ts covering (a) sub-items 3+ levels deep, (b) cards with
  matching sub-items. All 18 local-find tests pass."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Search fails to find card items in default view (P0) @km/tui #bug #P0 @Bjørn Stabell

Repro: bun km view <vault>, press /, type 'Review'. Result: 'No matches' even though 'Review quarterly report' is visible.

Root cause: findMatchingNodeIds in apps/@km/tui/src/board/board-actions-find.ts:17-33 only walks 2 levels (rootId children = columns, colId children = cards). Visible cards are at a different projection depth.

Fix: walk ALL visible nodes via tree.walkOrder or recursive walk.