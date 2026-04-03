# Architecture Layers

km uses four layers. Each layer may only depend on layers below it.

```
Application  (km-tui, km-cli)     state machines, UI, command dispatch
Storage      (km-storage)         Store abstraction, reactive signals, sync, persistence
Operations   (km-tree)            tree mutations via TreeMutator interface
Domain       (km-core)            pure data types + static helpers
```

## Domain (km-core)

Pure types and functions. No repo, no DB, no side effects.

**Core interfaces** use the SlateJS namespace pattern: a TypeScript `interface` and a `const` share the same name via declaration merging. A single `import { KNode } from "@km/core"` gives consumers both the type and the namespace.

```ts
// interfaces/node.ts — KNode interface (from types.ts) + KNode namespace
export interface KNode extends _KNodeInterface {}

export const KNode = {
  isOutline(node: NodeLike): boolean { ... },
  isItem(node: NodeLike): boolean { ... },
  isBlock(node: NodeLike): boolean { ... },
  isEmbed(node: EmbedLike): boolean { ... },
  isTask(node: TaskLike): boolean { ... },
  matches(node, props): boolean { ... },
} as const

// interfaces/position.ts — Position interface + Position namespace
export interface Position { parentId: string; childIdx: number }

export const Position = {
  of(node: NodeLike): Position | null { ... },
  first(parentId: string): Position { ... },
  last(parentId: string): Position { ... },
  equals(a: Position, b: Position): boolean { ... },
} as const
```

Also includes: task marker/status conversion, node validation, date utilities, query parser, metadata extraction. All pure functions on data shapes.

## Operations (km-tree)

Tree mutations. Depends on km-core only. Uses a `TreeMutator` interface (which Repo satisfies) rather than concrete storage:

```ts
// block-ops.ts
export interface TreeMutator {
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  addNode(parentId: string | null, node: Partial<KNode>): string
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string, position: number): void
  deleteNode(id: string): void
}
```

Provides: `split`, `mergeBackward`, `mergeForward`, `indentNode`, `outdentNode`, `degrade`.

Also provides a SlateJS-aligned operations layer:

- **`operations.ts`** — 7 atomic Operation types (`insert_node`, `remove_node`, `set_node`, `move_node`, `split_node`, `merge_node`, `set_selection`) with `inverse()` and `applyOperation()`
- **`selection.ts`** — `Point` (nodeId + offset), `Range` (anchor + focus), transform helpers for adjusting selection after ops
- **`history.ts`** — `withHistory` decorator for op-based undo/redo with batch grouping
- **`operation-log.ts`** — `OperationLog` for append-only op recording with sequence-based filtering
- **`normalize.ts`** — `withNormalization` decorator for auto-enforcing schema constraints after mutations

## Storage (km-storage)

Store abstraction, reactive signals, filesystem sync, persistence.

### Store Abstraction

Trait-based interfaces that separate concerns:

```ts
// store.ts — Minimal store contract
interface Store {
  peekNode(id: string): KNode | null
  peekChildIds(parentId: string): readonly string[]
  commit(events: readonly Omit<Event, "id" | "ts">[], meta?: Partial<CommitMeta>): CommitResult
}

interface Observable {
  onCommit(cb: (result: CommitResult) => void): () => void
}

interface Replicated<C = Event> {
  getChanges(since?: string): readonly ChangeEnvelope<C>[]
  applyChanges(changes: readonly ChangeEnvelope<C>[]): CommitResult
}
```

### Commit Taxonomy

Four concepts that must not be confused:

- **Operation** — user intent (what the editor receives)
- **Event** — canonical state mutation (what the store commits)
- **ChangeEnvelope** — replicated committed change (what sync peers exchange)
- **RepoDelta** — invalidation signal (what the UI consumes): `{ nodeIds, parentIds, deletedNodeIds }`

### Reactive Signals

`withReactive(store)` adds per-node reactive signals (alien-signals):

```ts
interface Reactive {
  nodeState(id: string): ReadonlySignal<ResourceState<KNode>>
  childIdsState(parentId: string): ReadonlySignal<ResourceState<readonly string[]>>
}
```

Signals are lazy (created on first access), updated in batch from RepoDelta on each commit. `ResourceState<T>` makes loading lifecycle explicit: `unloaded | loading | loaded | deleted | error`.

### Composition Target

```ts
const editor = pipe(
  createSQLiteStore(db),   // authority — raw persistence
  withHistory,              // record committed effects for undo
  withTree,                 // normalize after every commit
  withReactive,             // signals from delta (commit subscriber)
  withSync(fsPeer),         // FS projection (commit subscriber)
)
```

### Key Files

- `commit-types.ts` — CommitMeta, CommitResult, RepoDelta, ResourceState, ChangeEnvelope, computeDelta
- `store.ts` — Store, Observable, Replicated interfaces + createStoreFromRepo
- `reactive.ts` — withReactive decorator (alien-signals)
- `watch/sync.ts` — withSync decorator (FS bidirectional sync)
- `emitter.ts` — event emission lifecycle (DB + journal + broadcast)

## Application (km-tui, km-cli)

State machines, UI components, command dispatch, selection, keyboard handling.

- `position-resolver.ts` -- repo-dependent Position helpers (`resolveLocationKey`, `moveTo`, `nodeAt`). Pure `Position` construction stays in km-core; resolution that needs the repo lives here.
- `board-actions.ts` -- command dispatch, verb execution
- Views, dialogs, navigation handlers

## Layer Rules

1. **Domain never imports from Operations, Storage, or Application.**
2. **Operations never imports from Storage or Application.**
3. **Storage imports from Domain and Operations only.**
4. **Application can import from any layer.**
5. Pure data flows down, effects flow up.

Concretely: `km-core` has zero imports from other km packages. `km-tree` imports from `km-core` only. `km-storage` imports from `km-core` and `km-tree`. `km-tui` and `km-cli` can import from any layer.
