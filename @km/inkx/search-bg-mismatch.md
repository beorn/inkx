---
id: "@km/inkx/search-bg-mismatch"
aliases:
  - km-inkx.search-bg-mismatch
  - km-inkx-search-bg-mismatch
created_at: 2026-02-05T01:44:12Z
closed_at: 2026-02-05T07:54:20Z
assignee: claude:10db6ea8
---

# [x] Search dialog incremental render mismatch (bg=6 vs bg=0) @km/inkx #bug #P2 @claude:10db6ea8

## Problem
INKX_STRICT catches a mismatch in search-bugs.spec.ts:
- incremental: bg=6 (cyan)
- fresh: bg=0 (black/default)

Position (16, 12) in the search dialog shows stale cyan background in incremental render when it should show black.

## Analysis
- All nodes show "clean" (dirty flags already cleared after render)
- The bug is likely in dirty flag propagation when result rows change
- Result row has `backgroundColor={isSelected ? "cyan" : "black"}`
- When results filter/change, something isn't triggering proper re-render

## Related
- content-phase.ts: fast-path logic, parentRegionCleared
- host-config.ts: commitUpdate, markSubtreeDirty
- SearchDialog.tsx: result row rendering

## Workaround
Set INKX_STRICT=0 to run tests without incremental checking.