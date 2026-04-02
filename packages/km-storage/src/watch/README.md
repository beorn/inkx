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
  Emitter.emit(event)  [= commit() + project()]
       |
       |-- commit():
       |     1. Apply to DB ------> applyEventWithDb() [db-events.ts]
       |     2. Persist ----------> append to .km/events.jsonl
       |     3. Broadcast --------> eventHub.broadcast(event)
       |
       '-- project():
             4. FS sync ----------> FsSync.applyEventToFs(event)
                                      |
                             +--------+--------+
                             |                 |
                       SyncManager         FsWriter
                       (TUI: queue)        (CLI: sync write)
                             |
                       nodesToMarkdown()    -> serialize subtree
                       WriteQueue.queue()   -> debounce + retry
                       WriteQueue.flush()   -> atomic write (temp+rename)
                             |
                       sync_state.recordProjection()  -> baseline hash
                       writeTokens.record()           -> hot cache


FS-ORIGIN EVENTS (external editor, git pull, Obsidian, Vim)
============================================================

  .md file changed on disk
       |
  Watcher (chokidar via WorkerWatcher or FileSystemWatcher)
       |
  Debounce (5s default, configurable via SyncConfig.debounceFs)
       |
  "sync" event -> SyncManager.handleFsSync()
       |
  ReconciliationEngine.reconcileAsync()
       |-- scan FS entries (stat each file: path, ino, mtime)
       |-- query DB nodes under same directory
       |-- diff to generate ReconcileOps: create | update | rename | delete
       |-- filter owned writes (two-tier: WriteTokenMap → sync_state)
       |-- filter pending WriteQueue paths
       |
  applyReconcileOpsAsync()
       |-- parse .md files in parallel (parse pool)
       |-- for each op, dispatch to handler:
       |     create-handler  -> emit node_created for file + child nodes
       |     update-handler  -> three-phase diff (block_id → content hash → ordinal)
       |     delete-handler  -> emit node_deleted (subtree)
       |     rename (delete) -> emit node_updated with new fs_path
       |
       '-- finalize: batch link resolution + index file sync

  Handlers call Emitter.commit() (not emit/project)
  -> step 4 (FS sync) structurally cannot run for FS-origin events
  -> prevents infinite loop: FS change -> DB -> FS -> DB ...

  After reconciliation: sync_state.recordObservation() for each file
```

## Architecture

### Emitter: commit/project Split

The emitter has three methods:

- `commit(event)` — DB apply + persist + broadcast. No filesystem writes.
- `project(event)` — FS sync only. Writes files via EventHandlers.
- `emit(event)` — Convenience: `commit()` then `project()`. Used by TUI-origin events.

FS-origin reconciliation uses `commit()` only. This structurally prevents echo loops —
the filesystem projector never runs for watcher-detected changes.

### Ownership: Two-Tier Detection

| Tier          | Storage       | Speed              | Survives Restart | Purpose                     |
| ------------- | ------------- | ------------------ | ---------------- | --------------------------- |
| WriteTokenMap | In-memory Map | O(1)               | No               | Hot cache for recent writes |
| sync_state    | SQLite table  | O(1) prepared stmt | Yes              | Durable baseline hash       |

After writing a file: record in BOTH tiers.
On watcher event: check WriteTokenMap first (fast), fall back to sync_state.
Match = our write, skip reconciliation. No match = external edit, reconcile.

### sync_state Table

```sql
CREATE TABLE sync_state (
  fs_path TEXT PRIMARY KEY,
  node_id TEXT,
  baseline_hash TEXT NOT NULL,
  baseline_kind TEXT NOT NULL DEFAULT 'projected',  -- 'projected' | 'observed'
  last_seen_mtime_ns INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);
```

- `baseline_hash`: SHA-256 of bytes on disk matching current DB state
- `projected`: we wrote these bytes (DB→FS)
- `observed`: we reconciled these bytes (FS→DB)
- `dirty`: write failed, needs re-projection by heartbeat

## Module Responsibilities

### Orchestration

| Module                     | Single Responsibility                                                   |
| -------------------------- | ----------------------------------------------------------------------- |
| `sync.ts`                  | TUI mode: watcher lifecycle, WriteQueue, heartbeat, delegates to engine |
| `reconciliation-engine.ts` | FS→DB: owned-write filtering, reconciliation, observation recording     |
| `fs-writer.ts`             | CLI mode: synchronous DB→FS write-back, no watcher, no debouncing       |
| `emitter.ts`               | commit/project split: DB+persist+broadcast vs FS projection             |

### FS → DB

| Module                       | Single Responsibility                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| `watcher.ts`                 | Chokidar wrapper: FSEvents, debounced batching, in-flight set    |
| `worker-bridge.ts`           | Main-thread proxy: postMessage to worker, forward events back    |
| `worker-thread.ts`           | Worker thread: runs chokidar off main thread (avoids 20s block)  |
| `reconcile.ts`               | Pure diff: compare FS entries to DB nodes, produce ReconcileOps  |
| `applier.ts`                 | Dispatch ops to handlers, batch link resolution, index sync      |
| `handlers/create-handler.ts` | Parse new .md file, emit node_created for all nodes              |
| `handlers/update-handler.ts` | Diff old vs new nodes, emit minimal node_updated                 |
| `handlers/delete-handler.ts` | Emit node_deleted (subtree), handle rename via path update       |
| `handlers/node-differ.ts`    | Three-phase matching: block_id → content hash → ordinal fallback |

### DB → FS

| Module              | Single Responsibility                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| `event-handlers.ts` | Unified node mutation handlers for DB→FS sync (shared by SyncManager + FsWriter) |
| `writequeue.ts`     | Atomic writes (temp+rename), retry, conflict detection, pending path rewrite     |
| `watch-utils.ts`    | Shared helpers: findFileNode (walk parent chain), titleToFilename                |

### Ownership Tracking

| Module            | Single Responsibility                                     |
| ----------------- | --------------------------------------------------------- |
| `write-tokens.ts` | In-memory content-hash cache (hot path, not restart-safe) |
| `sync-state.ts`   | Persisted baseline hash in SQLite (durable, restart-safe) |

### Shared

| Module         | Single Responsibility                                           |
| -------------- | --------------------------------------------------------------- |
| `db-events.ts` | Apply events to SQLite (switch on type -> INSERT/UPDATE/DELETE) |
| `types.ts`     | WatcherInterface, SyncData type definitions                     |

## Event Types

| Event Type       | DB Handler (db-events.ts)                 | FS Handler (sync/fs-writer)                           |
| ---------------- | ----------------------------------------- | ----------------------------------------------------- |
| `node_created`   | INSERT into nodes                         | Create dir/file or regenerate parent file             |
| `node_updated`   | UPDATE matching columns + json_patch data | Regenerate containing .md file (+ folder/file rename) |
| `node_moved`     | UPDATE parent_id, parent_idx              | Regenerate both source and destination files          |
| `node_deleted`   | DELETE subtree (recursive)                | Unlink file/dir or regenerate parent file             |
| `task_claimed`   | SET assigned_to, status='wip'             | Regenerate containing .md file                        |
| `task_released`  | SET assigned_to=NULL, status='todo'       | Regenerate containing .md file                        |
| `task_completed` | SET status='done', marker='[x]'           | Regenerate containing .md file                        |

All events carry `origin?: "tui" | "fs" | "replay" | "system"` for provenance tracking.

## Error Handling Rules

**Principle**: programming errors throw, filesystem errors log + continue.

### Emitter (emitter.ts)

- **Step 1 (DB apply)**: throws on failure -- DB consistency is non-negotiable.
- **Step 2 (persist)**: caught, logged. Journal failure must not block broadcast or FS sync.
- **Step 3 (broadcast)**: caught, logged. Broadcast failure must not block FS sync.
- **Step 4 (FS sync)**: errors with an `errno` code (ENOENT, EACCES, etc.) are logged
  and swallowed -- filesystem is best-effort. Errors WITHOUT an errno code are re-thrown
  as programming errors (null deref, type error, etc.).

### WriteQueue (writequeue.ts)

- **Atomic writes**: temp file (.km-tmp) + rename into place. Watchers see rename, not partial content.
- **Transient errors** (EBUSY, EAGAIN, EMFILE, ENOSPC, EIO, ETIMEDOUT): retried with
  exponential backoff (configurable: default 100ms base, max 5s, 3 attempts).
- **Permanent errors** (EACCES, EPERM, ENOENT, EROFS): no retry, path marked dirty in sync_state.
- **Pending path rewrite**: `renamePending()` and `renamePendingSubtree()` rewrite queued
  paths before rename, preventing stale-path writes.
- **Conflicts**: detected via mtime comparison. Strategy is configurable:
  `last_write_wins` (default), `fs_wins` (discard write), `db_wins` (write + warn).

### Reconciliation

- Each directory reconciled independently; one bad directory doesn't abort the rest.
- Parse errors skip the file (no permanent stubs), logged at WARN.
- `node-differ.ts`: three-phase matching (block_id → content hash → ordinal fallback)
  prevents identity drift when paragraphs are inserted or reordered.
- Displaced node detection verifies inode before deletion (prevents accidental content loss
  on concurrent renames).

## Ownership Model

**Core principle**: Each sync direction has ONE authority. No ping-pong.

| Direction | Trigger                   | Authority | File Write?      | Reconcile? |
| --------- | ------------------------- | --------- | ---------------- | ---------- |
| DB → FS   | User edit, CLI command    | **DB**    | YES (regenerate) | **NO**     |
| FS → DB   | External editor, git pull | **File**  | NO               | YES        |

### DB → FS (user edits)

DB is always correct. Event handlers regenerate files from DB state.
The watcher suppresses our own writes via two-tier ownership (WriteTokenMap + sync_state).

### FS → DB (external edits)

File is always correct. Watcher detects changes, ReconciliationEngine diffs
file content with DB, updates DB via `commit()` (no FS projection).

### Distinguishing our writes from external

Two-tier ownership detection:

1. **WriteTokenMap** (in-memory): SHA-256 hash recorded after each successful write.
   Fast O(1) check. Not restart-safe.
2. **sync_state table** (SQLite): Persisted baseline hash. Checked when WriteTokenMap
   misses. Restart-safe.

Match = our write, skip. No match = external edit, reconcile.

### Heartbeat Reconciliation

Periodic anti-entropy check (configurable interval, default 60s, only when idle 30s+):

1. Reconcile all directories to catch silently dropped watcher events
2. Re-project dirty paths (files where WriteQueue failed permanently)
3. Clear dirty flags after successful re-projection

## Key Invariants

1. **Structural loop prevention**: FS-origin events use `commit()` (no `project()`),
   so they structurally cannot trigger filesystem writes.

2. **DB authority for user events**: DB is the source of truth for all user-initiated
   mutations. Event handlers regenerate files from DB state directly.

3. **Two-tier write suppression**: WriteTokenMap (hot) + sync_state (durable) prevent
   the watcher from reconciling files we just wrote.

4. **Apply before persist**: The DB is updated before events.jsonl is appended.
   A crash between steps 1 and 2 loses the event from the journal but the DB is
   correct — safer than the reverse.

5. **Atomic writes**: WriteQueue writes to `.km-tmp` then renames into place.
   External readers never see partial content.

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

## Configuration

All timing constants are configurable via `SyncConfig`:

| Constant                 | Default | Config Key                  |
| ------------------------ | ------- | --------------------------- |
| FS debounce              | 5000ms  | `debounceFs`                |
| Apply debounce           | 3000ms  | `debounceApply`             |
| Heartbeat interval       | 60000ms | `heartbeat.intervalMs`      |
| Heartbeat idle threshold | 30000ms | `heartbeat.idleThresholdMs` |
| Max retries              | 3       | `retry.maxRetries`          |
| Retry base delay         | 100ms   | `retry.baseDelayMs`         |
| Retry max delay          | 5000ms  | `retry.maxDelayMs`          |
| Clear in-flight delay    | 1000ms  | `clearInFlightDelayMs`      |
