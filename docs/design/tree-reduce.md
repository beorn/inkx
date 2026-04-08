# Tree Reduce — Cached Pure Functions Over the Node Tree

Per-node derived state as cached tree reduces, incrementally recomputed on change.

## The idea in one sentence

A tree reduce is a **cached pure function** that walks the tree and reduces values. The store materializes the result as a per-node signal. `batch()` incrementally recomputes dirty regions.

## Why

~20 per-node properties propagate through the tree (cursor path, selection muting, fold inheritance, sigil exclusion, visibility, error indicators, ...). Previously 5+ ad-hoc mechanisms (imperative sync functions, prop threading, ViewLens filtering, render-time computation). This caused bugs: visual blending, shouldStripColor computed 4 different ways, 3 different isSelected definitions.

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

    // Tree reduces (cached — recomputed incrementally on batch)
    cursorDescendant: descendants(s => s.cursor),
    selectedAncestor: ancestors(s => s.selected),
  }),
  tree: treeAccess,
})
```

`descendants(s => s.cursor)` = "true when any descendant has `cursor=true`". Returns a signal-like descriptor; the store materializes it.

`ancestors(s => s.selected)` = "true when any ancestor has `selected=true`".

### Sugar and general form

The sugar covers the common boolean case:

```ts
// Sugar:
cursorDescendant: descendants(s => s.cursor)
selectedAncestor: ancestors(s => s.selected)

// Desugars to general form:
cursorDescendant: update(s => s.cursor, walk.up, or, false)
selectedAncestor: update(s => s.selected, walk.down, or, false)
```

`update(source, walk, reducer, initial)` — same shape as `Array.reduce`, but over a tree walk:
- **source**: accessor for the source signal on each node
- **walk**: tree iterator (`walk.up` = parent chain, `walk.down` = DFS)
- **reducer**: `(accumulator, value) => accumulator`
- **initial**: starting value

The name `update` is source-centric: "when source changes, update nodes walking in this direction." This makes the walk direction intuitive — `walk.down` means "update descendants."

### General form for non-boolean reduces

```ts
// Set union walking down (sigil inheritance with merge)
excludedSigils: update(s => s.ownSigils, walk.down,
  (acc, val) => [...acc, ...val], [])

// Count walking up (error count in subtree)
errorCount: update(s => s.hasError, walk.up,
  (acc, val) => acc + (val ? 1 : 0), 0)
```

### Batch — incremental re-materialization

```ts
store.batch(tree, () => {
  store.node(oldId).cursor(false)
  store.node(newId).cursor(true)
})
// 1. Dirty tracking sees cursor changed on 2 nodes
// 2. Recomputes only affected regions (ancestor chain for walk.up)
// 3. Diffs output — writes only changed signals
// 4. ~8 signal writes for a cursor move, <0.1ms
```

`batch()` ensures propagation can't be forgotten. All signal writes inside the callback are collected; tree reduces are recomputed once at the end.

### `store.node(id)` — per-node state

```ts
store.node(nodeId)         // get or lazily create per-node state
store.node(nodeId).cursor  // Signal<boolean> — readable/writable
```

Replaces `getOrCreate(nodeId)`. Always auto-creates — there's no "get without creating" use case.

### Components — read signals directly

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
  // ...
}
```

No mode enum. Each signal is independent. Components compose per visual aspect. ~3 components read these (TreeNode, CardColumn, NodeView) — inline logic, no abstraction needed.

### `useNode` hook

```ts
function useNode(nodeId: string): NodeState {
  return useNodeStore().node(nodeId)
}
```

Returns the node's signal state. Components subscribe granularly via `useSignal` — only re-render when a specific signal changes.

## Walk primitives

General-purpose tree iterators, reusable beyond the reduce system:

```ts
walk.up(nodeId, tree)                        // parent chain iterator
walk.down(nodeId, tree)                      // DFS via KTree.nodes
walk.down(nodeId, tree, { into: pred })      // filtered DFS (skip subtrees)
```

Shared by: tree reduces, navigation (j/k), search, outliner ops, visibility computation, count indicators.

Minimal tree interface — no dependency on Repo:

```ts
interface TreeAccess {
  parent(nodeId: string): string | null
  children(nodeId: string): readonly string[]
}
```

## Architecture — pure core + signal adapter

The tree reduce itself is **pure** — no signals, no React:

```ts
function treeReduce<T>(
  nodeId: string,
  source: (id: string) => T,
  walk: (id: string) => Iterable<string>,
  reducer: (acc: T, val: T) => T,
  initial: T
): T {
  let acc = initial
  for (const id of walk(nodeId)) {
    acc = reducer(acc, source(id))
  }
  return acc
}
```

The signal adapter wraps this:
1. Caches the result as a per-node `Signal<T>` (for `useSignal` subscription)
2. Tracks which source signals are dirty (changed since last batch)
3. On `batch()`, recomputes affected regions, diffs output, writes only changed signals

Same pattern as the `refs` table in the link model: pure function → cache → incremental update on change.

## V1 constraints

- **Boolean only** for `descendants()`/`ancestors()` sugar. General `update()` for non-boolean.
- **No filtered walks in derivations** — `into` predicates in tree reduces are a footgun (stale values in collapsed subtrees). Derivations run over the full structural tree. Visibility/collapse is a separate render concern.
- **No derived-from-derived** — a tree reduce cannot reference another tree reduce as its source. Keep the dependency graph flat for v1.
- **`includeSelf: false` by default** — `selectedAncestor` excludes self (the name says "ancestor", not "self or ancestor"). `cursorDescendant` excludes self.
- **Structural mutations** (reparent/move) need old-parent info for correct ancestor chain updates.

## What this replaces

| Old | New |
|-----|-----|
| `syncCursor()` | `batch()` + `cursor` signal + `cursorDescendant` reduce |
| `syncSelected()` + `expandWithDescendants()` | `batch()` + `selected` signal + `selectedAncestor` reduce |
| `cursorInDescendant` (card-only) | `cursorDescendant` (all nodes, via reduce) |
| `cursorCardNodeId` / `cursorColumnNodeId` / `cursorDepth` | Components read `cursorDescendant` on relevant ancestor |
| 3 different `isSelected` definitions | One `selected` signal + one `selectedAncestor` reduce |
| `shouldStripColor` computed 4 ways | Derive from `cursor` / `selectedAncestor` signals |
| Ad-hoc `excludedSigils` inheritance in `hydrate()` | `update()` reduce with merge |

## Performance

Per cursor move (j/k press):
- Dirty: 2 nodes (old cursor off, new cursor on)
- Walk: ~4 ancestors (for `cursorDescendant` up-propagation)
- Diff: ~8-10 nodes
- Signal writes: ~8-10
- Total: <0.1ms (current `syncCursor` is ~0.05ms — marginal overhead)

Rendering savings (the real win):
- Components read pre-computed boolean signals — O(1) during render (vs current O(depth) walks)
- Muted fast path: `selectedAncestor=true` → skip borders, strip colors, reduce render work
- Fewer re-renders: cursor move writes ~8 signals; current `syncSelected` marks 50+ nodes

## Future consumers

| Concern | Definition | Direction |
|---------|-----------|-----------|
| `cursorDescendant` | `descendants(s => s.cursor)` | up |
| `selectedAncestor` | `ancestors(s => s.selected)` | down |
| `excludedSigils` | `update(s => s.ownSigils, walk.down, concat, [])` | down (inherit+merge) |
| `hasErrorDescendant` | `descendants(s => s.hasError)` | up |
| `hasUnreadDescendant` | `descendants(s => s.isUnread)` | up |
| `searchMatchAncestor` | `descendants(s => s.searchMatch)` | up |
| `dimmedAncestor` | `ancestors(s => s.isDone)` | down |

Each = one line in the state definition. No sync functions, no ad-hoc tree walks.

See also: [data-model.md](data-model.md) for KNode structure, [selection-model.md](selection-model.md) for cursor/selection.
