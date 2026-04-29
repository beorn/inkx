---
id: "@km/tui/tree-lenses/1-viewtree-implementation-viewnode-type-usenode-hook"
aliases:
  - km-tui.tree-lenses.1
  - km-tui-tree-lenses-1
  - "@km/tui/tree-lenses/1"
created_by: Bjørn Stabell
created_at: 2026-04-05T23:17:38Z
closed_at: 2026-04-05T23:39:26Z
close_reason: ViewTree + ViewNode + useNode + useViewTree implemented.
  createProjectedMap (11 tests), createViewTree (15 tests), useNode hook,
  PaneSignals.viewTree wired with effect sync. 1745 tests pass.
---

# [x] ViewTree implementation + ViewNode type + useNode hook @km/tui #task #P2

## ViewTree implementation

### Step 1: createProjectedMap<K, V> (reusable utility)
Generic projected signal map. Tracks keys, maintains per-key signal bags,
diffs on sync(). Testable independently — no tree knowledge.

Location: packages/@km/_orphan/board/src/projected-map.ts

```typescript
interface ProjectedMap<K, V> {
  get(key: K): Projected<V> | undefined  // lazy create
  sync(getValue: (key: K) => V | undefined): void  // diff + update
  readonly size: number
}
type Projected<V> = { readonly [F in keyof V]: () => V[F] }
```

### Step 2: ViewNode type
```typescript
interface ViewNode {
  id: string
  viewType: ViewType       // "column" | "card" | "subitem" | "body-column"
  childIds: readonly string[]
  parentId: string | null   // visual parent
  display: KNode            // renderable node (self or embed target)
  isBody: boolean
  isEmbed: boolean
  rules: SectionRules | undefined
  data: KNode               // raw repo node
}
```

### Step 3: createViewTree(repo, signals)
Uses createViewLens internally + createProjectedMap for per-node signals.
effect() syncs projection when lens inputs change.

### Step 4: useNode(id) hook
Reads from ViewTree projection. Re-renders only when THIS node changes.

Acceptance:
- createProjectedMap has independent tests (create, sync, diff, prune)
- ViewNode type exported from @km/_orphan/board
- useNode(id) returns ViewNode with all fields reactive
- All existing tests pass (additive — no breaking changes)