---
id: "@km/tui/viewnode-hidden"
aliases:
  - km-tui.viewnode-hidden
  - km-tui-viewnode-hidden
created_by: Bjørn Stabell
created_at: 2026-04-02T01:32:17Z
closed_at: 2026-04-02T03:49:07Z
close_reason: Hidden node filtering moved to buildViewTree construction time.
  hiddenNodeIds removed from NavState, ActionCtx, BoardNavState. 1523 km-tui +
  120 km-board tests pass. Done by tribe session km-4-9r1.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Filter hidden nodes in buildViewTree — eliminate threading through navigation @km/tui #task #P2 @Bjørn Stabell

hiddenNodeIds is currently threaded through: ActionCtx (1 field), NavState (1 field), view-navigation.ts (75 occurrences — every navigation function checks it), board-actions.ts (13 occurrences), board-app.ts (computeHiddenNodeIds).

TARGET: buildViewTree() accepts hiddenPaths and excludes hidden nodes during tree construction. Navigation never sees hidden nodes because they're not in the tree. hiddenNodeIds parameter eliminated from NavState and every navigation function.

IMPACT: ~50 lines of filtering removed from view-navigation.ts, 5+ files simplified. Eliminates 'navigation landed on hidden node' bug class.
DEPENDS ON: @km/tui/view-tree Phase 3.