# Reduced Signals

Per-node derived state as **reduced signals**: cached tree reductions, incrementally recomputed on change. Like `Array.reduce`, but over a tree walk.

## Why

Many per-node properties propagate through the tree — cursor path upward, selection muting downward, fold inheritance, sigil exclusion, visibility, error indicators. Previously 5+ ad-hoc mechanisms (imperative sync, prop threading, ViewLens, render-time computation). This caused bugs: visual blending from stacked backgrounds, shouldStripColor computed 4 ways, 3 different isSelected definitions.

One mechanism replaces all of them.

## API

### State definition

```ts
const store = reactiveTree({
  state: () => ({
    // Primary signals (set directly by actions)
    cursor: signal(false),
    selected: signal(false),
    edit: signal<EditState | null>(null),
    hovered: signal(false),

    // Reduced signals (cached tree walks — recomputed on batch)
    cursorDescendant: walk.up(s => s.cursor).reduce(or, false),
    selectedAncestor: walk.down(s => s.selected).reduce(or, false),
    excludedSigils: walk.down(s => s.ownSigils).reduce(concat, []),
  }),
  tree: treeAccess,
})
```

`walk.up(accessor)` returns an intermediate — "source values walking up the tree" — with `.reduce(reducer, initial)` to materialize it. Same shape as `Array.reduce`, over a tree walk.

Sugar for the common boolean case:

```ts
cursorDescendant: descendants(s => s.cursor)     // = walk.up(...).reduce(or, false)
selectedAncestor: ancestors(s => s.selected)      // = walk.down(...).reduce(or, false)
```

Future combinators on the intermediate:

```ts
walk.up(s => s.cursor).some()       // boolean: any ancestor?
walk.up(s => s.hasError).count()    // number: how many?
walk.down(s => s.selected).every()  // boolean: all descendants?
```

### Batch

```ts
store.batch(tree, () => {
  store.node(oldId).cursor(false)
  store.node(newId).cursor(true)
})
```

All signal writes inside the callback are collected. Reduced signals recompute once at the end — only affected regions, only changed values written. Can't forget to propagate.

### Components

```tsx
function TreeNode({ nodeId }) {
  const node = useNode(nodeId)
  const cursor = useSignal(node.cursor)
  const muted = useSignal(node.selectedAncestor)
  const breadcrumb = useSignal(node.cursorDescendant)

  // States compose — NOT mutually exclusive
  const bg = cursor ? inverseBg : muted ? mutedBg : normalBg
  const border = breadcrumb ? yellowBorder : normalBorder
  const stripColors = cursor || muted
}
```

No mode enum. Each signal is independent. Components compose per visual aspect. ~3 components read these (TreeNode, CardColumn, NodeView) — inline logic, no helper abstraction needed.

`useNode(nodeId)` returns the node's signal state. Components subscribe granularly via `useSignal` — only re-render when a specific signal changes.

### `store.node(id)`

```ts
store.node(nodeId)         // get or lazily create per-node state
store.node(nodeId).cursor  // Signal<boolean>
```

Always auto-creates. Replaces `getOrCreate()`.

## Walk primitives

Two uses of `walk.up` / `walk.down`:

**In state definitions** — `walk.up(accessor)` creates a reduce descriptor. The accessor reads a signal from each node. The store uses it to build the reduced signal.

**As standalone iterators** — reusable tree traversal, shared across the codebase:

```ts
walk.up(nodeId, tree)                   // parent chain → Iterable<string>
walk.down(nodeId, tree)                 // DFS via KTree.nodes → Iterable<string>
walk.down(nodeId, tree, { into })       // filtered DFS (skip subtrees)
```

Used by: reduced signals, navigation (j/k), search, outliner ops, visibility, count indicators.

Minimal tree interface:

```ts
interface TreeAccess {
  parent(nodeId: string): string | null
  children(nodeId: string): readonly string[]
}
```

## How it works

A reduced signal is a cached pure function. The pure core has no signals, no React:

```ts
// Conceptually, this is all a reduced signal computes:
let acc = initial
for (const id of walk(sourceNodeId, tree)) {
  acc = reducer(acc, readSignal(id))
}
return acc
```

The store wraps this with:
1. **Cache** — result stored as a per-node `Signal<T>` for `useSignal` subscription
2. **Dirty tracking** — which source signals changed since last batch
3. **Incremental recomputation** — on `batch()`, recompute only affected regions, diff output, write only changed signals

Same pattern as the `refs` table in the [link model](links.md): pure function → cache → incremental update on change.

## Constraints (v1)

- **No filtered walks in derivations** — `into` predicates create stale values in collapsed subtrees. Reduce over the full structural tree; visibility is a separate render concern.
- **No reduced-from-reduced** — a reduced signal cannot use another reduced signal as its source. Flat dependency graph for v1.
- **`includeSelf: false` by default** — `selectedAncestor` excludes self (the name says "ancestor"). `cursorDescendant` excludes self.
- **Structural mutations** (reparent/move) need old-parent info for correct ancestor chain updates.

## What this replaces

| Old | New |
|-----|-----|
| `syncCursor()` | `batch()` + `cursor` + `cursorDescendant` |
| `syncSelected()` + `expandWithDescendants()` | `batch()` + `selected` + `selectedAncestor` |
| `cursorInDescendant` (card-only) | `cursorDescendant` (all nodes) |
| `cursorCardNodeId` / `cursorColumnNodeId` / `cursorDepth` | Components read `cursorDescendant` on ancestor |
| 3 different `isSelected` definitions | `selected` + `selectedAncestor` |
| `shouldStripColor` computed 4 ways | Derive from `cursor` / `selectedAncestor` |
| Ad-hoc sigil inheritance in `hydrate()` | `walk.down(s => s.ownSigils).reduce(concat, [])` |

## Performance

Per cursor move (j/k): ~8-10 signal writes, <0.1ms. Marginal overhead vs current `syncCursor`.

The real win is **rendering**: components read O(1) pre-computed signals instead of O(depth) tree walks during render. Muted fast path (`selectedAncestor=true`) skips borders and color resolution.

## Future consumers

| Signal | Definition |
|--------|-----------|
| `cursorDescendant` | `descendants(s => s.cursor)` |
| `selectedAncestor` | `ancestors(s => s.selected)` |
| `excludedSigils` | `walk.down(s => s.ownSigils).reduce(concat, [])` |
| `hasErrorDescendant` | `descendants(s => s.hasError)` |
| `hasUnreadDescendant` | `descendants(s => s.isUnread)` |
| `searchMatchAncestor` | `descendants(s => s.searchMatch)` |
| `dimmedAncestor` | `ancestors(s => s.isDone)` |

Each = one line in the state definition.

See also: [data-model.md](data-model.md) for KNode structure, [links.md](links.md) for the same cache pattern applied to links.
