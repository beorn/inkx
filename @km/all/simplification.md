---
id: "@km/all/simplification"
aliases:
  - km-all.simplification
  - km-all-simplification
created_by: Bjørn Stabell
created_at: 2026-04-02T01:31:16Z
closed_at: 2026-04-02T03:49:07Z
close_reason: all steps complete
---

# [x] Post-view-tree architectural simplification — eliminate redundancy, unify mechanisms @km/all #epic #P2

Tracking epic for architectural simplification opportunities identified in the three-pass review (docs/architecture-review-findings.md). These are the remaining opportunities AFTER @km/tui/view-tree completes.

ViewNode migration (@km/tui/view-tree) addresses: body detection, column-level collapse, embed visual resolution, cursor classification, navigation. This epic tracks what remains.

TOP 5 OPPORTUNITIES (by lines removed x bug risk):
1. Unify column derivation — use-columns.ts becomes thin wrapper over ViewNode (~400 lines)
2. Unify cursor classification — deriveCursorAncestors replaced by deriveCursorPath (~180 lines)
3. Simplify navigation — delete legacy repo-walking navigation (~500 lines)
4. Consolidate undo mechanisms — two competing systems into one (~200 lines)
5. Filter hidden nodes in ViewNode tree (~50 lines, eliminates 75 occurrences in view-navigation.ts)

ADDITIONAL:
6. ViewNode memoization — per-column cache equivalent needed to avoid perf regression
7. BoardState definition consolidation — 3 drifted definitions
8. Board.apply extraction — split 2647-line board-actions.ts gravity well

DEPENDS ON: @km/tui/view-tree (Phases 3-5)
INFORMED BY: @km/all/architecture-review (findings doc)
ALIGNS WITH: @km/tui/plugin-architecture, @km/all/plugin-composability