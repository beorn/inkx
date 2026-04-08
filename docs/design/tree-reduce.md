# Reduced Signals

Per-node derived state as **reduced signals**: cached tree reductions, incrementally recomputed on change. Like `Array.reduce`, but over a tree walk.

## The idea

A reduced signal is a cached pure function over the tree. The store materializes it as a per-node signal. `batch()` incrementally recomputes dirty regions.

```ts
// Conceptually, this is all it computes:
cursorDescendant(nodeId) = tree.descendants(nodeId).some(id => cursor(id))
```

The signal caches the result. Dirty tracking recomputes only affected regions on change.

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

    // Reduced signals (cached tree reductions — recomputed on batch)
    cursorDescendant: tree.descendants(s => s.cursor).some(),
    selectedAncestor: tree.ancestors(s => s.selected).some(),
    excludedSigils: tree.ancestors(s => s.ownSigils).reduce(concat, []),
    errorCount: tree.descendants(s => s.hasError).count(),
  }),
  tree: treeAccess,
})
```

Reads as English: "cursorDescendant: **some** of my tree **descendants** have **cursor**."

### `tree.ancestors` / `tree.descendants` — declarative

Create reduce descriptors for state definitions. The direction is the **node's perspective** — "look at my ancestors" or "look at my descendants."

```ts
tree.ancestors(accessor)     // "values from my ancestors"
tree.descendants(accessor)   // "values from my descendants"
```

Returns an intermediate with standard iterator-like combinators:

```ts
.some()                      // boolean: any match? (default for boolean signals)
.every()                     // boolean: all match?
.count()                     // number: how many?
.reduce(reducer, initial)    // T: custom aggregation
.find()                      // T | undefined: first match
```

Same vocabulary as `Array.prototype` and TC39 Iterator Helpers. Nothing custom to learn.

### `tree.up` / `tree.down` — imperative

Walk the tree in loops, navigation, search, outliner ops. Takes a nodeId, returns an iterator:

```ts
tree.up(nodeId)                    // parent chain → Iterable<string>
tree.down(nodeId)                  // DFS → Iterable<string>
tree.down(nodeId, { into: pred })  // filtered DFS (skip subtrees)
```

### The split

| | `ancestors` / `descendants` | `up` / `down` |
|---|---|---|
| **Purpose** | Declare what to compute | Walk the tree now |
| **Takes** | Signal accessor | Node ID |
| **Returns** | Reduce descriptor | `Iterable<string>` |
| **Used in** | State definitions | Loops, navigation, search |
| **Perspective** | "Look at my ancestors/descendants" | "Walk up/down from here" |

Both live on `tree`. One is declarative, the other imperative. The declarative form uses the imperative form internally.

### Batch

```ts
store.batch(tree, () => {
  store.node(oldId).cursor(false)
  store.node(newId).cursor(true)
})
```

Signal writes inside the callback are collected. Reduced signals recompute once at the end — only affected regions, only changed values written. Can't forget to propagate.

### `store.node(id)`

```ts
store.node(nodeId)           // get or lazily create per-node state
store.node(nodeId).cursor    // Signal<boolean>
```

Always auto-creates. Replaces `getOrCreate()`.

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

No mode enum. Each signal is independent. ~3 components read these — inline logic, no helper abstraction.

## How the store recognizes reduced signals

Duck-typed. No markers needed:

- `signal(false)` — alien-signals are **callable functions**
- `tree.descendants(s => s.cursor).some()` — returns a **plain object** with a `.reduce` property

The store checks: function → primary signal. Object with `.reduce` → reduced signal descriptor. Materializes accordingly.

## How it works

A reduced signal is a cached pure function. The pure core has no signals, no React:

```ts
let acc = initial
for (const id of tree.up(sourceNodeId)) {   // ← uses the imperative iterator
  acc = reducer(acc, readSignal(id))
}
return acc
```

The store wraps this with:
1. **Cache** — result stored as a per-node `Signal<T>` for `useSignal` subscription
2. **Dirty tracking** — which source signals changed since last batch
3. **Incremental recomputation** — on `batch()`, recompute only affected regions, diff, write only changed signals

Same pattern as the `refs` table in the [link model](links.md): pure function → cache → incremental update on change.

### Tree access

Minimal interface — no dependency on Repo:

```ts
interface TreeAccess {
  parent(nodeId: string): string | null
  children(nodeId: string): readonly string[]
}
```

## Constraints (v1)

- **No filtered walks in reduced signals** — `into` predicates create stale values in collapsed subtrees. Reduce over the full structural tree; visibility is a separate render concern.
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
| Ad-hoc sigil inheritance in `hydrate()` | `tree.ancestors(s => s.ownSigils).reduce(concat, [])` |

## Performance

Per cursor move (j/k): ~8-10 signal writes, <0.1ms. The real win is rendering — components read O(1) pre-computed signals instead of O(depth) tree walks during render.

## Future consumers

| Signal | Definition |
|--------|-----------|
| `cursorDescendant` | `tree.descendants(s => s.cursor).some()` |
| `selectedAncestor` | `tree.ancestors(s => s.selected).some()` |
| `excludedSigils` | `tree.ancestors(s => s.ownSigils).reduce(concat, [])` |
| `hasErrorDescendant` | `tree.descendants(s => s.hasError).some()` |
| `hasUnreadDescendant` | `tree.descendants(s => s.isUnread).some()` |
| `errorCount` | `tree.descendants(s => s.hasError).count()` |
| `dimmedAncestor` | `tree.ancestors(s => s.isDone).some()` |

Each = one line in the state definition.

See also: [data-model.md](data-model.md) for KNode structure, [links.md](links.md) for the same cache pattern.
