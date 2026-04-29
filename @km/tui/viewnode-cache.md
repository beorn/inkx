---
id: "@km/tui/viewnode-cache"
aliases:
  - km-tui.viewnode-cache
  - km-tui-viewnode-cache
created_by: Bjørn Stabell
created_at: 2026-04-02T01:32:32Z
closed_at: 2026-04-02T02:00:23Z
close_reason: Done by view-tree agent. ViewNodeColumnCache with childrenRef
  identity checks in view-tree.ts. buildColumnNodeCached() reuses subtrees when
  repo.getChildren() returns same reference. Cache reused across buildActionCtx
  calls. Commit f7c39545.
---

# [x] ViewNode memoization — per-column cache equivalent to prevent perf regression @km/tui #task #P2

use-columns.ts has per-column memoization (kNodeToColumnViewCached) that avoids re-deriving unchanged columns. ViewNode rebuilds the entire tree on every state change via buildViewTree().

If ViewNode replaces use-columns.ts (@km/tui/unify-columns), it needs equivalent caching or the board will re-derive all columns on every cursor move.

OPTIONS:
- Structural sharing: rebuild only subtrees whose repo data changed
- Memoized toColumnViews(): cache CompatColumnView[] per ViewNode, invalidate on subtree change
- Fingerprinting: compare ViewNode tree shape to skip re-render

MUST BE DONE BEFORE @km/tui/unify-columns to avoid perf regression.