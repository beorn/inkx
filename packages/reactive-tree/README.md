# @km/reactive-tree

Per-node signals plus tree-scoped computeds, backed by
[alien-signals](https://github.com/stackblitz/alien-signals). A materialized-view
engine over any tree: writable state per node, declarative aggregates across
ancestors or descendants, sparse indices for O(depth) writes and O(1) reads.

Pulled out of km-tui as a standalone package so other km subsystems (and, later,
non-km consumers) can share the engine. The DSL has survived three rewrites —
it is the bit worth keeping.

## Install

```jsonc
// package.json
{
  "dependencies": {
    "@km/reactive-tree": "workspace:*",
    "alien-signals": "^3.1.2",
  },
}
```

## Example

```ts
import { signal } from "alien-signals"
import { reactiveTree, type Traversal } from "@km/reactive-tree"

const parent: Record<string, string | null> = { root: null, col: "root", card: "col", sub: "card" }
const children: Record<string, string[]> = { root: ["col"], col: ["card"], card: ["sub"], sub: [] }
const traversal: Traversal = {
  parent: (id) => parent[id] ?? null,
  children: (id) => children[id] ?? [],
}

const store = reactiveTree(
  (tree) => ({
    // Writable state (per node)
    cursor: signal(false),
    selected: signal(false),
    ownSigils: signal([] as string[]),

    // Declarative aggregates (cached computeds)
    cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
    selectedAncestor: tree.ancestors((s: { selected: unknown }) => s.selected).some(),
    excludedSigils: tree
      .ancestors((s: { ownSigils: unknown }) => s.ownSigils)
      .reduce(
        (acc: string[], v) => {
          const arr = v as string[]
          return arr.length === 0 ? acc : [...acc, ...arr]
        },
        () => [] as string[],
        { includeSelf: true },
      ),
  }),
  traversal,
)

store.get("sub").cursor(true)
store.get("col").cursorDescendant() // true  — cached computed
store.get("root").cursorDescendant() // true
```

## DSL

Each entry in the schema is either a writable signal (`signal(init)`) or a
declarative descriptor built from the `tree` argument:

```ts
tree.descendants(s => s.key).some()                           // boolean
tree.descendants(s => s.key).count()                          // number
tree.descendants(s => s.key).reduce(reducer, initial, opts?)  // reduced
tree.ancestors(...)                                            // same shape, walking up
```

`.some()` / `.count()` accept `{ includeSelf?: boolean }`. `.reduce()` also
accepts `equals` for cheap stability checks.

## Engine classification

| Shape                                  | Strategy                                       | Cost                      |
| -------------------------------------- | ---------------------------------------------- | ------------------------- |
| `descendants(...).some()` / `.count()` | Sparse ancestor index                          | O(depth) write, O(1) read |
| `ancestors(...).some()` / `.count()`   | Walk-up per read                               | O(depth) per read         |
| `.reduce(...)`                         | Walk-based (needs values, not just membership) | O(subtree) per read       |

The sparse-ancestor-index inversion is what makes 500K-node vaults viable: on
cursor moves, `cursorDescendant` reads cost O(1) instead of O(subtree). See
[`docs/lessons/reactive-tree.md`](../../docs/lessons/reactive-tree.md) in the
km repo for the history.

## Traversal

```ts
interface Traversal {
  parent(id: string): string | null
  children(id: string): readonly string[]
}
```

Duck-typed: the engine never assumes how your tree is stored. When topology
changes, call `store.rebind(newTraversal)` — writable signal values and node
identities are preserved, so React subscriptions stay valid across rebinds.

## API

```ts
interface ReactiveTree<T> {
  get(id: string): NodeAccessor<T> // lazy-creates on first access
  has(id: string): boolean
  clear(): void // drop all nodes + indices
  readonly size: number
  rebind(traversal: Traversal): void // swap in a new traversal, keep signals
}
```

`NodeAccessor<T>` exposes every signal as a typed `(value?) => value` function
and every computed as a zero-arg getter.

## Tests

```bash
bun vitest run packages/reactive-tree/tests/
```

Covers: signals, sparse-some/-count correctness, `.reduce()` with equals,
`includeSelf`, lifecycle (clear, has, rebind), atomicity (no glitches under
batched writes), re-entrancy, and bootstrap ordering.
