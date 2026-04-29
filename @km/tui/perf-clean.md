---
id: "@km/tui/perf-clean"
aliases:
  - km-tui.perf-clean
  - km-tui-perf-clean
created_at: 2026-02-08T13:33:03Z
closed_at: 2026-02-08T13:43:11Z
---

# [x] Clean up perf-arch refactored code @km/tui #task #P2 @claude:a3625ec3

Code review findings from /code clean on today's perf-arch refactored code.

## High value

1. **view-navigation.ts:180-189** — Dead while loop that always breaks immediately. Remove loop, keep `targetColIdx = colIdx + step`.

2. **view-navigation.ts:251-273** — getNextSibling/getPreviousSibling are near-identical. Merge into `getSibling(nodeId, repo, delta: 1 | -1)`.

3. **board-actions-nav.ts:152-168 + 181-191** — Duplicate NavState construction in handleHorizontalNav and handleVerticalNav. Extract `navStateFrom(ctx)` helper.

4. **board-actions-nav.ts:197-201** — Dead fallback `return boundary(dir)` for null cursor. Should throw per fail-early principle — navigation without cursor is a programming error.

## Medium value

5. **ui-context.tsx:54-83** — useTreeConfig duplicates deriveTreeConfig logic. Should call `deriveTreeConfig(s.ui)` instead of inlining.

6. **ui-context.tsx:148-152** — useSigilColors creates new Map in useMemo but STATIC_SIGIL_COLORS already exists. Return it directly.

7. **view-navigation.ts:58** — Stale comment references deleted functions (handleHierarchicalNavigation, handleHorizontalNav).