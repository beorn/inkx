---
mentions:
  - km
id: "@km/tui/reactive-tree-unification"
aliases:
  - km-tui.reactive-tree-unification
  - km-tui-reactive-tree-unification
created_by: Bjørn Stabell
created_at: 2026-04-08T15:06:26Z
owner: bjorn@stabell.org
---

# [ ] Unify projections (filters) + reduced signals (aggregates) into ReactiveTree @km/tui #feature #P3

## Insight

Projections (TreeLens/ViewTree) and reduced signals are two sides of the same coin:

- **Projections** = reactive filters — which nodes are visible, parent/child structure
- **Reduced signals** = reactive aggregates — per-node summaries (cursorDescendant, selectedAncestor)

Both are reactive tree transformations maintaining Map<nodeId, derivedState> with incremental updates.

## Current State (two separate systems)

| System             | Location                      | What                                     |
| ------------------ | ----------------------------- | ---------------------------------------- |
| ViewTreeProjection | pane-signals.ts, tree-lens.ts | Filter: visible nodes, roles, walk order |
| ReactiveTreeStore  | reduced-signals.ts            | Aggregate: ancestor/descendant counts    |

## Unified Vision

```ts
const tree = createReactiveTree({
  // Primary signals (per-node writable state)
  cursor: signal(false),
  selected: signal(false),
  editing: signal(false),

  // Aggregates (reduced signals — bottom-up / top-down)
  cursorDescendant: tree.descendants(s => s.cursor).some(),
  selectedAncestor: tree.ancestors(s => s.selected).some(),

  // Filters (projections — structural visibility)
  visible: tree.filter(s => !s.hidden && !s.folded),
  visibleChildren: tree.project(s => s.visible),
})
```

Both filters and aggregates would share:

- Map<nodeId, signals> storage
- Incremental update on input change
- Tree topology tracking
- batch() for atomic updates

## Composability

Aggregates over filtered trees: "count visible descendants with errors"

```ts
visibleErrorCount: tree.descendants(s => s.visible && s.hasError).count()
```

## Questions to Answer

1. Does ViewTreeProjection already have enough signal infrastructure to absorb aggregates?
2. Can reduced signal counts work with the filtered (visible) tree or only the structural tree?
3. What's the performance tradeoff of unifying vs keeping separate?
4. Should this live in @km/tui or be extracted to silvery (general-purpose)?

