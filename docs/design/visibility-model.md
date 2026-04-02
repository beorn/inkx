# Visibility Model

How km decides which nodes are visible, navigable, and rendered.

## The Three Visibility Systems

km has three independent mechanisms that control node visibility, each operating at a different layer:

### 1. isCollapsedChild — Structural Exclusion (ViewTree Construction)

**Where**: `view-tree.ts` — `isCollapsedChild()`, `isDetailOnly()`

**When it runs**: At ViewTree construction time, inside `buildViewTree()`. Nodes matching these predicates are excluded from the ViewNode tree entirely. They never appear in columns, cards, or subitems.

**What it matches**:
- Nodes with `detailOnly: true` in their data
- Well-known metadata sections: "activity", "comments", "attachments"
- Nodes with `km.collapse:: true` in their heading rules

**Effect**: Structural — excluded nodes have no ViewNode representation. They cannot be navigated to, rendered, or counted. The ViewNode tree is the rendered truth and these nodes are not in it.

### 2. foldDepths — Depth-Limited Traversal (ViewTree Construction)

**Where**: `BoardState` — `foldDepths` map, consumed by `buildViewTree()`

**When it runs**: At ViewTree construction time. Previously also at navigation time via now-removed `walkVisibleDescendants()` / `getVisibleDescendantIds()`.

**How it works**: `foldDepths` is a `Map<string, number>` on `BoardState`. Each entry maps a node ID to a depth budget. `TOGGLE_FOLD` sets a node's depth to 0 (fully folded) or deletes the entry (unfolded, inherit default).

**Effect**: Controls fold/unfold UI state. Navigation now walks the ViewTree directly (via `getVisibleDescendants` in `board-actions-nav.ts`), so foldDepths only matters insofar as ViewTree construction honors it.

### 3. collapsedNodes — Column-Level Collapse (Rendering Width)

**Where**: `Board.tsx`, `board-layout.ts`, `view-navigation.ts`

**When it runs**: At render time and during horizontal navigation. Controls whether a column renders at full width or as a narrow collapsed strip.

**How it works**: `collapsedNodes` is a `Set<string>` on `BoardState`. Columns whose node ID is in this set render as narrow collapsed columns (showing just the header). `TOGGLE_COLLAPSE` adds/removes from the set. `Board.tsx` syncs `km.collapse:: true` rules into this set on mount.

**Effect**: Visual — cards within collapsed columns still exist in the ViewNode tree but are not rendered. Navigation skips into collapsed columns but does not enumerate their cards.

## Historical: The Semantic Mismatch (Now Resolved)

Previously, **rendering used the ViewNode tree but navigation/counting used raw repo traversal with foldDepths** (`walkVisibleDescendants`, `getVisibleDescendantIds`). This caused bugs where navigation could reach invisible nodes or miss visible ones (see bead km-tui.j-skips-grandchildren).

**Resolution**: Navigation now uses `ViewTree.nodes()` and `ViewTree.sibling()` from the `@km/board` namespace. The old bare functions (`walkVisibleDescendants`, `countVisibleDescendants`, `getVisibleDescendantIds`, `getVisibleDescendants`, `dfsTraversal`) have all been removed or replaced by ViewTree namespace methods.

## Current State

Navigation derives visibility from the ViewNode tree (the rendered truth). The ViewNode tree is the single source of truth for both rendering and navigation.

**Remaining work**: `buildViewTree` receives `foldDepths` but ignores it (underscore prefix `_foldDepths`). For full fold support, `buildViewTree` should honor `foldDepths` at construction time to prune subtrees beyond the fold budget.

## Summary

| System | Layer | Mechanism | Scope |
|---|---|---|---|
| `isCollapsedChild` | ViewTree construction | Predicate on KNode data | Structural exclusion |
| `foldDepths` | Navigation/counting | Depth budget map | Traversal depth limit |
| `collapsedNodes` | Rendering/layout | Column-level toggle | Visual width collapse |

The end state: foldDepths feeds into ViewTree construction, navigation walks the ViewTree, and there is one definition of "visible."
