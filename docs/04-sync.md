# Sync

> **Status: Disk mode only** — Requires `km init`.

Bidirectional filesystem ↔ SQLite synchronization.

---

## Overview

km-watch maintains sync between:

- **Filesystem** — Markdown files
- **SQLite** — state.db (fast queries)
- **Events** — events.jsonl (audit log)

Changes flow both directions with conflict resolution and round-trip prevention.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Filesystem                                                 │
│      │                                                      │
│      ▼                                                      │
│  FSWatcher ──► Debounce 5s ──► Scan ──► Reconcile           │
│                                              │              │
│                                              ▼              │
│                                         emit(events)        │
│                                              │              │
│                                              ▼              │
│                                         state.db            │
│                                              │              │
│                                              ▼              │
│  Apply ◄── Debounce 3s ◄── Pending Ops ◄────┘              │
│      │                                                      │
│      ▼                                                      │
│  Filesystem                                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Filesystem Watching

### Watch Strategy

Use native filesystem events (FSEvents on macOS, inotify on Linux):

```typescript
import { FSWatcher } from "chokidar";

class FileSystemWatcher {
  private watcher: FSWatcher;
  private pendingPaths: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;

  start(vaultPath: string) {
    this.watcher = new FSWatcher({
      persistent: true,
      ignoreInitial: true,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.km/**",
        "**/.*", // Hidden files
      ],
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.add(vaultPath);

    this.watcher.on("all", (event, path) => {
      this.pendingPaths.add(path);
      this.scheduleSync();
    });
  }

  private scheduleSync() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.sync();
    }, 5000); // 5 second debounce
  }
}
```

### File Identification

Files identified by inode + path for rename detection:

```typescript
interface FileIdentity {
  ino: number; // Inode number (stable across renames)
  path: string; // Current path
  mtime: number; // Modification time
  size: number; // File size
}
```

---

## Reconciliation

### Directory Scan

Compare filesystem state to SQLite state:

```typescript
async function reconcileDirectory(dir: string): Promise<Op[]> {
  const ops: Op[] = [];

  // Get filesystem state
  const fsEntries = await scanDirectory(dir);

  // Get database state
  const dbNodes = db.all(
    `
    SELECT * FROM nodes
    WHERE fs_path LIKE ? || '%'
    AND (type = 'folder' OR type = 'file')
  `,
    [dir],
  );

  // Index by inode for rename detection
  const dbByIno = new Map(dbNodes.map((n) => [n.fs_ino, n]));
  const dbByPath = new Map(dbNodes.map((n) => [n.fs_path, n]));

  for (const entry of fsEntries) {
    const existingByIno = dbByIno.get(entry.ino);
    const existingByPath = dbByPath.get(entry.path);

    if (existingByIno && existingByIno.fs_path !== entry.path) {
      // Renamed (same inode, different path)
      ops.push({
        type: "rename",
        node_id: existingByIno.id,
        old_path: existingByIno.fs_path,
        new_path: entry.path,
      });
    } else if (!existingByPath) {
      // New file
      ops.push({ type: "create", path: entry.path, ino: entry.ino });
    } else if (entry.mtime > existingByPath.updated_at) {
      // Modified
      ops.push({
        type: "update",
        node_id: existingByPath.id,
        path: entry.path,
      });
    }

    dbByPath.delete(entry.path);
  }

  // Remaining in dbByPath are deleted
  for (const [path, node] of dbByPath) {
    ops.push({ type: "delete", node_id: node.id, path });
  }

  return ops;
}
```

---

## Pending Operations Queue

Apply database changes to filesystem with debouncing:

```typescript
class WriteQueue {
  private pending: Map<string, PendingWrite> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;

  queue(write: PendingWrite) {
    // Coalesce writes to same file
    this.pending.set(write.path, write);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, 3000); // 3 second debounce
  }

  private async flush() {
    const writes = [...this.pending.values()];
    this.pending.clear();

    // Mark as "in-flight" to prevent watch triggering re-sync
    for (const write of writes) {
      inFlightWrites.add(write.path);
    }

    for (const write of writes) {
      await fs.writeFile(write.path, write.content);
    }

    // Clear in-flight after delay
    setTimeout(() => {
      for (const write of writes) {
        inFlightWrites.delete(write.path);
      }
    }, 1000);
  }
}
```

---

## Round-Trip Prevention

### Problem

```
Edit file → watch → emit → state.db → apply → write file → watch → ...
```

### Solutions

**1. In-Flight Tracking**

```typescript
const inFlightWrites = new Set<string>();

watcher.on("change", (path) => {
  if (inFlightWrites.has(path)) {
    return; // Skip - this is our own write
  }
  pendingPaths.add(path);
});
```

**2. Content Hash Comparison**

```typescript
async function handleUpdate(op: UpdateOp): Promise<void> {
  const content = await fs.readFile(op.path, "utf-8");
  const contentHash = hash(content);

  const existing = db.get(`SELECT content_hash FROM nodes WHERE fs_path = ?`, [
    op.path,
  ]);

  if (existing?.content_hash === contentHash) {
    return; // No actual change
  }
  // Process change...
}
```

**3. Event Source Tracking**

```typescript
// Mark source when emitting
emit({ type: 'node_updated', actor: 'fs-watch', ... })

// Don't apply events that came from filesystem
function shouldApplyToFs(event: Event): boolean {
  return event.actor !== 'fs-watch'
}
```

---

## Conflict Resolution

### Same-Time Edits

When file changes in both filesystem and database simultaneously:

```typescript
enum ConflictStrategy {
  LAST_WRITE_WINS,
  FILESYSTEM_WINS,
  DATABASE_WINS,
  MERGE,
}

async function resolveConflict(
  fsContent: string,
  dbContent: string,
  strategy: ConflictStrategy,
): Promise<string> {
  switch (strategy) {
    case ConflictStrategy.LAST_WRITE_WINS:
      const fsMtime = (await fs.stat(path)).mtimeMs;
      const dbMtime = db.get("SELECT updated_at FROM nodes WHERE fs_path = ?", [
        path,
      ]);
      return fsMtime > dbMtime ? fsContent : dbContent;

    case ConflictStrategy.FILESYSTEM_WINS:
      return fsContent;

    case ConflictStrategy.DATABASE_WINS:
      return dbContent;

    case ConflictStrategy.MERGE:
      return threeWayMerge(commonAncestor, fsContent, dbContent);
  }
}
```

### Conflict Markers

When merge fails, create conflict file:

```typescript
async function createConflictFile(
  path: string,
  fsContent: string,
  dbContent: string,
): Promise<void> {
  const conflictPath = path.replace(".md", ".conflict.md");

  const content = `# Conflict: ${basename(path)}

## Filesystem Version

${fsContent}

---

## Database Version

${dbContent}
`;

  await fs.writeFile(conflictPath, content);
  emit({
    type: "conflict_created",
    actor: "system",
    data: { original_path: path, conflict_path: conflictPath },
  });
}
```

---

## State Machine

```
                    ┌─────────────┐
                    │    IDLE     │
                    └──────┬──────┘
                           │
            FS Event ──────┼────── DB Event
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    ┌─────────────────┐       ┌─────────────────┐
    │  FS_DEBOUNCING  │       │  DB_DEBOUNCING  │
    └────────┬────────┘       └────────┬────────┘
             │                         │
        5s timeout                3s timeout
             │                         │
             ▼                         ▼
    ┌─────────────────┐       ┌─────────────────┐
    │   RECONCILING   │       │    APPLYING     │
    └────────┬────────┘       └────────┬────────┘
             │                         │
             ▼                         ▼
    ┌─────────────────┐       ┌─────────────────┐
    │    EMITTING     │       │    WRITING      │
    └────────┬────────┘       └────────┬────────┘
             │                         │
             └────────────┬────────────┘
                          ▼
                    ┌─────────────┐
                    │    IDLE     │
                    └─────────────┘
```

---

## Configuration

```yaml
# .km/config.yaml
watch:
  debounce_fs: 5000 # ms before processing FS changes
  debounce_apply: 3000 # ms before applying DB changes to FS

  ignore:
    - "node_modules/**"
    - ".git/**"
    - ".*" # Hidden files

  conflict_strategy: last_write_wins # or: fs_wins, db_wins, merge
```

---

## CLI Commands

```bash
# Start watch daemon
km watch

# One-time sync (no watch)
km sync

# Rebuild state from filesystem
km rebuild --from-fs

# Rebuild filesystem from state
km rebuild --from-db

# Show sync status
km status
```

---

## See Also

- [03-storage.md](03-storage.md) — Storage modes, events
- [05-markdown.md](05-markdown.md) — Parsing markdown to nodes
- [02-architecture.md](02-architecture.md) — Bidirectional sync overview
