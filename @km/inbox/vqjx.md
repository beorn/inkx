---
mentions:
  - km
id: "@km/inbox/vqjx"
aliases:
  - km-vqjx
  - "@km/_orphan/vqjx"
created_at: 2026-01-16T16:55:50Z
closed_at: 2026-01-22T00:34:46Z
---

# [x] Evaluate SlateJS data model adoption for tree/board layers @km/_orphan #task #P4

## Evaluation: Adopting SlateJS Data Model for km

## Executive Summary

This analysis compares km's current architecture with SlateJS's data model and operation system, evaluating what would need to change to adopt Slate's patterns at the tree and/or board level.

**Key Finding:** Slate's core innovations (operation-based transforms, normalization, operation-based undo/redo) are highly applicable to km's architecture. However, km has unique requirements (bidirectional file sync, multi-representation storage, structured metadata) that would require adaptation rather than direct adoption.

---

## Current km Architecture vs SlateJS

### Data Model Comparison

| Aspect              | km Current                                            | SlateJS                             |
| ------------------- | ----------------------------------------------------- | ----------------------------------- |
| Root container      | BoardState.nodes: TNode[]                             | Editor.children: Node[]             |
| Middle nodes        | TNode (recursive)                                     | Element (recursive)                 |
| Leaf nodes          | TNode (no separate type)                              | Text (explicit leaf type)           |
| Path representation | TPath = number[]                                      | Path = number[] (identical!)        |
| Node identity       | nodeId: string (stable UUID)                          | No built-in identity (path-based)   |
| Node metadata       | Rich properties (taskStatus, priority, dueDate, etc.) | Custom properties (type, url, etc.) |

### Operation/Action Comparison

| Aspect        | km Current                                                | SlateJS                                                                                                                      |
| ------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Operations    | 4 TActions: ADD_NODE, MOVE_NODE, DELETE_NODE, UPDATE_NODE | 9 Operations: insert_node, remove_node, set_node, merge_node, split_node, move_node, insert_text, remove_text, set_selection |
| Granularity   | Node-level only                                           | Character-level text + node-level                                                                                            |
| Immutability  | Rebuild from storage                                      | In-memory immutable transforms                                                                                               |
| Normalization | Ad-hoc validation                                         | Systematic multi-pass normalization                                                                                          |
| Undo/Redo     | State snapshots in stacks                                 | Operation batches in stacks                                                                                                  |

### Architecture Flow Comparison

**km Current:**

```
Command → Action → Reducer (pass-through for TAction) → Effect Layer → Storage → File
                                                                     ↑
                                                              Rebuild tree
```

**SlateJS:**

```
Command → Transform → Operations → apply() → Normalize → onChange()
                         ↓
                   History stack
```

---

## What Would Change: Tree Layer

### Current `@km/tree`

- `TNode` type with recursive `children[]`
- `TPath` for path-based positioning (already Slate-compatible!)
- 4 `TAction` types for mutations
- Queries for navigation (`getNodeAtPath`, `getParent`, etc.)

### With Slate-style Operations

**1. Expand Operation Types**

Current TActions map cleanly to Slate operations:

```typescript
// Current                          // Slate equivalent
ADD_NODE                         → insert_node
DELETE_NODE                      → remove_node
UPDATE_NODE                      → set_node
MOVE_NODE                        → move_node (Slate doesn't have this built-in)
```

Would add:

- `merge_node` - combine sibling nodes
- `split_node` - split node at point (useful for editing)
- No need for `insert_text`/`remove_text` (km doesn't do character-level editing)

**2. Add `apply()` Function**

Create a pure function that applies operations to the tree:

```typescript
function apply(nodes: TNode[], operation: TOperation): TNode[] {
  switch (operation.type) {
    case 'insert_node':
      return insertNodeAtPath(nodes, operation.path, operation.node);
    case 'remove_node':
      return removeNodeAtPath(nodes, operation.path);
    case 'set_node':
      return updateNodeAtPath(nodes, operation.path, operation.properties);
    // ...
  }
}
```

**3. Add Normalization**

Define constraints and auto-fix logic:

```typescript
function normalizeNode(nodes: TNode[], path: TPath): TNode[] {
  const node = getNodeAtPath(nodes, path);

  // Example constraints:
  // - Tasks must have taskStatus
  // - Nodes with children can't have body text (or vice versa)
  // - Maximum depth limits

  if (node.isTask && !node.taskStatus) {
    return apply(nodes, { type: 'set_node', path, properties: { taskStatus: 'todo' } });
  }
  return nodes;
}
```

**Impact Assessment:**

- **Files affected:** `packages/km-tree/src/` - add `operations.ts`, `apply.ts`, `normalize.ts`
- **Breaking changes:** Moderate - TAction would be replaced/renamed to TOperation
- **Effort:** Medium - core tree operations already exist, need wrapping

---

## What Would Change: Board Layer

### Current `@km/board`

- `BoardState` with cursor, selection, folds, zoom, history
- `BoardAction` for navigation (40+ action types)
- `boardReducer` for state transitions
- Undo/redo via state snapshots

### With Slate-style Operations

**1. Unified Selection Model**

Slate's selection is part of the editor state:

```typescript
interface Editor {
  children: Node[];
  selection: Range | null;  // anchor + focus points
}
```

km could unify cursor and selection:

```typescript
interface BoardState {
  nodes: TNode[];
  selection: {
    anchor: TPath;  // Start of selection (or cursor if collapsed)
    focus: TPath;   // End of selection (same as anchor if collapsed)
  } | null;
}
```

**2. Selection as Operations**

Navigation would become operations:

```typescript
// Current
{ type: 'CURSOR_MOVE', dir: 'down' }

// Slate-style
{ type: 'set_selection', properties: { anchor: [0, 1], focus: [0, 1] } }
```

Benefit: Navigation is now undoable/replayable.

**3. Operation History Instead of State Snapshots**

```typescript
interface History {
  undos: OperationBatch[];  // Each batch: { operations: [], selectionBefore: ... }
  redos: OperationBatch[];
}
```

Undo = apply inverse operations in reverse order.

**Impact Assessment:**

- **Files affected:** `packages/km-board/src/boardReducer.ts`, `boardTypes.ts`
- **Breaking changes:** Significant - selection model and undo/redo would change
- **Effort:** High - navigation logic is complex, would need careful migration

---

## What Would Change: Storage Layer

### The Challenge

km's storage layer has unique requirements Slate doesn't address:

1. **Bidirectional file sync** - changes must propagate to/from markdown files
2. **SQLite as cache** - DBNode is a denormalized view of filesystem
3. **Multi-representation** - same data exists as TNode, DBNode, and file content

### Options

**Option A: Slate at Tree Level Only**

- Storage layer unchanged
- Tree operations translate to storage CRUD calls
- Effect layer bridges the gap:

```
TOperation → apply() → new TNode[] → diff with old → storage.updateNode()
```

**Option B: Event Sourcing at Storage Level**

- Operations become the source of truth
- Storage replays operations to build state
- File sync becomes operation serialization

```
TOperation → events.jsonl → SQLite projection → file sync
```

**Impact Assessment:**

- **Option A:** Low impact, pragmatic adapter approach
- **Option B:** High impact, architectural rewrite, but enables CRDT/collaboration

---

## What Would Change: App Layer

### Current

- `useAppState` hook with reducer chain
- Effect layer intercepts TActions for storage calls
- Manual `refreshTree()` after mutations

### With Slate-style Operations

**1. Single `apply()` Entry Point**

```typescript
function dispatch(operation: TOperation) {
  // 1. Apply to tree (immutable)
  const newNodes = apply(state.nodes, operation);

  // 2. Normalize
  const normalized = normalize(newNodes);

  // 3. Add to history (if undoable)
  if (isUndoable(operation)) {
    history.undos.push({ operations: [operation], selectionBefore });
  }

  // 4. Sync to storage (effect)
  syncToStorage(operation);

  // 5. Update state
  setState({ ...state, nodes: normalized });
}
```

**2. Remove Manual Refresh**

Since `apply()` returns the new state directly, no need for:

```typescript
// Current pattern (would be removed)
await storage.updateNode(id, changes);
await refreshTree();  // Rebuild from storage
```

**Impact Assessment:**

- **Files affected:** `apps/km-tui/packages/km-opentui/src/hooks/useAppState.ts`
- **Breaking changes:** Moderate - dispatch pattern changes
- **Effort:** Medium - mostly wiring changes

---

## Key Benefits of Adoption

1. **True Undo/Redo** - Operation-based history enables correct undo for any action
2. **Normalization** - Systematic constraint enforcement catches bugs early
3. **Testability** - Pure `apply()` function is trivial to test
4. **Future Collaboration** - Operations are the foundation for OT/CRDT
5. **Unified Mental Model** - One pattern for all state changes

## Key Challenges

1. **File Sync Complexity** - Operations must translate to file changes
2. **Node Identity** - Slate is path-based; km uses stable IDs (need both)
3. **Migration Effort** - Significant refactoring of board and app layers
4. **Learning Curve** - Team needs to understand operation semantics

---

## Recommended Approach

### Phase 1: Tree Layer Operations (Low Risk)

1. Add `TOperation` type alongside `TAction`
2. Implement `apply()` function for tree mutations
3. Add basic normalization
4. Keep storage layer unchanged (translate operations → storage calls)

### Phase 2: Board Selection Unification (Medium Risk)

1. Unify cursor and selection into Slate-style model
2. Make navigation operations undoable
3. Migrate to operation-based history

### Phase 3: Storage Event Sourcing (High Risk, Optional)

1. Store operations as events
2. Build state by replaying operations
3. Enable collaborative features

---

## Files to Modify (Phase 1)

| Package      | File                 | Changes                         |
| ------------ | -------------------- | ------------------------------- |
| @km/tree     | src/operations.ts    | New - define TOperation types   |
| @km/tree     | src/apply.ts         | New - pure apply function       |
| @km/tree     | src/normalize.ts     | New - constraint enforcement    |
| @km/tree     | src/index.ts         | Export new modules              |
| apps/@km/tui | hooks/useAppState.ts | Integrate apply() into dispatch |

---

## Questions for Discussion

1. Should navigation (cursor movement) be operation-based and undoable?
2. How should operations map to file changes in bidirectional sync?
3. Is event sourcing at storage level a future goal?

