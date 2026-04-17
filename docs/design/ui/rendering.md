# View — Rendering (km's view layer)

How km's view layer renders nodes. Covers: per-node visual specification (collapse states, body, embed expansion), per-node reactive computeds (the signal bag that drives rerenders), and tree-reduce aggregation (fold-depth computation).

This is km's view layer, not silvery's pipeline. Silvery owns incremental rendering, dirty flags, and ANSI output; see [`vendor/silvery/docs/guide/architecture.md`](../../../vendor/silvery/docs/guide/architecture.md) for that.

For visibility rules (which nodes participate), see [visibility.md](visibility.md). For board/outliner layout, see [layout.md](layout.md).

---

# Node Visual Spec — State × Role Matrix

Single source of truth for how every node state maps to visual treatment across all roles. If it's not in this table, it's not a rule. If the code disagrees with this table, the code is wrong.

Replaces the 8-rule comment in `selection-style.ts` and the scattered implementation across 6+ files.

## Roles (determined by depth from board root)

| Role | Depth | Component | What it looks like |
|------|-------|-----------|-------------------|
| Board | 0 | Board.tsx | Fullscreen container |
| Column | 1 | CardColumn (column section) | Header bar + card list |
| Card | 2 | CardColumn (card section) | Bordered box with title + body + sub-items |
| Sub-item | 3+ | TreeNode | Indented line within a card |
| Body | any | TreeNode (no item) | Leaf content block within a card/sub-item |

## States (from reduced signals)

| Signal | Meaning |
|--------|---------|
| `cursor` | I am the cursor node |
| `selected` | I am in the multi-selection set (shift-selected, not cursor) |
| `cursorDescendant` | A descendant of mine has the cursor |
| `selectedAncestor` | An ancestor of mine is selected — I should be muted |
| `editingDescendant` | A descendant of mine is being edited |
| `editing` | I am being edited (inline text input active) |
| `isDone` | Task with done/dropped status |
| `doneAncestor` | An ancestor is done — I should be dimmed |
| `hovered` | Mouse is hovering over me |

## The Matrix

### Background

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | $selection-bg tint | — | — | — |
| selected | — | — | selectedBg (14%) | selectedBg on title row |
| cursorDescendant | — | — | — | — |
| selectedAncestor (muted) | — | mutedBg (6%) | mutedBg, no border | mutedBg |
| editing | — | — | — | — |
| editingDescendant | — | — | — | — |
| hovered | — | — | hoverBorder | — |
| normal | — | — | default border | — |

### Title / head row

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | — | inverseBg + $selection fg | inverseBg + $selection fg | inverseBg + $selection fg |
| selected | — | — | selectedBg on title row | selectedBg on title row |
| cursorDescendant | — | $selection fg + underline | yellow fg (not inverse) | — |
| selectedAncestor | — | dim | dim | dim |
| normal | — | default | default | default |

### Border

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | — | — | $selection-bg (yellow) | — |
| selected | — | — | $selection-bg | — |
| cursorDescendant (breadcrumb) | — | $selection-bg underline | $selection-bg border | — |
| selectedAncestor (muted) | — | — | none (border hidden) | — |
| hovered | — | — | hover color | — |
| normal | — | $surface-bg | $muted | — |

### Strip colors (inline content loses fg colors)

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | — | — | yes (title row only) | yes (title row only) |
| selectedAncestor (muted) | — | yes | yes | yes |
| isDone / doneAncestor | — | yes | yes | yes |
| normal | — | no | no | no |

### Expand (show all children, override fold)

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| editingDescendant | — | — | expand to show editing child | — |
| cursor (direct) | — | — | expand | — |
| normal | — | — | respect fold | — |

### Dim (entire content dimmed)

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| isDone / dropped | — | dim all | dim all | dim all |
| doneAncestor | — | dim | dim | dim |
| body block (non-cursor) | — | — | dimColor | dimColor |
| normal | — | — | — | — |

### Overflow indicators ("+N more")

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor/selected container | — | — | inherits card bg tint | — |
| normal | — | — | dimColor | — |

## Composition rules

States are **not mutually exclusive**. When multiple states apply, visual properties compose per-aspect:

1. **bg**: cursor wins > selected > muted > normal (first match)
2. **border**: breadcrumb wins > selected > hovered > muted (hidden) > normal
3. **strip colors**: cursor OR muted OR done → yes
4. **dim**: done/doneAncestor → yes (regardless of other states)
5. **expand**: editingDescendant OR cursor-direct → expand

A node CAN be: selected + cursorDescendant + editingDescendant simultaneously. bg comes from `selected`, border from `cursorDescendant` (breadcrumb), expand from `editingDescendant`.

## Token reference

| Token | Value | Used for |
|-------|-------|----------|
| `$selection-bg` | yellow-ish | Cursor inverse bg, breadcrumb borders |
| `$selection` | dark on yellow | Cursor inverse fg |
| `selectedBg(theme)` | blend(bg, primary, 14%) | Multi-selected card/sub-item bg |
| `mutedBg(theme)` | blend(bg, primary, 6%) | Muted (ancestor selected) bg |
| `$muted` | gray | Default card border, dimmed text |
| `$surface-bg` | subtle | Column border |

## Signals → visual mapping (what components actually read)

```tsx
// Card component
const { cursor, selected, cursorDescendant, selectedAncestor,
        editingDescendant, editing } = readSignals(nodeId)

const bg = cursor ? undefined          // title-only inverse, not container
  : selected ? selectedBg
  : selectedAncestor ? mutedBg
  : undefined

const border = cursor || cursorDescendant ? '$selection-bg'
  : selected ? '$selection-bg'
  : hovered ? hoverColor
  : selectedAncestor ? bg             // invisible — border matches bg, no layout shift
  : '$muted'

// Hover is universal — same treatment on any card (breadcrumb or not).
// Shows what clicking would select, not current state.

const stripColors = cursor || selectedAncestor || isDone
const expand = editingDescendant || cursor
```

## Open questions (resolved)

- ~~Should board-level cursor show ANY visual treatment?~~ **Yes** — board-level cursor tints everything with $selection-bg. Confirmed by user 2026-04-08.

## Open questions (resolved)

- ~~Should muted cards hide their border entirely or show it as the bg color?~~ **Hide border** — set border color to match bg (invisible), but keep the border space (no layout shift). Muted = parent column/board is selected, so children are de-emphasized.
- ~~When cursor is on a sub-item, should the parent card show selectedBg?~~ **No selectedBg** — the card title shows yellow fg (cursorDescendant breadcrumb), optionally with a faint selectedBg tint on the title row only. No full-card selectedBg.
- ~~Should `hovered` and `cursorDescendant` compose?~~ **Hover is universal** — hovered on any card (including breadcrumb cards) shows the same hover treatment. Hover indicates "click here to select this card" — it previews the selection target, not the current state.

## Notes

- **Deselected state** (cursor=null, all signals false) is a valid state — all nodes render as "normal". See [selection-state-spec.md](selection-state-spec.md).
- **Editing border**: editing card gets bold `$focusborder` (not `$selection-bg`), per selection-state-spec.md. This distinguishes edit scope from cursor scope visually.
- **Visible vs structural**: this spec describes visual treatment per node. State propagation uses structural tree walks (tree.ancestors/descendants). Range selection uses visible order. See [tree-reduce.md](tree-reduce.md).

## See also

- [tree-reduce.md](tree-reduce.md) — the signal propagation system
- [selection-state-spec.md](selection-state-spec.md) — 5 state concepts, mode ladder, interaction matrix
- [data-model.md](data-model.md) — visual roles are positional, not typed
- `apps/km-tui/src/views/selection-style.ts` — old rules (to be replaced by this spec)


---

# Per-Node View Computeds: Architecture Assessment

> **Status: historical design doc.** The migration this assessed is **done**.
> The current architecture uses `createViewTree()` (in
> `packages/km-board/src/view-tree-projection.ts`) which wraps a `TreeLens`
> with per-node signal bags via `ProjectedMap`. React components subscribe via
> `useNode(id)` and re-render only when *that node's* state changes. The old
> `buildViewTree` / `ViewSnapshot` path referenced throughout this doc was
> deleted in commit `2910f2dd8` (refactor(board): delete view-tree.ts +
> view-snapshot.ts).
>
> See [docs/design/ui/visibility.md](visibility-model.md) and the
> `ViewTree` / `TreeLens` glossary entries for the current architecture. This
> doc is preserved for historical context — the trade-off analysis (perf,
> incrementality, debuggability, testing) is still useful as a record of why
> the per-node projection was chosen.

Research-only assessment of replacing the single `PaneSignals.view` computed (which
rebuilds the entire ViewSnapshot) with a network of fine-grained per-node reactive
derivations.

> **Reminder**: throughout this doc, references to `buildViewTree`,
> `ViewSnapshot`, and `PaneSignals.view` describe the *previous* architecture
> (deleted in commit `2910f2dd8`). The "Current Architecture" section below
> means "current as of when this assessment was written," not "current as of
> today." For the actual current architecture, see
> [docs/design/ui/visibility.md](visibility-model.md) and the
> `TreeLens` / `ViewTree` glossary entries.

## 1. Architecture at the time this assessment was written

```
PaneSignals.view = computed(() => createViewSnapshot(repo, rootId(), foldDepths()))
  deps: repoVersion, rootId, foldDepths
  outputs: ViewNode tree, ViewIndex map, walkOrder array, classify/next/prev
```

**One computed, three inputs.** Any change to repoVersion, rootId, or foldDepths
rebuilds the entire tree. The ViewNodeColumnCache provides one level of
memoization: unchanged columns (same children array reference) reuse cached
subtrees.

**Consumers:**
- `Board.tsx` — sole `useSignal(ps.view)` subscriber; derives columns, nodeIndex
- `board-app.ts` — reads `ps.view()` imperatively in `buildOpCtx` for navigation
- `board-app-store.ts` — reads `ps.view()` for selection adapter sync
- `Board.tsx` — writes fold/selection signals directly to `NodeStore` after tree rebuild

## 2. Dependency Graph: ViewNode Field x Input Trigger

| ViewNode field      | Depends on               | Changes on cursor move? | Changes on fold? | Changes on zoom? | Changes on mutation? | Changes on filter? |
|---------------------|--------------------------|:-:|:-:|:-:|:-:|:-:|
| `id`                | KNode.id (static)         | - | - | Y* | Y | - |
| `role`              | Tree position (depth)     | - | - | Y  | Y | - |
| `node`              | KNode reference           | - | - | Y  | Y | - |
| `parent`            | Parent ViewNode           | - | - | Y  | Y | - |
| `children`          | getChildren + filters     | - | Y (partial) | Y | Y | Y |
| `isBody`            | extractBody classification| - | - | Y  | Y | - |
| `resolvedEmbed`     | embed_of + getNode      | - | - | -  | Y | - |
| `rules`             | parseHeadingRules(content)| - | - | -  | Y | - |

**Key finding:** Cursor move (j/k) does NOT change ANY ViewNode field. The view
tree is structurally identical before and after a cursor move. The cursor lives
entirely in the selection store (`sel.node.cursor()`) and in
`NodeStore` cursor signals (written directly by Board.tsx). The current architecture already handles this
correctly: `ps.view` does not depend on cursor, so j/k does not trigger a
ViewSnapshot rebuild.

\* "Y" means the field MAY change for SOME nodes, not all.

### What Each Trigger Actually Invalidates

| User action          | Current: full rebuild? | Ideal: what changes?              |
|----------------------|:----------------------:|-----------------------------------|
| **Cursor move (j/k)**   | NO (not a dep)     | Nothing in view tree              |
| **Fold toggle (z)**     | YES                | One subtree's children collapse   |
| **Zoom (Z/Enter)**      | YES                | Entire tree (new root)            |
| **Repo mutation**        | YES                | 1-2 nodes + their column          |
| **Filter change**        | YES (hiddenNodeIds)| Cards matching filter criteria    |

The single computed already skips cursor moves because cursor is not a
dependency. This means the most frequent user action (navigation) is already
optimal.

## 3. alien-signals Lifecycle Analysis

alien-signals v3.1.2 internals (from `esm/index.mjs` and `esm/system.mjs`):

### Can computeds be garbage collected?

**Partially.** alien-signals uses a doubly-linked subscriber list
(`subs`/`subsTail`). A computed with no subscribers triggers the `unwatched()`
callback, which purges its dependency links (`purgeDeps`). After that, the
computed's internal node holds no references to deps, making it eligible for GC
if no external code retains the function.

However, there is no explicit `dispose()` API for computeds. The cleanup path is:
1. All effects/computeds that read this computed stop reading it
2. `unwatched()` fires, purging dep links
3. The closure is GC'd when unreferenced

For a Map of per-node computeds, you would need to manually remove entries from
the Map for deleted nodes. The signal itself becomes inert once unlinked, but
the Map reference prevents GC.

### Creation/disposal overhead

Each `computed()` call creates one object with 7 fields (`value`, `subs`,
`subsTail`, `deps`, `depsTail`, `flags`, `getter`) plus a `Function.bind()`.
This is ~80-100 bytes per computed. For 1000 nodes with 5 computeds each: ~400KB
of signal overhead. Not prohibitive, but not trivial.

Disposal requires unlinking from all deps and subs — O(number of deps). For
tree nodes with 2-4 deps each, this is constant time per node.

### Dependency tracking scalability

The graph is a doubly-linked list per dep→sub relationship. `propagate()` and
`checkDirty()` walk the graph with explicit stacks. Cost is proportional to
the number of subscribers that need notification, not the total graph size.

With 1000 nodes and 5 computeds per node, a single signal change would
propagate to its direct subscribers only. A `repoVersion` bump would propagate
to ALL 5000 computeds (since every node's `children` computed depends on repo
state). This is worse than the current architecture where ONE computed rebuilds
the tree.

**Critical insight:** The propagation cost scales with subscriber count. A
single `repoVersion` signal with 5000 computed subscribers would trigger 5000
dirty checks, each requiring a `checkDirty` walk. The current single computed
triggers ONE rebuild that takes 0.085ms. 5000 dirty checks would likely be
slower.

## 4. Per-Node API Sketch

```typescript
interface NodeViewSignals {
  // Core derivations
  readonly role: Computed<ViewRole>
  readonly children: Computed<ViewNode[]>
  readonly isBody: Computed<boolean>
  readonly resolvedEmbed: Computed<KNode | undefined>
  readonly rules: Computed<NodeRules | undefined>

  // Lifecycle
  dispose(): void
}

interface ViewSignalStore {
  // Get or lazily create signals for a node
  get(nodeId: string): NodeViewSignals

  // Top-level tree derivation
  readonly columns: Computed<string[]>  // column node IDs
  readonly walkOrder: Computed<string[]> // DFS order

  // Lifecycle — called when nodes are added/removed from tree
  onNodeAdded(nodeId: string): void
  onNodeRemoved(nodeId: string): void
}
```

### Virtual Nodes (__body__ columns)

Virtual nodes are synthetic — they don't exist in the repo. Their existence
depends on whether the root has body content nodes. This requires a top-level
computed that derives "does body column exist?" from repo children + content
checks. The body column's children computed then derives its card list.

This is already more complex than the current approach where `buildViewTree`
handles body extraction as a simple procedural step.

### Embed Resolution

Embeds make the visual parent differ from the data parent. Currently
`buildCardNode` resolves this at construction time: `resolvedEmbed =
repo.getNode(node.embed_of)`. With per-node computeds, each card needs a
computed that resolves its embed, and its `children` computed must read from
the resolved embed's children rather than its own.

This creates a two-level dependency chain: `embedTarget` -> `children`. Changes
to embed targets (rare) would correctly invalidate only the affected card.

### walkOrder / nextInWalk

Walk order is inherently global — it depends on every node's children list.
Two options:

1. **Lazy DFS (current):** `nextInWalk(id)` walks the tree on demand. O(1)
   amortized. Works with both architectures.

2. **Per-node next/prev computeds:** Each node's `next` depends on its parent's
   `children`. Changing one parent's children invalidates the `next` of all
   siblings. 1000 nodes = 1000 `next` computeds, most invalidated on any
   structural change.

Option 1 is clearly better. The current `ViewSnapshot.nextInWalk()` is already
O(1) tree traversal.

### Map Lifecycle

```typescript
// On repo mutation:
const addedIds = newNodeIds.difference(oldNodeIds)
const removedIds = oldNodeIds.difference(newNodeIds)
for (const id of removedIds) store.get(id).dispose(); store.delete(id)
for (const id of addedIds) store.get(id) // lazy create
```

This requires diffing the node set on every repo mutation — currently handled
implicitly by `buildViewTree` which simply rebuilds the tree.

## 5. Cost-Benefit Analysis

### Benefits of Per-Node Computeds

1. **Skip unchanged component re-renders:** If a mutation affects column A, only
   column A's cards re-render. Currently, `useSignal(ps.view)` triggers Board
   re-render, which re-derives `columns`, and React.memo on Card/Column
   components already skips unchanged nodes via props comparison.

2. **Fine-grained filter updates:** Toggling a filter could invalidate only
   matching nodes' `children` computeds. Currently rebuilds full tree.

3. **Theoretical composability:** Per-node signals compose naturally with
   `NodeStore`'s existing per-node interactive state.

### Costs of Per-Node Computeds

1. **Lifecycle management:** Must track node creation/removal, dispose signals,
   handle virtual nodes, manage the Map. Currently zero lifecycle code — the
   tree is rebuilt from scratch each time.

2. **Propagation fan-out:** `repoVersion` signal would fan out to ALL node
   computeds. This replaces one 0.085ms tree build with potentially thousands
   of dirty checks. Likely SLOWER for repo mutations.

3. **Virtual node complexity:** Body columns, detail metadata, folder-index
   expansion — all require special-case logic that's currently simple procedural
   code inside `buildViewTree`.

4. **Index file expansion:** `expandIndexFileViewNodes` does slot resolution,
   body extraction, and sibling ordering that depends on the full set of
   children. This is inherently top-level — cannot be decomposed into per-node
   computeds without duplicating the slot resolution logic.

5. **Embed resolution cycles:** Embeds can chain (A embeds B which embeds C).
   Per-node computeds for embed resolution create potentially long dependency
   chains that alien-signals must evaluate sequentially.

6. **Testing complexity:** Current architecture: pure function in, tree out.
   Per-node: must test signal lifecycle, disposal, incremental updates, stale
   references. Much harder to reason about.

7. **Debugging complexity:** Current: breakpoint in `buildViewTree`, inspect
   tree. Per-node: must trace signal propagation through the reactive graph.

### Performance Reality Check

- **buildViewTree:** 0.085ms for 670 nodes. At 60fps that's 0.5% of frame budget.
- **Cursor move (j/k):** Does NOT rebuild the tree. Only updates selection signals.
- **React reconciliation:** `React.memo` on Card and Column already prevents
  re-rendering unchanged components. The `columns` useMemo returns the same
  array reference when the view snapshot hasn't changed.
- **Column-level cache:** The `ViewNodeColumnCache` already provides incremental
  updates — unchanged columns reuse cached subtrees. This captures most of the
  benefit of per-node reactivity at the column granularity.

The current architecture's bottleneck is NOT the view tree build. It's the React
reconciliation of the component tree after a view change. Per-node computeds
would help here only if they eliminated the `useSignal(ps.view)` subscription
that triggers Board re-render. But Board needs columns to lay out the grid, so
it must subscribe to structural changes regardless.

## 6. Prior Art: How Other Frameworks Handle Reactive Trees

### SolidJS Fine-Grained Reactivity

SolidJS uses `createSignal` per piece of state and `createMemo` for derivations.
For tree structures, the pattern is:

```jsx
function TreeNode({ node }) {
  const children = createMemo(() => store.getChildren(node.id))
  return <For each={children()}>{child => <TreeNode node={child} />}</For>
}
```

Key difference: SolidJS has no virtual DOM. Components run ONCE (not on every
render). Fine-grained signals directly update DOM nodes. This makes per-node
signals strictly necessary — there's no reconciler to diff.

**km uses React.** React's reconciler already diffs component trees. Per-node
signals in React are used to skip useSyncExternalStore subscriptions, but the
component still re-renders when its signal changes. The benefit is smaller
because React.memo already handles most skip-rendering.

### MobX Observable Trees

MobX uses `observable` per field and `computed` for derivations. The
`mobx-state-tree` (MST) library provides per-node observability:

```typescript
const TreeNode = types.model({ children: types.array(TreeNode) })
```

MST manages lifecycle automatically — nodes are "alive" when attached to the
tree, disposed when detached. This automatic lifecycle is the key enabler.

alien-signals has no equivalent lifecycle management. You'd need to build it
manually.

### Jotai atomFamily

Jotai's `atomFamily` creates atoms keyed by parameter:

```typescript
const nodeAtom = atomFamily((id) => atom((get) => computeNode(id, get)))
```

Atoms are created lazily and garbage collected when no component subscribes.
This matches the "Map<nodeId, signals>" pattern. But Jotai atoms are designed
for React — they integrate with useSyncExternalStore and React's lifecycle.

alien-signals computeds don't have this automatic GC-on-unsubscribe behavior
in the way Jotai atoms do when used with React.

### SignalDB Per-Record Signals

SignalDB wraps each database record in a signal. Queries return computed
collections. This is closest to km's architecture where `repo.getChildren()`
returns per-parent child arrays.

km's `Reactive` store (km-storage) already does this — `nodeState(id)` and
`childIdsState(parentId)` are per-record signals. The view tree sits one layer
above, deriving visual structure from data signals. Per-node view computeds
would add a second signal layer between data signals and React components.

## 7. Recommendation

**Do not adopt per-node view computeds now.** The complexity cost far outweighs
the performance benefit for km's current and foreseeable scale.

### Why

1. **The hot path is already optimal.** Cursor movement (j/k) — the most
   frequent user action by orders of magnitude — does not rebuild the view tree.
   It only updates selection signals in `NodeStore`.

2. **Column-level caching already provides 80% of the benefit.** The
   `ViewNodeColumnCache` means that a mutation in column A only rebuilds column
   A's subtree. Unchanged columns are O(1) cache hits.

3. **The tree build is already fast.** 0.085ms for 670 nodes is negligible. Even
   at 2000 nodes, linear scaling puts this at ~0.25ms — still under 2% of frame
   budget at 60fps.

4. **alien-signals propagation fan-out would hurt.** A `repoVersion` bump
   currently triggers ONE computed. With per-node computeds, it would fan out to
   thousands of dirty checks, likely SLOWER than the current single rebuild.

5. **Lifecycle complexity is high.** Virtual nodes, embeds, index-file expansion,
   and slot resolution all require special handling that is trivial in procedural
   tree-building but complex in reactive derivations.

### Trigger Conditions: When to Reconsider

Revisit this decision if ANY of these become true:

| Trigger | Threshold | Why |
|---------|-----------|-----|
| Tree build time | >5ms (measured) | Currently 0.085ms. Would need 50x growth. |
| React reconciliation | >16ms after view change | Board component tree is too deep to reconcile |
| Node count | >10,000 visible nodes | Linear scaling of buildViewTree becomes noticeable |
| Incremental edits | Typing in one cell rebuilds all columns | Need per-cell reactivity for live editing |
| Browser port | silvery runs in browser with React DOM | DOM diffing cost makes skipping components critical |
| Collaboration | Multiple cursors + real-time sync | Per-node invalidation needed for merge efficiency |

### What to Do Instead

1. **Keep the current single computed + column cache.** It's fast, simple, and
   correct.

2. **Profile actual bottlenecks.** If rendering is slow, the problem is more
   likely in React component rendering (deep trees, many useSignal hooks) than
   in view tree building.

3. **If column-level caching is too coarse,** add card-level caching to
   `buildCardNode` (same pattern as `buildColumnNodeCached`). This would be a
   10-line change vs. the 500+ line per-node reactive architecture.

4. **For live editing performance,** use the existing `NodeStore` edit
   signal to skip re-rendering non-editing cards. This is already implemented.

### Key Risks If Adopted Later

| Risk | Mitigation |
|------|------------|
| Signal lifecycle leaks (nodes removed but signals not disposed) | Use a generational GC: tag signals with tree version, sweep stale |
| Propagation thundering herd (repoVersion fans to all nodes) | Shard by column: each column gets its own version signal |
| Virtual node signal identity (body columns change ID on zoom) | Use stable virtual IDs scoped to root, not global singletons |
| Embed chains creating deep dependency graphs | Limit embed resolution depth (already 1 level in practice) |
| Testing regression (stateful signals harder to test than pure functions) | Keep `buildViewTree` as the reference implementation; test signals against it |


---

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
const store = reactiveTree((tree) => ({
  // Signals — writable per-node state
  cursor: signal(false),
  selected: signal(false),
  editing: signal(false),
  ownSigils: signal([]),

  // Computeds — derived from tree walks, cached by alien-signals
  cursorDescendant: tree.descendants(s => s.cursor).some(),
  selectedAncestor: tree.ancestors(s => s.selected).some(),
  excludedSigils: tree.ancestors(s => s.ownSigils).reduce(concat, () => []),
}), visibleLens)  // any { parent, children }
```

Reads as English: "cursorDescendant: **some** of my tree **descendants** have **cursor**."

The factory receives a tree DSL builder; the second argument binds the traversal. Signals are plain alien-signals. Computeds compile to `computed(() => walk + aggregate)` — alien-signals handles dependency tracking, caching, and batching.

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

Always auto-creates (factory function, no class).

### Components

```tsx
function TreeNode({ nodeId }) {
  // One hook, all per-node state — reads like pseudocode
  const n = useTreeNode(nodeId)
  const cursor = n.cursor()
  const muted = n.selectedAncestor()
  const breadcrumb = n.cursorDescendant()
  const dimmed = n.doneAncestor()

  // States compose — NOT mutually exclusive
  const bg = cursor ? inverseBg : muted ? mutedBg : normalBg
  const border = breadcrumb ? yellowBorder : normalBorder
  const stripColors = cursor || muted || dimmed
}
```

No mode enum. Each signal is independent. `useTreeNode(nodeId)` returns the typed accessor from `store.get(nodeId)` wrapped in React subscription. Composition rules live in [node-visual-spec.md](node-visual-spec.md) — the state × role matrix that defines how signals map to visual treatment per component.

## How the store recognizes reduced signals

Descriptors are branded with a symbol:

```ts
const REDUCED = Symbol.for('km:reduced')

// tree.descendants(s => s.cursor).some() returns:
{ [REDUCED]: true, walk, accessor, reducer, initial }
```

The store checks: `value[REDUCED]` → reduced signal descriptor, materialize it. Otherwise → primary signal. No duck-typing ambiguity.

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

## Semantics

### Self-inclusion

`includeSelf: false` by default. `selectedAncestor` excludes self (the name says "ancestor"). `cursorDescendant` excludes self. Override with `{ includeSelf: true }` on the combinator if needed.

### Order

- `tree.ancestors` walks root-to-self (outermost first). Reducers accumulate outside-in.
- `tree.descendants` walks DFS pre-order (parent before children). Reducers accumulate top-down.
- For commutative reducers (`or`, `count`) order doesn't matter.
- For order-sensitive reducers (`concat`) the traversal order is the reduce order.

### Reparent / move / delete

When a node moves from parent A to parent B during a batch:
- **Up-propagated signals**: old ancestor chain (via A) must be recomputed — contributions from the moved node are removed. New ancestor chain (via B) gets contributions added.
- **Down-propagated signals**: the moved subtree's inherited values recompute from the new parent's boundary value.
- **Deleted nodes**: removing a source node clears its contributions from all affected ancestors/descendants. The node's own signals are cleaned up.

The store must capture old-parent info before structural mutations to correctly update old ancestor chains. batch() processes structural changes before recomputing reduced signals.

### Visible vs structural order

`tree.up` / `tree.down` and `tree.ancestors` / `tree.descendants` walk the **structural tree** (parent/child pointers). This is correct for state propagation (cursorDescendant, selectedAncestor, excludedSigils).

Range selection (shift+j/k) uses **visible order** — structural order minus collapsed/filtered/hidden nodes. This requires the ViewTree / visible lens, not tree.up/down. See [selection-state-spec.md](selection-state-spec.md) for the distinction.

### Detached / root nodes

A node with `parent === null` is a root. `tree.ancestors` yields nothing for it. `tree.descendants` walks its subtree normally.

## Complexity contracts

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Query concern on node | O(1) | Pre-computed, cached signal |
| Update a leaf concern (cursor move) | O(depth) | Propagate up ancestor chain |
| Move/reparent subtree | O(depth_old + depth_new + subtree) | Old chain subtract, new chain add |
| Subtree insert/remove | O(subtree + ancestor propagation) | |

Internally, descendant aggregates use **counts, not booleans**. Example: 2 selected descendants under an ancestor, remove one — boolean clears to false (wrong), count decrements to 1 (correct). The public API (`.some()`) returns boolean from the count.

## Writes outside batch()

Writes outside `batch()` are auto-batched: each write triggers an immediate micro-batch that recomputes affected reduced signals. This is safe but less efficient than explicit `batch()` — use `batch()` when multiple signals change together (cursor move = 2 writes → 1 batch, not 2 micro-batches).

## Equality / change detection

For primitive types (boolean, number), `Object.is` equality. For non-primitive types (arrays like `excludedSigils`), the reduce descriptor can specify a custom `equals` function:

```ts
excludedSigils: tree.ancestors(s => s.ownSigils).reduce(concat, [], { equals: arrayShallowEqual })
```

Without custom `equals`, array-valued signals use reference equality and may write on every recomputation even when content is unchanged. For v1, all current consumers are boolean (`.some()`) so this only matters for `excludedSigils`.

## Memory lifecycle

- **Creation**: lazy — `store.node(id)` creates signals on first access.
- **Cleanup**: deterministic on removal. When a node is removed from the tree during `batch()`, its signals are disposed, its contributions subtracted from ancestor counts, and its entry removed from the store's node map.
- **Detach/reattach**: old parent captured before structural mutation. Subtraction from old chain, addition to new chain, both in the same batch boundary.

## Constraints (v1)

- **No filtered walks in reduced signals** — `into` predicates create stale values in collapsed subtrees. Reduce over the full structural tree; visibility is a separate render concern.
- **No reduced-from-reduced** — a reduced signal cannot use another reduced signal as its source. Flat dependency graph for v1.
- **Structural mutations** (reparent/move) need old-parent info for correct ancestor chain updates (see Semantics above).

## What this replaces

### Done (implemented)

| Old | New |
|-----|-----|
| `cursorInDescendant` (card-only, manual sync) | `cursorDescendant` (all nodes, reduced signal) |
| Manual `prevDescendantCardId` tracking | Automatic via `batch()` + counts |
| `expandedEditCardId === nodeId` for expansion | `editingDescendant` (reduced signal) |
| `tree-concerns.ts` (prototype) | `reduced-signals.ts` (production) |

### v2 — Remaining (km-tui.v2-reactive-tree)

| Old | New (planned) | Blocker |
|-----|-----|-----|
| ~~Ad-hoc sigil inheritance in `hydrate()`~~ | ~~`tree.ancestors(s => s.ownSigils).reduce(concat, [])`~~ | Done — `.reduce()` combinator + `excludedSigils` signal |
| ~~`expandWithDescendants()` (visual selection)~~ | ~~`selectedAncestor` reduces automatically~~ | Done — helper removed |
| ~~`shouldStripColor` computed 4 ways~~ | ~~Derive from `cursor` / `selectedAncestor`~~ | Done — unified to 2 sites |
| ~~`ReactiveNodeStore` class~~ | ~~Factory function per principles.md~~ | Done — `createNodeStore()` factory |
| ~~`expandedEditCardId` store signal (1 reader)~~ | ~~`editingDescendant` or direct edit check~~ | Done — purged in commit d3dc1c2 |

### Kept by design (not tree-reduced)

| Signal | Reason |
|-----|-----|
| `cursorCardNodeId` / `cursorColumnNodeId` / `cursorDepth` | Layout-derived from lens position, not tree aggregate |

## Worked example: cursor move

```
Tree:  root → col1 → card1 → sub1 (cursor here)
                    → card2
             col2 → card3
```

User presses `j` — cursor moves from `sub1` to `card2`.

```ts
store.batch(tree, () => {
  store.node('sub1').cursor(false)
  store.node('card2').cursor(true)
})
```

Batch end — store recomputes:

1. **cursor (self)**: sub1 → false, card2 → true. 2 writes.
2. **cursorDescendant (up from cursor sources)**:
   - Old path: card1, col1, root were true → now false (sub1 no longer cursor). 3 writes.
   - New path: col1, root already true (still ancestors of card2) → no write. card2 has no cursor descendant. 0 new writes.
   - Net: card1 → false. 1 write. (col1/root unchanged — card2 is still under col1.)
3. **selectedAncestor (down from selected sources)**: selection didn't change → 0 writes.

Total: 3 signal writes. 3 component re-renders (sub1, card2, card1).

## Worked example: reparent

```
Tree:  root → col1 → card1 (selected)
                    → card2
             col2 → card3
```

User drags `card1` from `col1` to `col2`.

```ts
store.batch(tree, () => {
  // Structural mutation: move card1 from col1 to col2
  tree.move('card1', 'col2')
})
```

Batch end — store recomputes:

1. **selected (self)**: card1 still selected → no change.
2. **selectedAncestor (down from selected sources)**:
   - Old path descendants of col1: card2 was `selectedAncestor=true` (sibling of selected card1). After move, card1 is no longer under col1 → card2's selectedAncestor becomes false. 1 write.
   - New path descendants of col2: card3 gains `selectedAncestor=true` (sibling of moved card1). 1 write.
   - col1 had count=1 (from card1). After move, count=0 → `selectedAncestor` for col1's subtree clears.
   - col2 had count=0. After move, count=1 → `selectedAncestor` for col2's subtree sets.
3. **cursorDescendant**: cursor didn't change → no recomputation.

Key: the store captures `card1`'s old parent (`col1`) before the structural mutation, then subtracts card1's contributions from the old ancestor chain and adds to the new one. Without old-parent capture, col1's ancestor chain can't be correctly updated.

## Migration strategy

Branch-by-abstraction with shadow oracle. Old sync code stays as **shadow calculator** (not a second active codepath) during migration. One facade, one active implementation at a time.

1. **Characterize** — freeze current visual semantics in golden tests from [node-visual-spec.md](node-visual-spec.md). Table-driven tests for all selection/style precedence combinations. Add perf instrumentation harness.
2. **Shadow implementation** — new reduced signals compute in parallel without owning UI. Compare old vs new **semantically** (not raw ANSI — two outputs can be visually equivalent but byte-different). Bounded soak period.
3. **Cut over reads** — switch consumers to reduced signals behind the facade. Old sync becomes shadow oracle (reversed roles). Short soak with hard exit criteria.
4. **Purge old writes** — remove old sync propagation. Verify only one source of truth.
5. **Remove** — delete shadow comparison code, transitional glue, dead tests.

Hard exit criteria for shadow phase: differential tests pass, golden visual tests pass, N benchmark runs show no mismatches → then remove old sync immediately. Don't let it drift.

## Performance

Per cursor move (j/k): ~8-10 signal writes, <0.1ms. The real win is rendering — components read O(1) pre-computed signals instead of O(depth) tree walks during render.

### Bench gates

Run `cursor-perf` bench at each milestone to catch regressions and verify improvements:

| When | What to capture | Pass criteria |
|------|----------------|---------------|
| Before Phase 1 | Baseline (current HEAD) | Record wall + per-phase breakdown |
| After Phase 2 (shadow) | Shadow overhead | Wall time ≤ 110% of baseline (shadow adds comparison cost) |
| After Phase 3 (cutover) | New implementation solo | Content render ≤ baseline (no regression) |
| After Phase 4 (purge) | Old code deleted | Wall time ≤ baseline (likely small improvement) |
| After Phase 5 (editing + sigils) | Full migration | Content render ≤ 8% of wall time (same or better) |

## Signals inventory

### Implemented (v1)

| Signal | Definition | Status |
|--------|-----------|--------|
| `cursorDescendant` | `tree.descendants(s => s.cursor).some()` | Done |
| `selectedAncestor` | `tree.ancestors(s => s.selected).some()` | Done |
| `editingDescendant` | `tree.descendants(s => s.editing).some()` | Done |

### v2 (km-tui.v2-reactive-tree)

| Signal | Definition | Blocked by |
|--------|-----------|------------|
| `excludedSigils` | `tree.ancestors(s => s.ownSigils).reduce(concat, [])` | `.reduce()` combinator |
| `doneAncestor` | `tree.ancestors(s => s.isDone).some()` | None |

### Future

| Signal | Definition |
|--------|-----------|
| `hasErrorDescendant` | `tree.descendants(s => s.hasError).some()` |
| `hasUnreadDescendant` | `tree.descendants(s => s.isUnread).some()` |
| `errorCount` | `tree.descendants(s => s.hasError).count()` |

Each = one line in the state definition.

See also: [data-model.md](data-model.md) for KNode structure, [links.md](links.md) for the same cache pattern.
