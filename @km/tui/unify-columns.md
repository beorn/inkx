---
id: "@km/tui/unify-columns"
aliases:
  - km-tui.unify-columns
  - km-tui-unify-columns
created_by: claude:36393b5d
created_at: 2026-02-19T13:28:47Z
closed_at: 2026-04-02T03:49:06Z
close_reason: useColumns now wraps ViewNode — viewTreeToColumnViews is the
  single derivation path. Commit 6b91c775.
---

# [x] Unify column derivation — use-columns.ts becomes thin ViewNode wrapper @km/tui #task #P2 @Bjørn Stabell

use-columns.ts (772 lines) and view-tree.ts (476 lines) duplicate: isCollapsedChild, isDetailOnly, isWellKnownMetadataSection, deduplicateByFsPath, createVirtualBodyNode, expandIndexFileColumns.

TARGET: ViewNode tree is sole authority. use-columns.ts becomes ~50-line wrapper calling buildViewTree() + toColumnViews(). All collapse/detail-only/body/dedup logic lives only in view-tree.ts.

IMPACT: ~400 lines removed, derivation drift bug class eliminated.
DEPENDS ON: @km/tui/view-tree Phase 3 completion.
CAVEAT: Must have ViewNode memoization (@km/tui/viewnode-cache) first or perf regresses.