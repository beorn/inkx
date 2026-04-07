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
> See [docs/design/visibility-model.md](visibility-model.md) and the
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
> [docs/design/visibility-model.md](visibility-model.md) and the
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
- `ReactiveNodeStore.hydrate()` — syncs fold/selection state after tree rebuild

## 2. Dependency Graph: ViewNode Field x Input Trigger

| ViewNode field      | Depends on               | Changes on cursor move? | Changes on fold? | Changes on zoom? | Changes on mutation? | Changes on filter? |
|---------------------|--------------------------|:-:|:-:|:-:|:-:|:-:|
| `id`                | KNode.id (static)         | - | - | Y* | Y | - |
| `role`              | Tree position (depth)     | - | - | Y  | Y | - |
| `node`              | KNode reference           | - | - | Y  | Y | - |
| `parent`            | Parent ViewNode           | - | - | Y  | Y | - |
| `children`          | getChildren + filters     | - | Y (partial) | Y | Y | Y |
| `isBody`            | extractBody classification| - | - | Y  | Y | - |
| `resolvedEmbed`     | symlink_to + getNode    | - | - | -  | Y | - |
| `rules`             | parseHeadingRules(content)| - | - | -  | Y | - |

**Key finding:** Cursor move (j/k) does NOT change ANY ViewNode field. The view
tree is structurally identical before and after a cursor move. The cursor lives
entirely in the selection store (`sel.node.cursor()`) and in
`ReactiveNodeStore.syncCursor()`. The current architecture already handles this
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
  readonly rules: Computed<SectionRules | undefined>

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
repo.getNode(node.symlink_to)`. With per-node computeds, each card needs a
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
   `ReactiveNodeStore`'s existing per-node interactive state.

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
   It only updates selection signals in `ReactiveNodeStore`.

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

4. **For live editing performance,** use the existing `ReactiveNodeStore.edit`
   signal to skip re-rendering non-editing cards. This is already implemented.

### Key Risks If Adopted Later

| Risk | Mitigation |
|------|------------|
| Signal lifecycle leaks (nodes removed but signals not disposed) | Use a generational GC: tag signals with tree version, sweep stale |
| Propagation thundering herd (repoVersion fans to all nodes) | Shard by column: each column gets its own version signal |
| Virtual node signal identity (body columns change ID on zoom) | Use stable virtual IDs scoped to root, not global singletons |
| Embed chains creating deep dependency graphs | Limit embed resolution depth (already 1 level in practice) |
| Testing regression (stateful signals harder to test than pure functions) | Keep `buildViewTree` as the reference implementation; test signals against it |
