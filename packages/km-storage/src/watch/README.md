# Watch -- Bidirectional Sync Pipeline

Bidirectional sync between SQLite database and markdown files on disk.

## Pipeline

```
DB-ORIGIN EVENTS (TUI edit, CLI command, agent action)
======================================================

  User action
       |
  Repo.mutate()
       |
  Emitter.emit(event)
       |
       |-- 1. Apply to DB ------> applyEventWithDb() [db-events.ts]
       |
       |-- 2. Persist ----------> append to .km/events.jsonl
       |
       |-- 3. Broadcast --------> eventHub.broadcast(event)
       |                           (React re-render via Zustand store)
       |
       '-- 4. FS sync ----------> FsSync.applyEventToFs(event)
                                    |
                           +--------+--------+
                           |                 |
                     SyncManager         FsWriter
                     (TUI: queue)        (CLI: sync write)
                           |
                     nodesToMarkdown()    -> serialize subtree
                     WriteQueue.queue()   -> debounce + retry + in-flight tracking
                     WriteQueue.flush()   -> writeFileSync with backoff


FS-ORIGIN EVENTS (external editor, git pull, Obsidian, Vim)
============================================================

  .md file changed on disk
       |
  Watcher (chokidar via WorkerWatcher or FileSystemWatcher)
       |
  Debounce (5s default, batches paths)
       |
  "sync" event -> SyncManager.handleFsSync()
       |
  reconcileDirectoryAsync()
       |-- scan FS entries (stat each file: path, ino, mtime)
       |-- query DB nodes under same directory
       '-- diff to generate ReconcileOps: create | update | rename | delete
               |
         applyReconcileOpsAsync()
               |-- parse .md files in parallel (parse pool)
               |-- for each op, dispatch to handler:
               |     create-handler  -> emit node_created for file + child nodes
               |     update-handler  -> diff existing vs new nodes, emit node_updated
               |     delete-handler  -> emit node_deleted (subtree)
               |     rename (delete) -> emit node_updated with new fs_path
               |
               '-- finalize: batch link resolution + index file sync

  Each handler calls Emitter.emit() with actor="fs-watch"
  -> step 4 (FS sync) is skipped because shouldApplyToFs("fs-watch") = false
  -> prevents infinite loop: FS change -> DB -> FS -> DB ...
```

## Module Responsibilities

### Orchestration

| Module         | Single Responsibility                                                     |
| -------------- | ------------------------------------------------------------------------- |
| `sync.ts`      | TUI mode: watcher lifecycle, WriteQueue, heartbeat reconciliation, DB->FS |
| `fs-writer.ts` | CLI mode: synchronous DB->FS write-back, no watcher, no debouncing        |
| `emitter.ts`   | 4-step event pipeline: DB apply -> persist -> broadcast -> FS sync        |

### FS -> DB

| Module                       | Single Responsibility                                           |
| ---------------------------- | --------------------------------------------------------------- |
| `watcher.ts`                 | Chokidar wrapper: FSEvents, debounced batching, in-flight set   |
| `worker-bridge.ts`           | Main-thread proxy: postMessage to worker, forward events back   |
| `worker-thread.ts`           | Worker thread: runs chokidar off main thread (avoids 20s block) |
| `reconcile.ts`               | Pure diff: compare FS entries to DB nodes, produce ReconcileOps |
| `applier.ts`                 | Dispatch ops to handlers, batch link resolution, index sync     |
| `handlers/create-handler.ts` | Parse new .md file, emit node_created for all nodes             |
| `handlers/update-handler.ts` | Diff old vs new nodes, emit minimal node_updated                |
| `handlers/delete-handler.ts` | Emit node_deleted (subtree), handle rename via path update      |
| `handlers/node-differ.ts`    | Structural diff: match existing vs parsed nodes by position     |

### DB -> FS

| Module              | Single Responsibility                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| `event-handlers.ts` | Unified node mutation handlers for DB->FS sync (shared by SyncManager + FsWriter) |
| `writequeue.ts`     | Debounced writes with retry, conflict detection, in-flight                        |
| `watch-utils.ts`    | Shared helpers: findFileNode (walk parent chain), titleToFilename                 |

### Shared

| Module         | Single Responsibility                                           |
| -------------- | --------------------------------------------------------------- |
| `db-events.ts` | Apply events to SQLite (switch on type -> INSERT/UPDATE/DELETE) |
| `types.ts`     | WatcherInterface, SyncData type definitions                     |

## Event Types

| Event Type          | DB Handler (db-events.ts)                 | FS Handler (sync/fs-writer)                           |
| ------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `node_created`      | INSERT into nodes                         | Create dir/file or regenerate parent file             |
| `node_updated`      | UPDATE matching columns + json_patch data | Regenerate containing .md file (+ folder/file rename) |
| `node_moved`        | UPDATE parent_id, parent_idx              | Regenerate both source and destination files          |
| `node_deleted`      | DELETE subtree (recursive)                | Unlink file/dir or regenerate parent file             |
| `task_claimed`      | SET assigned_to, status='wip'             | Regenerate containing .md file                        |
| `task_released`     | SET assigned_to=NULL, status='todo'       | Regenerate containing .md file                        |
| `task_completed`    | SET status='done', marker='[x]'           | Regenerate containing .md file                        |
| `session_started`   | No-op (no state.db impact)                | No-op                                                 |
| `session_message`   | No-op                                     | No-op                                                 |
| `session_tool_call` | No-op                                     | No-op                                                 |
| `session_ended`     | No-op                                     | No-op                                                 |
| `message`           | No-op                                     | No-op                                                 |
| `conflict_created`  | No-op                                     | No-op                                                 |

All events update the `meta.last_event` cursor in SQLite.

## Error Handling Rules

**Principle**: programming errors throw, filesystem errors log + continue.

### Emitter (emitter.ts)

- **Step 1 (DB apply)**: throws on failure -- DB consistency is non-negotiable.
- **Step 3 (broadcast)**: caught, logged. Broadcast failure must not block FS sync.
- **Step 4 (FS sync)**: errors with an `errno` code (ENOENT, EACCES, etc.) are logged
  and swallowed -- filesystem is best-effort. Errors WITHOUT an errno code are re-thrown
  as programming errors (null deref, type error, etc.).

### WriteQueue (writequeue.ts)

- **Transient errors** (EBUSY, EAGAIN, EMFILE, ENOSPC, EIO, ETIMEDOUT): retried with
  exponential backoff (100ms base, max 5s, 3 attempts, 10% jitter).
- **Permanent errors** (EACCES, EPERM, ENOENT, EROFS): no retry, emitted as events.
- **Permission errors**: emitted separately with user-actionable suggestions
  ("run chmod", "file owned by another user", etc.).
- **Conflicts**: detected via mtime comparison. Strategy is configurable:
  `last_write_wins` (default), `fs_wins` (discard write), `db_wins` (write + warn).

### Reconciliation (reconcile.ts, applier.ts)

- `reconcileDirectory()` catches stat errors per-entry (inaccessible files are skipped).
- `applyReconcileOps()` processing errors propagate up to SyncManager, which logs them
  and emits an "error" event but keeps running.
- `node-differ.ts`: three-phase matching (block_id → content hash → ordinal fallback)
  prevents identity drift when paragraphs are inserted or reordered.

## Ownership Model

**Core principle**: Each sync direction has ONE authority. No ping-pong.

| Direction | Trigger                   | Authority | File Write?      | Reconcile? |
| --------- | ------------------------- | --------- | ---------------- | ---------- |
| DB → FS   | User edit, CLI command    | **DB**    | YES (regenerate) | **NO**     |
| FS → DB   | External editor, git pull | **File**  | NO               | YES        |

### DB → FS (user edits)

DB is always correct. Event handlers regenerate files from DB state.
The watcher suppresses our own writes via WriteTokenMap (content-hash based ownership).

### FS → DB (external edits)

File is always correct. Watcher detects changes, reconciliation diffs
file content with DB, updates DB. Actor gating (`actor: "fs-watch"`)
prevents step 4 from writing the file back.

### Distinguishing our writes from external (WriteToken)

**WriteTokenMap** records SHA-256 content hashes after each successful write.
When the watcher sees a change, it computes the hash of the file content and
checks against the stored token:

- Hash matches → our write, consume token, skip reconciliation
- Hash differs → external edit, reconcile normally

Tokens are one-shot (consumed on check) and have no time-based expiry.
This replaces the old `recentWrites` timestamp window approach.

## Key Invariants

1. **Actor gating**: Events from `actor: "fs-watch"` skip step 4 (`shouldApplyToFs`
   returns false), preventing FS→DB→FS infinite loops.

2. **DB authority for user events**: DB is the source of truth for all user-initiated
   mutations. Event handlers regenerate files from DB state directly.

3. **Write suppression**: SyncManager's WriteTokenMap prevents the watcher from
   reconciling files we just wrote (content-hash based ownership).

4. **Apply before persist**: The DB is updated before events.jsonl is appended.
   A crash between steps 1 and 2 loses the event from the journal but the DB is
   correct — safer than the reverse, which would leave ghost events in the journal.

## SyncManager vs FsWriter

Both implement `FsSync.applyEventToFs()`, delegating to shared `EventHandlers` class
which handles all node mutation logic. Differ only in the `FsWriteTarget` they inject:

| Aspect             | SyncManager (TUI)                      | FsWriter (CLI)       |
| ------------------ | -------------------------------------- | -------------------- |
| FsWriteTarget      | WriteQueue (async, debounced, retried) | writeFileSync (sync) |
| Watcher            | Yes (chokidar + heartbeat)             | No                   |
| In-flight tracking | Yes (markInFlight/clearInFlight)       | No                   |
| Lifecycle          | Long-running, `await using`            | One-shot, GC'd       |
| Shared handlers    | EventHandlers class (unified logic)    | EventHandlers class  |

## Known Limitations

1. **~~Persist-before-apply ordering~~ (fixed)**: The emit pipeline now applies to the
   DB first (step 1), then persists to events.jsonl (step 2). A crash between these
   steps loses the event from the journal but leaves the DB in a correct state — the
   safer failure mode.

2. **Handler logic refactored**: SyncManager and FsWriter previously duplicated ~400 lines
   of event-to-FS handler logic. This is now unified via the `EventHandlers` class,
   which accepts a `FsWriteTarget` interface to abstract sync (FsWriter) vs async
   (SyncManager) write mechanisms.

3. **Watcher debounce latency**: Default 5s debounce delays external edits appearing in DB.
   Heartbeat (60s interval, 30s idle threshold) catches dropped FSEvents but adds latency.

4. **Single-directory reconciliation**: `handleFsSync` reconciles each changed directory
   independently. Cross-directory atomic operations (e.g., git checkout) may be partially
   applied if the watcher batches them across multiple sync events.
