# Changes — reference

A **change** is the persisted record of a storage mutation. The final stage of the unified pipeline: event → command → op → apply → effect → **change**. Changes flow to the journal, to FS sync, and to in-memory listeners.

For storage's role, see [design/model/storage.md](../design/model/storage.md). For TEA effects (which are ephemeral, not persisted), see [effects.md](effects.md).

## Overview

The change log lives in the `events` table inside `.km/state.db` and is km's audit trail and replication feed. Every mutation to the data model produces exactly one Change record, which is:

1. Applied to the SQLite database (primary operation)
2. Inserted into the `events` table inside the same SAVEPOINT (journal for recovery and replication; cannot drift from the snapshot)
3. Broadcast via `ChangeHub` (real-time subscriptions, e.g., TUI, web clients)
4. Projected to the filesystem (only when emitted via `emitter.apply()` — `emitter.commit()` skips this step to break echo loops)

Changes are **immutable**, **globally sortable** (by ULID), and carry provenance information (`actor`, `source`) for conflict resolution and replay.

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
  origin?: "tui" | "fs" | "replay" | "system"      // Legacy provenance hint, retained for replay of pre-v12 events; has no live consumers — routing is driven by `actor` + the `commit()` vs `apply()` split
}
```

> Note on provenance routing. Pre-v12 the Change.origin field controlled whether the FS-projection subscriber fired. That role has migrated to two cleaner mechanisms:
> 
> * actor — denormalized into its own events column for indexed queries and conflict resolution.
> * source (an EmitOptions field, denormalized to events.source) — defensive marker for FS-import replay (e.g., "fs-import").
> * commit() vs apply() — commit() structurally bypasses onApply callbacks (FS projection), so replayed FS-origin changes can never echo-loop back to disk. apply() fires the full pipeline.
> 
> origin is preserved on the type so historical event payloads round-trip without information loss; new code should not read or write it.

### Node lifecycle changes

| Type         | Purpose                                               | Emitted by                                                  | Payload shape                                                      |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| node_created | A new node was inserted into the tree.                | emitNodeCreated() in packages/km-storage/src/emitter.ts:203 | NodeCreatedData (see below)                                        |
| node_updated | One or more fields on an existing node changed.       | emitNodeUpdated() in emitter.ts:206                         | NodeUpdatedData — { [key: string]: unknown } (any changed fields)  |
| node_moved   | A node was reparented (changed parent or sort order). | emitNodeMoved() in emitter.ts:209                           | NodeMovedData — { parent_id: string \| null, parent_idx?: number } |
| node_deleted | A node was removed from the tree.                     | emitNodeDeleted() in emitter.ts:212                         | { reason: string } — e.g., "user delete", "fs sync"                |

### Task lifecycle changes

| Type           | Purpose                                                     | Emitted by                  | Payload shape                            |
| -------------- | ----------------------------------------------------------- | --------------------------- | ---------------------------------------- |
| task_claimed   | A task was assigned to a user.                              | (internal or custom caller) | { assigned_to: string }                  |
| task_released  | A task was unassigned.                                      | (internal or custom caller) | { assigned_to: null }                    |
| task_completed | A task status changed to "done" or was marked as completed. | (internal or custom caller) | { status: "done", completed_at: number } |

### Session changes (for agents and interactive sessions)

| Type              | Purpose                               | Emitted by        | Payload shape                                                                                                                                                                                 |
| ----------------- | ------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session_started   | A new session (agent or REPL) began.  | (agent framework) | SessionStartedData — { session_id: string, model: string, system_prompt_hash?: string }                                                                                                       |
| session_message   | A message was sent in a session.      | (agent framework) | SessionMessageData — { session_id: string, role: "user" \| "assistant" \| "system", content: string, tokens?: number }                                                                        |
| session_tool_call | A session invoked a tool.             | (agent framework) | SessionToolCallData — { session_id: string, tool: string, args: Record<string, unknown>, result?: unknown, tokens?: number }                                                                  |
| session_ended     | A session completed or was cancelled. | (agent framework) | SessionEndedData — { session_id: string, status: "success" \| "error" \| "cancelled", total_tokens?: number, cost_usd?: number, files_modified?: string[], summary?: string, error?: string } |

### Messaging

| Type    | Purpose                                            | Emitted by      | Payload shape                               |
| ------- | -------------------------------------------------- | --------------- | ------------------------------------------- |
| message | A generic message (chat, notification, broadcast). | (custom caller) | { content: string, [key: string]: unknown } |

### Sync and conflicts

| Type             | Purpose                                                                  | Emitted by      | Payload shape                                                               |
| ---------------- | ------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------- |
| conflict_created | A merge conflict was detected (e.g., concurrent edits to the same node). | (sync resolver) | { conflicting_nodes: string[], resolution_status: "pending" \| "resolved" } |

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
  fs_dev?: number
  fs_ino?: number
  fs_mtime?: number
  fs_size?: number
  fs_content_hash?: string
  name?: string
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

## Provenance: actor, source, and the commit/apply split

Three signals carry "who/what produced this change" and how subscribers should react:

- **`actor`** (required, on the `Change`): identity. `"user"`, `"fs-watch"`, `"system"`, an agent id, etc. Indexed on the events table for filtered audit queries.
- **`source`** (optional, on `EmitOptions` and the `events.source` column): replay marker. Set to `"fs-import"` by the loader when replaying events whose effects are already on disk; subscribers can use it to skip work.
- **`emitter.commit()` vs `emitter.apply()`**: structural routing. `commit()` writes to the DB + events row + broadcast but does NOT fire `onApply` subscribers (the fs-writer is registered via `onApply`). `apply()` fires everything. The fs-watch path uses `commit()` so a watcher-detected change cannot echo-loop back to disk.

| Scenario                           | actor                  | source      | Method                                                             | Why                                                 |
| ---------------------------------- | ---------------------- | ----------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| User edit in TUI                   | "user"                 | (none)      | apply()                                                            | Full pipeline including FS projection               |
| File watcher detected change       | "fs-watch"             | (none)      | commit()                                                           | Skip onApply — would re-write the file we just read |
| Cold-load replay from events table | (preserved from event) | "fs-import" | commit() + skipPersist: true                                       | Don't re-insert events row; don't re-project to FS  |
| Agent tool call                    | "agent-<name>"         | (varies)    | apply()                                                            | Agent edits should land in files                    |
| System cleanup                     | "system"               | (none)      | apply() or commit() depending on whether it should propagate to FS |                                                     |

The legacy `Change.origin` field was retired in favor of this split. It still exists on the type for round-tripping pre-v12 payloads, but no live code reads or writes it.

## Emission patterns

### From TUI operations

```typescript
// User indents a node via keyboard
// board-actions.ts calls repo.moveNode(nodeId, newParentId, newSortOrder)
// which routes through emitter.apply():
{
  type: "node_moved",
  actor: "user",              // username or "system"
  target: "abc123",           // the node ID
  data: { parent_id: "xyz", parent_idx: 3 },
}
```

### From filesystem sync

```typescript
// Watcher detects .md file changed on disk
// change-handlers.ts calls emitter.commit() to skip the FS-projection
// callback (which would re-write the file we just read):
{
  type: "node_created",
  actor: "fs-watch",
  target: "abc123",
  data: NodeCreatedData,
}
```

### From agent execution

```typescript
// Agent tool call completes; emitter.apply() so files are written
{
  type: "session_tool_call",
  actor: "agent-name",
  target: "session-id",
  data: { session_id: "...", tool: "api_call", args: {...}, result: {...} },
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
- **TODO**: `node_updated` for large content changes (KB+ files) are written fully into the events table, creating bloat. Content-hashing or external storage (content-addressable blob store) could defer the full content.
- **TODO**: Concurrent `node_updated` records on the same node with overlapping fields have undefined merge semantics. Define a merge function (last-write-wins, field-wise merge, CRDTs?) and document it.

## Replaying changes

Changes can be replayed from the events table by:

1. `readEventsAfter(db, fromSeq)` — pulls every event row past the given high-water mark, in `seq` order
2. For each change, calling `emitter.commit()` with `skipPersist: true` (the row already exists in the events table; re-inserting would duplicate)
3. Skipping FS projection (commit() bypasses onApply, preventing the echo loop where replayed changes get re-projected to the filesystem)
4. Stamping the new high-water mark via `writeLastEventSeq(db, maxSeq)` so the next startup skips the prefix it already saw

This is how disaster recovery and CRDT sync work. The change log is the ground truth.

