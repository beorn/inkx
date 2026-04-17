# Effects — reference

Effects are the side-effect instructions emitted by TEA machines' `apply(state, op) → [state, effects]`. They're serializable data; the runtime dispatches each effect to a handler.

For the TEA pattern itself, see [design/tea.md](../design/tea.md). For the command system that emits ops, see [design/input.md](../design/input.md).

## Overview

The km architecture uses the TEA (The Elm Architecture) pattern across multiple reducer layers:

- **TreeEffect** — emitted by `applyOutlinerOp()` in `@km/tree` (editing operations on the outline structure)
- **BoardEffect** — emitted by board reducer in `apps/km-tui` (board navigation, selection, repo mutations)

Each layer's effects are interpreted by a dedicated runtime handler. Effects are immutable, serializable records that serve as a contract between the pure state machine and the side-effectful world.

## TreeEffect type

Defined in `packages/km-tree/src/outliner-reducer.ts:74–82`.

```typescript
export type TreeEffect =
  | { type: "persist"; description: string }
  | { type: "focus"; nodeId: string; cursorOffset: number }
  | { type: "bell" }
  | { type: "node_created"; nodeId: string }
  | { type: "node_deleted"; nodeId: string }
  | { type: "node_moved"; nodeId: string; fromParentId: string | null; toParentId: string | null }
  | { type: "nodes_merged"; survivorId: string; deletedId: string | null }
  | { type: "node_split"; beforeId: string; afterId: string }
```

### TreeEffect catalog

| Type | Arguments | Purpose | Emitted by |
|------|-----------|---------|-----------|
| `persist` | `description: string` | Request runtime to save tree state to disk. Description is a human-readable note (e.g., "indent node-123"). | All structural mutations (indent, outdent, split, merge, delete, insert). Emitted once per op, not per node. |
| `focus` | `nodeId: string, cursorOffset: number` | Move focus (cursor) to a specific node and byte position within its content. `cursorOffset` is 0-based. | Split, merge, insert, delete ops that require cursor repositioning. |
| `bell` | (none) | Auditory feedback (system beep). Indicates a blocked operation (e.g., can't outdent root, can't move past boundary). | Failed indent, outdent, or move operations. |
| `node_created` | `nodeId: string` | Informs runtime that a new node was inserted. Used to trigger selection and rendering. | `INSERT_NODE` op. |
| `node_deleted` | `nodeId: string` | Informs runtime that a node was removed from the tree. | `DELETE_NODE` op. |
| `node_moved` | `nodeId: string, fromParentId, toParentId` | Informs runtime that a node changed parents (reparented). Used for layout recalculation. | `INDENT`, `OUTDENT`, `MOVE_UP`, `MOVE_DOWN` ops. |
| `nodes_merged` | `survivorId: string, deletedId: string \| null` | Informs runtime that two nodes were joined. `deletedId` is the node removed; `null` if joining only merged content (forward join). | `MERGE_BLOCK` op (backward and forward directions). |
| `node_split` | `beforeId: string, afterId: string` | Informs runtime that one node was split into two at cursor. Both nodes are new IDs post-split. | `SPLIT_BLOCK` op. |

**Handler location**: `packages/km-tree/src/outliner-reducer.ts:169–371` shows where each effect is emitted. No separate handler module; effects are applied immediately by `captureTreeState()` in the reducer result.

## BoardEffect type

Defined in `apps/km-tui/src/board/board-reducer.ts:62–79`.

```typescript
export type BoardEffect =
  // Navigation effects
  | { type: "SELECT"; nodeId: string }
  | { type: "FOLD_SET"; depths: Map<string, number> }
  | { type: "SCROLL_ANCHOR_CLEAR" }
  // Edit effects — instruct the runtime to perform repo mutations
  | { type: "REPO_MOVE_NODE"; nodeId: string; newParentId: string; sortOrder: number }
  | { type: "REPO_ADD_NODE"; parentId: string; node: Partial<KNode>; selectAfter: boolean }
  | { type: "REPO_DELETE_NODE"; nodeId: string }
  | { type: "REPO_UPDATE_NODE"; nodeId: string; updates: Partial<KNode> }
  // UI effects
  | { type: "INLINE_EDIT"; nodeId: string; blockIndex: number }
  | { type: "RENDER_FLUSH" }
  | { type: "CLEAR_SELECTION" }
  // Undo effects — signal the runtime to manage undo batching
  | { type: "UNDO_SET_CURSOR"; nodeId: string | null }
  | { type: "UNDO_START_BATCH"; label: string }
  | { type: "UNDO_END_BATCH" }
```

### BoardEffect catalog

| Type | Arguments | Purpose | Handler |
|------|-----------|---------|---------|
| `SELECT` | `nodeId: string` | Move cursor to node and update selection. | `apps/km-tui/src/board/board-effect-runner.ts:54` — calls `ctx.sel.node.select([nodeId])`. |
| `FOLD_SET` | `depths: Map<string, number>` | Replace fold state with a new depth map. Used for fold_all/unfold_all operations. | Line 56–57 — calls `ctx.setFoldDepths(depths)`. |
| `SCROLL_ANCHOR_CLEAR` | (none) | Clear the sticky scroll anchor (viewport returns to following cursor). | Line 59–60 — calls `ctx.setUI({ columnScrollAnchor: null })`. |
| `REPO_MOVE_NODE` | `nodeId, newParentId, sortOrder` | Reparent a node to a new parent at a specific sort order. Triggers selection transform. | Line 64–74 — calls `ctx.repo.moveNode(...)` and updates selection context. |
| `REPO_ADD_NODE` | `parentId, node: Partial<KNode>, selectAfter: boolean` | Insert a new node. If `selectAfter` is true, enters inline edit. | Line 76–87 — calls `ctx.repo.addNode(...)` and optionally enters text edit. |
| `REPO_DELETE_NODE` | `nodeId: string` | Remove a node from the tree. Transforms selection to avoid dangling cursor. | Line 89–95 — calls `ctx.repo.deleteNode(...)` and updates selection. |
| `REPO_UPDATE_NODE` | `nodeId, updates: Partial<KNode>` | Apply field mutations to an existing node (content, title, status, etc.). | Line 97–99 — calls `ctx.repo.updateNode(nodeId, updates)`. |
| `INLINE_EDIT` | `nodeId, blockIndex: number` | Enter text-editing mode for a specific block within a card. `blockIndex` 0 = title, 1+ = body. | Line 102–104 — calls `ctx.sel.text.edit(nodeId, 0)` and sets `ctx.textEditHints`. |
| `RENDER_FLUSH` | (none) | Signal renderer to commit pending changes and redraw (synchronous render). | Line 106–107 — calls `requestRenderFlush()`. |
| `CLEAR_SELECTION` | (none) | Deselect all multi-selected nodes. | Line 109–110 — calls `clearSelection(ctx)`. |
| `UNDO_SET_CURSOR` | `nodeId: string \| null` | Inform undo/redo system of current cursor position (for undo recovery). | Line 114–115 — calls `ctx.undoHandle.setCursor(nodeId)`. |
| `UNDO_START_BATCH` | `label: string` | Begin an undo batch (group subsequent changes under one undo entry). | Line 117–118 — calls `ctx.undoHandle.startBatch(label)`. |
| `UNDO_END_BATCH` | (none) | End the current undo batch. | Line 120–121 — calls `ctx.undoHandle.endBatch()`. |

**Handler location**: `apps/km-tui/src/board/board-effect-runner.ts:50–129`. The `runEffect()` function is the dispatch center; `runBoardEffects()` handles normalization (auto-derive title/name) before execution.

## Effect execution model

### TreeEffect execution

TreeEffects from `applyOutlinerOp()` are **not** executed by a separate handler. Instead:

1. The reducer calls `outliner.indent()` (or similar) — the outliner mutates the underlying `Repo` in place.
2. `captureTreeState()` reads the mutated state and returns it.
3. Effects are emitted as a byproduct of the state comparison.
4. The caller (TUI or test) interprets effects (e.g., focus the cursor, play a beep).

No "effect runner" exists for TreeEffect; they're advisory signals, not mandatory commands.

### BoardEffect execution

BoardEffects from the board reducer are executed by `runBoardEffects()` in the TUI, which:

1. **Normalizes** all effects — auto-derives `title` from `content` and `name` from outline context.
2. **Validates** all mutations against invariants (no invalid block types as items, no cycles, etc.).
3. **Executes** each effect in order via `runEffect()`.

This strict pipeline ensures effects never violate the data model.

## Effect ordering guarantees

Within a single `Board.apply()` result:

- Repo mutations (REPO_*) are **ordered** — dependencies respect parent-before-child insertion, delete-before-reparent.
- Undo batches (UNDO_START_BATCH, UNDO_END_BATCH) **wrap** all operations within a single user command.
- Navigation effects (SELECT, FOLD_SET) are **emitted last** to ensure the tree state is stable before updating the view.

Callers must not assume effects are atomic across multiple `apply()` calls; batch related changes into a single reducer invocation.

## Common patterns

### Structural mutations with focus

```
INDENT_NODE → [
  { type: "REPO_MOVE_NODE", nodeId: "N", newParentId: "P", sortOrder: 5 },
  { type: "PERSIST", description: "indent N" }
]
```

Mutation happens first, then a single PERSIST is emitted (not per-mutation).

### Text editing with selection

```
INSERT_NODE → [
  { type: "REPO_ADD_NODE", parentId: "P", node: {...}, selectAfter: true },
  { type: "INLINE_EDIT", nodeId: "NEW_ID", blockIndex: 0 },
  { type: "UNDO_START_BATCH", label: "insert item" }
]
```

The new node is added, cursor moves to it, and undo batching begins.

### Blocked operations

```
INDENT_NODE (on root, no previous sibling) → [
  { type: "bell" }
]
```

No state change; just auditory feedback. The reducer returns the same state.

## Concerning patterns — TODOs

- **TODO**: TreeEffect normalization is missing. Effects like `node_created` carry only node IDs; the runtime must look up the full node to inspect it. Consider adding `node?: KNode` to TreeEffect to avoid redundant lookups.
- **TODO**: Effect validation is only implemented for BoardEffect, not TreeEffect. Tree mutations should validate against the same invariants (item-allowed block types, h → item rule, etc.).
- **TODO**: Some edge cases in effect ordering — if a node is deleted then immediately added with the same ID (reuse), the selection transform may fail silently. Add comprehensive test coverage for effect sequences.

