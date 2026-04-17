# Changes — reference

A **change** is the persisted record of a storage mutation. The final stage of the unified pipeline: event → command → op → apply → effect → **change**. Changes flow to the journal, to FS sync, and to in-memory listeners.

For storage's role, see [design/model/storage.md](../design/model/storage.md). For TEA effects (which are ephemeral, not persisted), see [effects.md](effects.md).

## Overview

The change log (`changes.jsonl`) is km's audit trail and replication feed. Every mutation to the data model produces exactly one Change record, which is:

1. Applied to the SQLite database (primary operation)
2. Appended to `changes.jsonl` (journal for recovery and replication)
3. Broadcast via `ChangeHub` (real-time subscriptions, e.g., TUI, web clients)
4. Projected to the filesystem (if `origin` is not "fs", to avoid echo loops)

Changes are **immutable**, **globally sortable** (by ULID), and carry provenance information (`origin`, `actor`) for conflict resolution and replay.

## Change type

Defined in `packages/km-core/src/types.ts:352–383`.

```typescript
export type ChangeType =
  // Node lifecycle
  | "node_created"
  | "node_updated"
  | "node_moved"
  | "node_deleted"
  // Task lifecycle
  | "task_claimed"
  | "task_released"
  | "task_completed"
  // Session (for agents)
  | "session_started"
  | "session_message"
  | "session_tool_call"
  | "session_ended"
  // Messaging
  | "message"
  // Sync
  | "conflict_created"

export interface Change {
  id: string                                        // ULID (globally unique, sortable)
  type: ChangeType
  actor: string                                     // Who caused this (user, agent, 'system', 'fs-watch')
  target?: string                                   // What it affects (node ID, task ID, session ID, etc.)
  data: Record<string, unknown>                     // Type-specific payload
  ts: number                                        // Unix milliseconds
  origin?: "tui" | "fs" | "replay" | "system"      // Source of the change
}
```

### Node lifecycle changes

| Type | Purpose | Emitted by | Payload shape |
|------|---------|-----------|---------------|
| `node_created` | A new node was inserted into the tree. | `emitNodeCreated()` in `packages/km-storage/src/emitter.ts:203` | `NodeCreatedData` (see below) |
| `node_updated` | One or more fields on an existing node changed. | `emitNodeUpdated()` in emitter.ts:206 | `NodeUpdatedData` — `{ [key: string]: unknown }` (any changed fields) |
| `node_moved` | A node was reparented (changed parent or sort order). | `emitNodeMoved()` in emitter.ts:209 | `NodeMovedData` — `{ parent_id: string \| null, parent_idx?: number }` |
| `node_deleted` | A node was removed from the tree. | `emitNodeDeleted()` in emitter.ts:212 | `{ reason: string }` — e.g., "user delete", "fs sync" |

### Task lifecycle changes

| Type | Purpose | Emitted by | Payload shape |
|------|---------|-----------|---------------|
| `task_claimed` | A task was assigned to a user. | (internal or custom caller) | `{ assigned_to: string }` |
| `task_released` | A task was unassigned. | (internal or custom caller) | `{ assigned_to: null }` |
| `task_completed` | A task status changed to "done" or was marked as completed. | (internal or custom caller) | `{ status: "done", completed_at: number }` |

### Session changes (for agents and interactive sessions)

| Type | Purpose | Emitted by | Payload shape |
|------|---------|-----------|---------------|
| `session_started` | A new session (agent or REPL) began. | (agent framework) | `SessionStartedData` — `{ session_id: string, model: string, system_prompt_hash?: string }` |
| `session_message` | A message was sent in a session. | (agent framework) | `SessionMessageData` — `{ session_id: string, role: "user" \| "assistant" \| "system", content: string, tokens?: number }` |
| `session_tool_call` | A session invoked a tool. | (agent framework) | `SessionToolCallData` — `{ session_id: string, tool: string, args: Record<string, unknown>, result?: unknown, tokens?: number }` |
| `session_ended` | A session completed or was cancelled. | (agent framework) | `SessionEndedData` — `{ session_id: string, status: "success" \| "error" \| "cancelled", total_tokens?: number, cost_usd?: number, files_modified?: string[], summary?: string, error?: string }` |

### Messaging

| Type | Purpose | Emitted by | Payload shape |
|------|---------|-----------|---------------|
| `message` | A generic message (chat, notification, broadcast). | (custom caller) | `{ content: string, [key: string]: unknown }` |

### Sync and conflicts

| Type | Purpose | Emitted by | Payload shape |
|------|---------|-----------|---------------|
| `conflict_created` | A merge conflict was detected (e.g., concurrent edits to the same node). | (sync resolver) | `{ conflicting_nodes: string[], resolution_status: "pending" \| "resolved" }` |

## Data type interfaces

All defined in `packages/km-core/src/types.ts:385–450`.

### NodeCreatedData

```typescript
export interface NodeCreatedData {
  id: string
  type: NodeType
  item?: ItemData
  parent_id?: string | null
  parent_idx?: number
  fstype?: FsType
  embed_of?: string | null
  fs_path?: string
  fs_ino?: number
  fs_mtime?: number
  name?: string
  block_id?: string
  md_pos?: number
  md_line?: number
  assigned_to?: string
  due_at?: string
  start_at?: string
  priority?: string
  title?: string
  content?: string
  content_hash?: string
  rules?: NodeRules
  data?: Record<string, unknown>
}
```

Minimal set: `{ id, type, parent_id }`. Optional fields are only included if they differ from defaults.

### NodeUpdatedData

```typescript
export interface NodeUpdatedData {
  [key: string]: unknown
}
```

Only the changed fields are included. For example: `{ content: "new text", updated_at: 1708321200000 }`.

### NodeMovedData

```typescript
export interface NodeMovedData {
  parent_id: string | null
  parent_idx?: number
}
```

The new parent and sort order. `parent_id: null` means the node is now a root.

### SessionStartedData, SessionMessageData, SessionToolCallData, SessionEndedData

See [types.ts:421–450](packages/km-core/src/types.ts) for precise shapes. These record the full lifecycle of an agent or interactive session.

## The origin field

The `origin` field (optional, defaults to undefined) indicates where the change came from:

| Origin | Meaning | Projection |
|--------|---------|-----------|
| `"tui"` | User action in the TUI (keyboard, menu, etc.). | Project to FS (write files). |
| `"fs"` | Change detected by filesystem watcher. | Do NOT project to FS (would echo). Call `emitter.commit()` instead of `emitter.apply()`. |
| `"replay"` | Change from replaying a recorded session or journal. | Do NOT project to FS (already happened). |
| `"system"` | Internal system change (e.g., auto-cleanup, scheduled task). | Project to FS if it's a user-visible mutation; skip if internal-only. |
| `undefined` | Origin unknown (legacy or external source). | Default behavior: project to FS. |

**Projection contract**: When a change has `origin: "fs"`, the system uses `emitter.commit()` to apply it without firing `onApply()` callbacks. This prevents filesystem loops where a file watcher change is written back to disk.

## Emission patterns

### From TUI operations

```typescript
// User indents a node via keyboard
// board-actions.ts calls repo.moveNode(nodeId, newParentId, newSortOrder)
// which emits:
{
  type: "node_moved",
  actor: "user",              // username or "system"
  target: "abc123",           // the node ID
  data: { parent_id: "xyz", parent_idx: 3 },
  origin: "tui"
}
```

### From filesystem sync

```typescript
// Watcher detects .md file changed on disk
// loader.ts parses file and emits:
{
  type: "node_created",
  actor: "fs-watch",
  target: "abc123",
  data: NodeCreatedData,
  origin: "fs"
}
```

### From agent execution

```typescript
// Agent tool call completes
// agent framework emits:
{
  type: "session_tool_call",
  actor: "agent-name",
  target: "session-id",
  data: { session_id: "...", tool: "api_call", args: {...}, result: {...} },
  origin: "system"
}
```

## Common patterns

### Task status change

```typescript
{
  type: "node_updated",
  actor: "user",
  target: "task-node-id",
  data: { 
    item: { list: "-", task: { marker: "[x]", status: "done" } },
    updated_at: 1708321200000 
  }
}
```

The full `item` object is included to preserve list markers and other traits.

### Reparent due to indent

```typescript
{
  type: "node_moved",
  actor: "user",
  target: "child-node-id",
  data: { parent_id: "new-parent-id", parent_idx: 5 }
}
```

### Concurrent edits conflict

```typescript
{
  type: "conflict_created",
  actor: "system",
  target: "conflict-id",
  data: { 
    conflicting_nodes: ["node-1-id", "node-2-id"],
    resolution_status: "pending"
  }
}
```

## Concerning patterns

### Invariants

- **Every `node_created` must include `parent_id`** (even if null for roots). Missing parent would make the node unreachable.
- **`node_moved` and `node_updated` require `target`**. Without it, the change is ambiguous.
- **`task_claimed` and `task_released` are complementary**. If a task is claimed without first being released, the prior assignment is silently overwritten.

### Edge cases

- **TODO**: `node_deleted` does not cascade to children. If a parent is deleted and later children are observed to exist, the relationship is lost. Consider whether deletes should be explicit per-node or bulk-delete subtree in a single record.
- **TODO**: `node_updated` for large content changes (KB+ files) are written fully to `changes.jsonl`, creating bloat. Content-hashing or external storage (content-addressable blob store) could defer the full content.
- **TODO**: Concurrent `node_updated` records on the same node with overlapping fields have undefined merge semantics. Define a merge function (last-write-wins, field-wise merge, CRDTs?) and document it.

## Replaying changes

Changes can be replayed from `changes.jsonl` by:

1. Loading all changes sorted by ULID
2. For each change, calling `emitter.apply()` with `origin: "replay"`
3. Skipping FS projection (origin prevents it)
4. Rebuilding the entire state deterministically

This is how disaster recovery and CRDT sync work. The change log is the ground truth.

