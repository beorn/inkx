---
id: "@km/tui/unify-navigation"
aliases:
  - km-tui.unify-navigation
  - km-tui-unify-navigation
created_by: Bjørn Stabell
created_at: 2026-04-02T01:31:58Z
closed_at: 2026-04-02T02:19:53Z
close_reason: Legacy navigation fallback deleted (navigateVertical,
  navigateHorizontal, getSibling, findAncestorAtDepth, filterMeaningfulBody,
  cardAt). NavState.viewTree/viewIndex now required. -579 lines. Commit
  216eadb8.
---

# [x] Delete legacy navigation — ViewNode-only cursor movement @km/tui #task #P2

view-navigation.ts (1292 lines) has two parallel navigation implementations:
- Legacy (lines 78-730): repo.getNode(), repo.getChildren(), splitBodyAndColumns(), findAncestorAtDepth()
- ViewNode (lines 732-1180): vnNavigateVertical, vnNavigateHorizontal — clean tree traversal

TARGET: Delete legacy navigation functions (~500 lines). ViewNode versions are cleaner — parent/children/role/isBody already resolved, no repo queries during navigation.

IMPACT: ~500 lines removed, view-navigation.ts 1292 -> ~700 lines. Eliminates navigation-landing-on-wrong-card bugs from body/embed misclassification.
DEPENDS ON: @km/tui/view-tree equivalence validation, @km/tui/unify-columns.