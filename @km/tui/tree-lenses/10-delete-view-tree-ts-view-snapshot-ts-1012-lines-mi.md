---
id: "@km/tui/tree-lenses/10-delete-view-tree-ts-view-snapshot-ts-1012-lines-mi"
aliases:
  - km-tui.tree-lenses.10
  - km-tui-tree-lenses-10
  - "@km/tui/tree-lenses/10"
created_by: Bjørn Stabell
created_at: 2026-04-06T06:36:02Z
closed_at: 2026-04-06T07:08:39Z
close_reason: view-tree.ts (861 lines) + view-snapshot.ts (151 lines) +
  view-tree.test.ts (836 lines) + lens-vs-legacy.test.ts (608 lines) DELETED.
  Kept helpers moved to view-lens-helpers.ts. km-canvas migrated to lens. All
  5651 tests pass. 1012 lines of legacy source + ~1444 lines of legacy tests
  removed.
owner: bjorn@stabell.org
---

# [x] Delete view-tree.ts + view-snapshot.ts (1012 lines) — migrate driver/state/km-canvas to lens @km/tui #task #P2

Legacy code still exists:
- packages/@km/_orphan/board/src/view-tree.ts (861 lines): buildViewTree, buildViewIndex, viewNodeToColumnViews, classifyCursorFromViewIndex, toColumnViews, CompatColumnView
- packages/@km/_orphan/board/src/view-snapshot.ts (151 lines): createViewSnapshot, ViewSnapshot

Consumers to migrate first:
- apps/@km/tui/src/hooks/use-columns.ts (deriveColumnsFromRepo, deriveDetailColumns, toCards)
- apps/@km/tui/src/driver.ts (test driver)
- apps/@km/tui/src/state.ts (buildBoardState boot path)
- apps/@km/tui/src/navigation/view-navigation.ts (legacy classifyCursor fallback)
- apps/@km/tui/src/testing.ts (test helpers)
- apps/@km/tui/web/@km/canvas/tsx (web target)
- packages/@km/_orphan/board/tests/view-tree.test.ts (tests of the deleted code)