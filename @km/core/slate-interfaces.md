---
mentions:
  - km
  - claude
id: "@km/core/slate-interfaces"
aliases:
  - km-core.slate-interfaces
  - km-core-slate-interfaces
created_by: claude:ceb7c9cb
created_at: 2026-03-28T06:54:44Z
closed_at: 2026-03-28T08:38:39Z
close_reason: "All 4 phases complete. P1: KNode+Position namespaces (50 files).
  P2: TreeOps (km-tree). P3: CommandAction split (8 sub-unions). P4: Selection
  namespace. 4791 tests pass, docs updated."
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] SlateJS-style domain interfaces — typed tree vocabulary with static helpers @km/core #epic #P2 @claude:ceb7c9cb

## Vision

Adopt SlateJS's interface pattern for km's tree operations: each domain concept gets an `interface` (data shape) + a `const` with static helper methods (the namespace pattern). Every tree operation is expressible as a typed call on a domain object.

## SlateJS Pattern

```typescript
// SlateJS: interface + const with same name
export interface Point { path: Path; offset: number }
export const Point = {
  compare(a: Point, b: Point): -1 | 0 | 1 { ... },
  equals(a: Point, b: Point): boolean { ... },
  isPoint(value: unknown): value is Point { ... },
}
// Usage: const p: Point = ...; Point.equals(p1, p2)
```

## Mapping: SlateJS → km

| SlateJS                           | km Equivalent                   | Status                    | Notes                                                       |
| --------------------------------- | ------------------------------- | ------------------------- | ----------------------------------------------------------- |
| Node (Editor\|Element\|Text)      | KNode                           | EXISTS (@km/_orphan/core) | Flat rows, not nested objects                               |
| Element (has children)            | KNode with item=true            | EXISTS (trait)            | isItem(), isOutline(), isListItem()                         |
| Text (leaf)                       | KNode with item=false           | EXISTS (trait)            | isBlock()                                                   |
| Path (number[])                   | n/a (we use parent_id)          | NOT NEEDED                | SlateJS paths are positional indices; km uses stable IDs    |
| Point ({path, offset})            | n/a                             | NOT NEEDED                | km doesn't do rich text cursor tracking (yet — see textily) |
| Range ({anchor, focus})           | n/a                             | NOT NEEDED                | Same — future textily concern                               |
| Selection (Range\|null)           | selectedNodes: Set<string>      | EXISTS (BoardState)       | Multi-select, not range-based                               |
| Location (Path\|Point\|Range)     | Position ({parentId, childIdx}) | PARTIAL (@km/tui)         | Needs to move to @km/_orphan/core                           |
| Operation (9 variants)            | TAction (4 variants)            | EXISTS (@km/tree)         | ADD_NODE, MOVE_NODE, DELETE_NODE, UPDATE_NODE               |
| Transforms (node/text/selection)  | Scattered across 5 files        | MISSING                   | No unified mutation API                                     |
| Editor (root + methods)           | Repo                            | EXISTS (@km/storage)      | 50+ methods, no static helper pattern                       |
| NodeEntry ([Node, Path])          | n/a                             | NOT NEEDED                | We use IDs, not path-indexed entries                        |
| Ref (PathRef, PointRef, RangeRef) | n/a                             | NOT NEEDED                | No collaborative OT yet                                     |

## What We Need (6 interfaces)

### 1. KNode — EXISTS, needs helpers

The data model is solid. What's missing: static helpers like SlateJS's `Node.parent`, `Node.children`, `Node.ancestors`, `Node.matches`.

```typescript
// km-core/src/node.ts
export const KNode = {
  // Type guards (EXIST, move here)
  isItem(node): boolean,
  isOutline(node): boolean,
  isBlock(node): boolean,
  isTask(node): boolean,
  isEmbed(node): boolean,
  
  // Tree queries (NEW — need repo)
  parent(repo, nodeId): KNode | null,
  children(repo, parentId): KNode[],
  ancestors(repo, nodeId): KNode[],
  siblings(repo, nodeId): KNode[],
  descendants(repo, nodeId): Generator<KNode>,
  
  // Comparisons (NEW)
  isSibling(a, b): boolean,
  isAncestor(repo, ancestorId, descendantId): boolean,
  isDescendant(repo, descendantId, ancestorId): boolean,
  matches(node, props): boolean,
}
```

### 2. Position — PARTIAL, needs promotion + helpers

Currently in @km/tui/position-resolver.ts. Should live in @km/_orphan/core.

```typescript
// km-core/src/position.ts
export interface Position { parentId: string; childIdx: number }

export const Position = {
  // Construction
  of(node): Position | null,        // DONE as positionOf()
  first(parentId): Position,         // DONE as firstChild()
  last(parentId): Position,          // DONE as lastChild()
  after(repo, nodeId): Position,     // NEW — slot after this node
  before(repo, nodeId): Position,    // NEW — slot before this node
  
  // Queries
  nodeAt(repo, pos): KNode | null,   // DONE as nodeAt()
  isAt(repo, nodeId, pos): boolean,  // DONE as isAtPosition()
  equals(a, b): boolean,             // NEW
  
  // Resolution
  resolve(key, cursor, repo): Position | PickTarget | null,  // DONE as resolveLocationKey()
  toSortOrder(pos, repo): number,    // DONE as toSortOrder()
}
```

### 3. TreeOps — MISSING, needs creation

SlateJS's `Transforms` equivalent. Unified mutation API.

```typescript
// km-core/src/tree-ops.ts (or km-tree)
export const TreeOps = {
  // Movement
  moveTo(repo, nodeId, pos: Position): boolean,  // DONE as moveTo()
  indent(repo, nodeId): boolean,                  // EXISTS in keyboard-card-ops.ts
  outdent(repo, nodeId): boolean,                 // EXISTS in keyboard-card-ops.ts
  shiftUp(repo, nodeId): boolean,                 // EXISTS in board-actions-edit.ts
  shiftDown(repo, nodeId): boolean,               // EXISTS in board-actions-edit.ts
  
  // Structure
  insertAfter(repo, parentId, node): string,      // wraps repo.addNode
  insertBefore(repo, siblingId, node): string,     // wraps repo.addNode
  insertChild(repo, parentId, node, idx): string,  // wraps repo.addNode
  remove(repo, nodeId): void,                      // wraps repo.deleteNode
  
  // Content
  split(repo, nodeId, offset): SplitResult,        // EXISTS in block-ops.ts
  merge(repo, nodeId, direction): MergeResult,     // EXISTS in block-ops.ts
}
```

### 4. Selection — MISSING as typed object

Currently just `Set<string>` + ad-hoc `getSelectedCards(ctx)`.

```typescript
// km-tui/src/selection.ts
export const Selection = {
  nodes(ctx): KNode[],                // DONE as getSelectedCards()
  nodeIds(ctx): string[],             // NEW
  isEmpty(ctx): boolean,              // NEW
  contains(ctx, nodeId): boolean,     // NEW
  forEach(ctx, fn): void,             // NEW — with undo batching
  moveTo(ctx, pos: Position): void,   // NEW — batch move all
}
```

### 5. Operation — EXISTS as TAction, needs inverse()

@km/tree already has ADD_NODE, MOVE_NODE, DELETE_NODE, UPDATE_NODE. Missing: `inverse()` for undo (currently handled by undoable-repo recording).

### 6. PickTarget — EXISTS, keep separate

`{ pick: string }` is a UI concept (deferred resolution). Not a SlateJS equivalent — it's @km/_orphan/specific for chord-based picker dialogs.

## Phases

1. **Position to @km/_orphan/core** — Move Position interface + construction helpers (of, first, last, equals) to @km/_orphan/core. Keep repo-dependent helpers (resolve, nodeAt, moveTo) in @km/tui.
2. **KNode static helpers** — Add KNode namespace object with type guards (move existing) + tree queries (parent, children, ancestors, siblings).
3. **TreeOps** — Consolidate indent/outdent/shift/split/merge from keyboard-card-ops.ts and block-ops.ts into one API.
4. **Selection** — Typed Selection object replacing raw Set<string> + getSelectedCards.
5. **after/before constructors** — Position.after(repo, nodeId), Position.before(repo, nodeId) for sibling insertion.

## Where Things Live

| Interface                    | Package                                      | Why                                     |
| ---------------------------- | -------------------------------------------- | --------------------------------------- |
| KNode (data)                 | @km/_orphan/core/src/types.ts                | Already there                           |
| KNode (helpers without repo) | @km/_orphan/core/src/node.ts                 | Type guards, matches, comparisons       |
| KNode (helpers with repo)    | @km/tree/src/queries.ts                      | parent, children, ancestors (need repo) |
| Position (data)              | @km/_orphan/core/src/position.ts             | Pure data type, no deps                 |
| Position (repo helpers)      | @km/tui/src/board/position-resolver.ts       | resolve, nodeAt, moveTo need repo       |
| TreeOps                      | @km/tree/src/tree-ops.ts                     | Consolidates block-ops + card-ops       |
| Selection                    | @km/tui/src/selection.ts                     | Needs ActionCtx                         |
| Operation/TAction            | @km/tree/src/actions.ts                      | Already there                           |
| PickTarget                   | @km/_orphan/commands/src/types.ts or @km/tui | UI concept                              |

## Connection to TEA

These interfaces become the vocabulary for TEA state machines:

- TreeOps.moveTo emits a MOVE_NODE Operation through apply()
- Operations are serializable → replay, undo, sync, AI automation
- Selection.moveTo batches Operations
- Position is the shared addressing scheme between commands and operations

## /complete

Per phase — each phase has its own criteria.

