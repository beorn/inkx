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

### 2. foldDepths — Depth-Limited Traversal (Navigation/Counting)

**Where**: `board-app.ts` — `walkVisibleDescendants()`, `countVisibleDescendants()`, `getVisibleDescendantIds()`

**When it runs**: At navigation time, when the key handler needs to count or enumerate a card's visible descendants (for j/k navigation, block counting, outline mode).

**How it works**: `foldDepths` is a `Map<string, number>` on `BoardState`. Each entry maps a node ID to a depth budget. The walker starts with the node's budget (defaulting to 1 or inherited from parent), decrements at each level, and stops descending when the budget reaches 0. `TOGGLE_FOLD` sets a node's depth to 0 (fully folded) or deletes the entry (unfolded, inherit default).

**Effect**: Traversal-scoped — controls how deep `walkVisibleDescendants` recurses into the raw `repo.getChildren()` tree. This walks the **data model**, not the ViewNode tree.

### 3. collapsedNodes — Column-Level Collapse (Rendering Width)

**Where**: `Board.tsx`, `board-layout.ts`, `view-navigation.ts`

**When it runs**: At render time and during horizontal navigation. Controls whether a column renders at full width or as a narrow collapsed strip.

**How it works**: `collapsedNodes` is a `Set<string>` on `BoardState`. Columns whose node ID is in this set render as narrow collapsed columns (showing just the header). `TOGGLE_COLLAPSE` adds/removes from the set. `Board.tsx` syncs `km.collapse:: true` rules into this set on mount.

**Effect**: Visual — cards within collapsed columns still exist in the ViewNode tree but are not rendered. Navigation skips into collapsed columns but does not enumerate their cards.

## The Semantic Mismatch

The core problem: **rendering uses the ViewNode tree but navigation/counting uses raw repo traversal with foldDepths**.

The ViewNode tree is built once per layout cycle by `buildViewTree()`. It applies `isCollapsedChild`, `isDetailOnly`, `hiddenNodeIds`, embed resolution, and deduplication. The result is the authoritative set of visible nodes.

But `walkVisibleDescendants` (used for j/k counting, outline navigation) walks `repo.getChildren()` directly, applying only `foldDepths` as a visibility filter. It does not consult the ViewNode tree. This means:

1. **Navigation can reach nodes that rendering excludes.** A node excluded by `isCollapsedChild` or `hiddenNodeIds` is invisible on screen but may appear in `getVisibleDescendantIds` if foldDepths allows it.

2. **Navigation can miss nodes that rendering shows.** The default foldDepth budget is 1, which limits traversal to direct children. If a card's grandchildren are rendered (because the ViewTree includes them as subitems), foldDepth-based navigation at depth 1 will skip them. (This was the exact bug in bead km-tui.j-skips-grandchildren.)

3. **foldDepths is passed to buildViewTree but unused.** The parameter is named `_foldDepths` (underscore prefix), confirming it is accepted for API consistency but has no effect on tree construction.

## Current State

`buildViewTree` receives `foldDepths` but ignores it — the underscore prefix makes this explicit. The ViewNode tree always shows the fully-expanded structure (minus `isCollapsedChild`/`isDetailOnly`/`hiddenNodeIds` exclusions). Fold state only affects navigation traversal depth.

This means the ViewNode tree represents the **maximum visible set**, and foldDepths narrows what navigation can reach within that set. The mismatch is that these two views of "visible" can disagree.

## The Fix Pattern

Navigation should derive visibility from the ViewNode tree (the rendered truth), not from raw repo traversal with independent depth logic.

**Principle**: If a node is rendered on screen, navigation must be able to reach it. If a node is not rendered, navigation must not visit it. The ViewNode tree is the single source of truth for both.

**What this means for foldDepths**:
- foldDepths should control fold/unfold UI actions (the user intent)
- `buildViewTree` should read foldDepths at construction time to prune subtrees beyond the fold budget
- Navigation should walk the ViewNode tree's children, not repo.getChildren()
- `walkVisibleDescendants`, `countVisibleDescendants`, and `getVisibleDescendantIds` should be replaced with ViewNode-based equivalents

**Migration path**:
1. Make `buildViewTree` honor `foldDepths` — prune ViewNode children beyond the depth budget
2. Replace `walkVisibleDescendants` with a ViewNode tree walk
3. Remove the separate foldDepths-based traversal logic from board-app.ts
4. The ViewNode tree becomes the single authority for "what is visible"

## Summary

| System | Layer | Mechanism | Scope |
|---|---|---|---|
| `isCollapsedChild` | ViewTree construction | Predicate on KNode data | Structural exclusion |
| `foldDepths` | Navigation/counting | Depth budget map | Traversal depth limit |
| `collapsedNodes` | Rendering/layout | Column-level toggle | Visual width collapse |

The end state: foldDepths feeds into ViewTree construction, navigation walks the ViewTree, and there is one definition of "visible."
