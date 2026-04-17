# Visibility Model

How km decides which nodes are visible, navigable, and rendered.

## The Lens Pipeline

km has a three-layer visibility pipeline. Each layer is a [TreeLens](../glossary.md#treelens) — a pure data interface for navigating tree structures with no state and no signals. Layers compose by wrapping:

```
repo                                  all nodes, SQLite-backed
  └── createViewLens(repo, opts)      rooted subtree, hidden filtered, roles computed
        └── createVisibleLens(view)   collapsed/filtered/task-status applied
              └── createViewTree()    React-side projection (per-node signals via ProjectedMap)
```

| Layer | Where | What it does | What it filters |
|---|---|---|---|
| **Repo** | `@km/storage` | Source of truth, SQLite-backed | Nothing — every KNode is in here |
| **ViewLens** | `packages/km-board/src/view-lens.ts` | Walks the repo from a root, computes visual roles, resolves embeds, classifies body content | Hidden nodes (`hiddenNodeIds`), structural exclusions (`isCollapsedChild`, `isDetailOnly`, frontmatter `km.collapse:: true`), folder-index file expansion |
| **VisibleLens** | `packages/km-board/src/visible-lens.ts` | Wraps a ViewLens; further restricts which nodes are visible | Collapsed columns (`collapsedNodes`), task-status filter (`taskStatusFilter`), card-level predicate (`cardFilter`) |
| **ViewTree** | `packages/km-board/src/view-tree-projection.ts` | React-side projection of any TreeLens; per-node signal bags via `ProjectedMap`; iterator API (`nodes()`) | None — same visibility as the underlying lens. ViewTree's job is *reactivity*, not filtering. |

A node is "visible" if and only if it appears in the lens's `walkOrder`. The cursor lives in `walkOrder` — this makes "cursor on hidden node" structurally impossible by construction.

## The Three Visibility Mechanisms

There are three independent ways a node can be excluded from view, each operating at a different layer.

### 1. Structural exclusion (ViewLens construction)

**Where**: `packages/km-board/src/view-lens.ts` and `view-lens-helpers.ts` — `isCollapsedChild()`, `isDetailOnly()`, hidden-node set.

**When**: When the ViewLens computes `children(id)` for a parent. Excluded children never appear in `walkOrder`.

**What it matches**:
- Nodes with `detailOnly: true` in their data
- Well-known metadata sections: "activity", "comments", "attachments"
- Nodes with `km.collapse:: true` in their heading rules
- Nodes whose ID is in the `hiddenNodeIds` set passed at lens construction

**Effect**: Structural — excluded nodes have no presence in the lens. They cannot be navigated to, rendered, or counted by anything reading from the lens (which is everything downstream).

### 2. Collapsed columns (VisibleLens construction)

**Where**: `packages/km-board/src/visible-lens.ts` — `collapsedNodes` option.

**When**: When the VisibleLens computes `children(id)` for a column header. If the column is in `collapsedNodes`, its children are excluded entirely.

**How it works**: `collapsedNodes` is a `Set<string>` on `BoardState`. Columns whose node ID is in this set still have their header in the lens (so cursor can land on the column row), but their card children are not in `walkOrder`. `Board.tsx` syncs `km.collapse:: true` rules into this set on mount; users toggle with horizontal collapse keys.

**Effect**: Visual + navigational — cards within collapsed columns are not rendered AND not enumerable from the lens. Navigation skips into collapsed columns (lands on the header row, not on cards inside).

### 3. Per-node fold (NodeStore, React layer)

**Where**: `apps/km-tui/src/state/reactive.ts` — `createNodeStore()`. Fold signals written directly by `Board.tsx`.

**When**: At React render time. `TreeNode.tsx` reads per-node fold signals via the reactive node store and skips rendering folded subtrees.

**Why not in the lens?** Filter text changes on every keystroke. If fold/filter lived in the lens (as construction options), every keypress would invalidate `walkOrder`, the children cache, and the visible-lens cache — kills the per-node-signal incremental rendering that makes cards view fast. The current design keeps fold at the React layer where NodeStore can flip a single per-node signal and only the affected `TreeNode` re-renders.

**Caveat (current limitation)**: This means **only the cards view honors fold**. The alternate views (`columns`, `list`, `tabs`) consume the lens directly via `useSignal(ps.visibleLens)` and never read the node store. They render flat (one row per column-direct child) and have no per-card fold awareness. See `bd show km-tui.view-mode-feature-parity` for the planned fix — the alternate views need to graduate to consuming `ViewTree` (the React-side projection) the way cards view does.

## Choosing the Right API

**In a React component**: use `ViewTree` via `useNode(id)`.
- Per-node subscriptions; component re-renders only when *that node's* state changes
- Iterator: `viewTree.nodes({ from?, reverse? })`
- Lookups: `viewTree.node(id)`, `viewTree.children(id)`, `viewTree.parent(id)`
- Navigation: `viewTree.next(id)`, `viewTree.prev(id)`

**In non-React code** (reducers, selectors, navigation helpers, store, pane signals): use `TreeLens` directly.
- No per-node signals — bulk computation is cheaper without them
- Use `lens.walkOrder` for the eager array; use the underlying repo for raw queries
- Lookups: `lens.get(id)`, `lens.children(id)`, `lens.parent(id)`
- Navigation: `lens.nextInWalk(id)`, `lens.prevInWalk(id)`

## Historical: The Semantic Mismatch (Resolved)

Previously, **rendering used the ViewNode tree but navigation/counting used raw repo traversal with `foldDepths`** (`walkVisibleDescendants`, `getVisibleDescendantIds`). This caused bugs where navigation could reach invisible nodes or miss visible ones (see bead `km-tui.j-skips-grandchildren`).

**Resolution**: The lens migration (commits `fabf49e8c`, `ce58aca85`, completed in `2910f2dd8` which deleted the legacy `view-tree.ts` + `view-snapshot.ts`) replaced both paths. Navigation now uses `viewTree.nodes()` and `viewTree.next()/prev()`, and rendering uses the same TreeLens via `useNode(id)`. Both layers read from the same source of truth.

The old bare functions (`walkVisibleDescendants`, `countVisibleDescendants`, `getVisibleDescendantIds`, `getVisibleDescendants`, `dfsTraversal`, `buildViewTree`, `buildViewIndex`) have all been removed.

## Summary

| Mechanism | Layer | Mechanism | Scope |
|---|---|---|---|
| Structural exclusion | ViewLens construction | Predicates on KNode + `hiddenNodeIds` set | Nodes never appear in `walkOrder` at all |
| Collapsed columns | VisibleLens construction | `collapsedNodes` set | Card children of collapsed columns excluded |
| Per-node fold | NodeStore (React layer) | `foldDepths` map → per-node signals | Subtree rendering skipped in cards view; alternate views currently bypassed (see km-tui.view-mode-feature-parity) |

**Open work**: pushing fold into the lens layer would simplify the architecture (alternate views would honor it for free) but conflicts with per-node-signal incremental rendering performance. Tracked in `km-tui.view-mode-feature-parity` — the proposed approach is to keep fold at the React layer but graduate alternate views to consume `ViewTree` (and per-node signals) instead of the raw lens.
