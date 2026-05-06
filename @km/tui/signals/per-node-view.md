---
mentions:
  - km
id: "@km/tui/signals/per-node-view"
aliases:
  - km-tui.signals.per-node-view
  - km-tui-signals-per-node-view
created_by: Bjørn Stabell
created_at: 2026-04-05T15:45:30Z
closed_at: 2026-04-05T17:49:04Z
close_reason: "Exploration complete: per-node computeds rejected. Current
  architecture is already optimal for km's tree sizes. See design doc."
owner: bjorn@stabell.org
---

# [x] Exploration: per-node view computeds (GPT-5.4 pattern) @km/tui #task #P4

## Per-Node View Computeds — GPT-5.4 Pattern for km

### Context

GPT-5.4 Pro recommended that for fine-grained reactive systems, per-node computeds beat a single computed for the whole view tree. The core insight: a single `computed(() => buildViewTree(...))` means any change to any node invalidates the entire tree, while per-node computeds limit invalidation to the changed branch + ancestors.

We chose single computed for NOW (see @km/tui/signals/1-reactive-viewtree-computed-signal-from-repo-foldde) because:

- React is coarse-grained (component-level re-renders via useSignal)
- ViewNodeColumnCache already gives per-column incremental rebuild
- Tree size is modest (20-1000 visible nodes)
- The real win was eliminating 14 redundant buildViewTree calls per action

This bead explores WHEN and HOW per-node computeds become the right next step.

### What Changes

Currently (post signals.1 migration):

```
viewTree = computed(() => buildViewTree(repo, rootId(), foldDepths()))
```

Every cursor move, fold toggle, or filter change invalidates this and rebuilds the whole tree (mitigated by ViewNodeColumnCache for column subtrees).

Per-node pattern (GPT-5.4):

```
const matches = (nodeId) => computed(() => matchesFilter(nodeId))
const visibleChildren = (nodeId) => computed(() =>
  children(nodeId).filter(id => isVisible(id)))
const viewNode = (nodeId) => computed(() => ({
  id, label: deriveLabel(id), expanded: isExpanded(id)
}))
```

Each node computes its own view state. Cursor-move touches zero view computeds. Fold-toggle invalidates one branch. Filter-change walks only matched branches.

### How It Maps to km Specifically

#### Current ViewNode fields → per-node computeds

| ViewNode field | Source                                     | Per-node computed                                                |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| role           | Position in tree (depth from root)         | computed(() => deriveRole(nodeId, rootId()))                     |
| children       | repo.getChildren + isCollapsedChild filter | computed(() => visibleChildren(nodeId))                          |
| isBody         | extractBody heuristic                      | computed(() => isBodyNode(nodeId, parentId))                     |
| resolvedEmbed  | node.embed_source lookup                   | computed(() => repo.getNode(embed_source))                       |
| rules          | parseHeadingRules                          | computed(() => parseHeadingRules(content)) — rarely changes      |
| parent         | Tree position                              | computed(() => visualParent(nodeId)) — handles embed reparenting |

#### Virtual nodes (__body__ columns)

The body column is synthetic — `__body__${parentId}`. Per-node computeds need a way to handle these. Options:

- Treat body column as a computed derived from parent's body children existing
- `bodyColumnId = computed(() => hasBodyContent(parentId) ? syntheticId : null)`
- Body column's children = `computed(() => bodyNodesOf(parentId))`

#### Embed resolution (visual parent ≠ data parent)

Currently buildCardNode resolves embed_source to get children from the target. Per-node:

- `effectiveSourceId = computed(() => node.embed_source ? node.embed_source : nodeId)`
- `visibleChildren = computed(() => repo.getChildren(effectiveSourceId()).filter(visible))`

### API Sketch

```typescript
interface NodeViewSignals {
  // Per-node computeds (lazy, cached)
  role: Computed<ViewRole>
  visibleChildIds: Computed<string[]>
  isBody: Computed<boolean>
  resolvedEmbed: Computed<KNode | undefined>
  rules: Computed<SectionRules | undefined>
  visualParentId: Computed<string | null>
  
  // Already exists in ReactiveNodeStore
  selected: Signal<boolean>
  foldOverride: Signal<number | undefined>
  edit: Signal<NodeEditState | null>
  hovered: Signal<boolean>
  cursorInDescendant: Signal<boolean>
}

// Factory — creates/caches per-node signal bundles
function getNodeView(nodeId: string): NodeViewSignals

// Top-level computeds derived from per-node signals
const columnIds = computed(() => visibleChildIds(rootId()))
const viewIndex = computed(() => buildIndexFromNodeViews(rootId()))
```

### Composition with ReactiveNodeStore

ReactiveNodeStore already has per-node signals: selected, foldOverride, edit, hovered, cursorInDescendant, excludedSigils. The per-node view computeds would live alongside these — either merged into NodeReactiveState or as a parallel NodeViewSignals bag.

Merging is cleaner:

```typescript
interface NodeReactiveState {
  // Existing signals (user interaction)
  selected: Signal<boolean>
  foldOverride: Signal<number | undefined>
  edit: Signal<NodeEditState | null>
  hovered: Signal<boolean>
  
  // New: view computeds (derived from repo + signals)
  role: Computed<ViewRole>
  visibleChildIds: Computed<string[]>
  isBody: Computed<boolean>
  resolvedEmbed: Computed<KNode | undefined>
}
```

The computeds depend on signals (foldOverride affects visibleChildIds), creating a natural reactive graph.

### When It Becomes Worth Doing

**Not worth it yet (current state):**

- React re-renders by component anyway; per-node computeds don't skip component work
- ViewNodeColumnCache already avoids rebuilding unchanged columns
- Tree size is 20-1000 nodes; full rebuild is <1ms
- Complexity cost is real: lifecycle management for dynamic node sets, virtual node handling

**Worth it when ANY of:**

1. **Fine-grained rendering** — if we move to direct ag-node manipulation (bypassing React reconciliation), per-node computeds map 1:1 to node updates. A cursor move touches 2 nodes (old + new), not the whole tree.
2. **Tree size > 5000 nodes** — full rebuild cost grows linearly; per-node stays O(changed branch)
3. **Cursor-move optimization** — currently cursor-move rebuilds the entire ViewTree just to update walk order. With per-node computeds, cursor-move writes cursor signal (already exists), zero view tree work.
4. **Real-time collaboration** — remote edits arrive per-node; per-node computeds naturally scope updates to the affected branch.

**Trigger**: When profiling shows buildViewTree is >5ms per action, or when we start direct ag-node rendering.

### Relationship to Other Beads

- **@km/silvery/selection/10-per-node-view-state-as-reactive-overlays-on-repo-t** (Per-node view state as reactive overlays): The sibling exploration. That bead asks "replace ViewTree with per-node overlays on repo tree." This bead is narrower: "keep ViewTree as the projection, but build it from per-node computeds instead of one big function." They converge at the end — if both succeed, ViewTree becomes an emergent structure from per-node computeds rather than a separate data structure.
- **@km/tui/signals/1-reactive-viewtree-computed-signal-from-repo-foldde** (Reactive ViewTree): The prerequisite. Single computed ViewTree must land first. This bead is the natural next step.
- **@km/tui/signals/4-panesignals-computed-viewtree-eliminate-store-for-** (PaneSignals): rootId/foldDepths as signals. Per-node computeds would read these signals, creating the reactive graph: rootId() → role computeds, foldDepths() → visibleChildren computeds.

### Key Risks

1. **Lifecycle management**: Nodes appear/disappear as the tree changes. Per-node computeds need creation/disposal. alien-signals doesn't have explicit disposal — computeds are GC'd when unreferenced. But we need to manage the Map<nodeId, NodeViewSignals> carefully.
2. **Virtual nodes**: Body columns and other synthetic nodes don't have stable IDs across rebuilds. May need a stable ID scheme or special handling.
3. **Circular dependencies**: visibleChildIds depends on child visibility; child visibility depends on parent fold state. Must ensure the dependency graph is acyclic (it is: fold flows down, visibility flows up for filter, but not circularly).
4. **Over-materialization**: GPT-5.4 warns against `viewNode = computed(() => ({ ...all fields }))` because parent objects recreate when child lists change. Better: separate `nodeView(id)` (label/role/style) from `visibleChildIds(id)`.

### Reference

GPT-5.4 Pro advice: /tmp/llm-manual-how-do-modern-reactive-oo98.txt
Key quote: "In modern fine-grained reactive systems, the best default is to treat the view tree not as one computed value but as a network of cached per-node and per-subtree derivations."

