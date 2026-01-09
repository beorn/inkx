# Watch Specification

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
import { watch } from "fs";
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

  private async sync() {
    const paths = [...this.pendingPaths];
    this.pendingPaths.clear();

    // Group by directory for efficient scanning
    const dirs = new Set(paths.map((p) => dirname(p)));

    for (const dir of dirs) {
      await this.reconcileDirectory(dir);
    }
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

async function getFileIdentity(path: string): Promise<FileIdentity> {
  const stat = await fs.stat(path);
  return {
    ino: stat.ino,
    path,
    mtime: stat.mtimeMs,
    size: stat.size,
  };
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
      ops.push({
        type: "create",
        path: entry.path,
        ino: entry.ino,
      });
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
    ops.push({
      type: "delete",
      node_id: node.id,
      path,
    });
  }

  return ops;
}
```

### Apply Filesystem Ops

```typescript
async function applyOps(ops: Op[]): Promise<void> {
  for (const op of ops) {
    switch (op.type) {
      case "create":
        await handleCreate(op);
        break;
      case "update":
        await handleUpdate(op);
        break;
      case "rename":
        await handleRename(op);
        break;
      case "delete":
        await handleDelete(op);
        break;
    }
  }
}

async function handleCreate(op: CreateOp): Promise<void> {
  const stat = await fs.stat(op.path);

  if (stat.isDirectory()) {
    emit({
      type: "node_created",
      actor: "system",
      data: {
        id: ulid(),
        type: "folder",
        fs_path: op.path,
        fs_ino: op.ino,
        parent_id: getParentNodeId(op.path),
        data: { name: basename(op.path) },
      },
    });
  } else if (op.path.endsWith(".md")) {
    const content = await fs.readFile(op.path, "utf-8");
    const nodes = parseMarkdownToNodes(content, op.path, op.ino);

    for (const node of nodes) {
      emit({
        type: "node_created",
        actor: "system",
        data: node,
      });
    }
  }
}

async function handleUpdate(op: UpdateOp): Promise<void> {
  const content = await fs.readFile(op.path, "utf-8");

  // Get existing nodes for this file
  const existingNodes = db.all(
    `
    SELECT * FROM nodes
    WHERE fs_path = ? OR parent_id IN (
      SELECT id FROM nodes WHERE fs_path = ?
    )
  `,
    [op.path, op.path],
  );

  // Parse new content
  const newNodes = parseMarkdownToNodes(content, op.path);

  // Diff and emit changes
  const changes = diffNodes(existingNodes, newNodes);

  for (const change of changes) {
    emit(change);
  }
}
```

---

## Applying Database Changes to Filesystem

### Pending Operations Queue

```typescript
interface PendingWrite {
  path: string;
  content: string;
  source_event_id: string;
}

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

    // Mark these as "in-flight" to prevent watch triggering re-sync
    for (const write of writes) {
      inFlightWrites.add(write.path);
    }

    for (const write of writes) {
      await fs.writeFile(write.path, write.content);
    }

    // Clear in-flight after a delay (allow FSEvents to settle)
    setTimeout(() => {
      for (const write of writes) {
        inFlightWrites.delete(write.path);
      }
    }, 1000);
  }
}
```

### Regenerating Markdown from Nodes

```typescript
function regenerateFile(fileNodeId: string): string {
  // Get file node and all descendants
  const nodes = db.all(
    `
    WITH RECURSIVE descendants AS (
      SELECT * FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN descendants d ON n.parent_id = d.id
    )
    SELECT * FROM descendants
    ORDER BY sort_order
  `,
    [fileNodeId],
  );

  return nodesToMarkdown(nodes);
}
```

---

## Round-Trip Prevention

### Problem

```
Edit file → watch → emit → state.db → apply → write file → watch → ...
```

### Solution 1: In-Flight Tracking

```typescript
const inFlightWrites = new Set<string>();

// In watcher
watcher.on("change", (path) => {
  if (inFlightWrites.has(path)) {
    // Skip - this is our own write
    return;
  }
  pendingPaths.add(path);
});
```

### Solution 2: Content Hash Comparison

```typescript
async function handleUpdate(op: UpdateOp): Promise<void> {
  const content = await fs.readFile(op.path, "utf-8");
  const contentHash = hash(content);

  const existing = db.get(
    `
    SELECT content_hash FROM nodes WHERE fs_path = ?
  `,
    [op.path],
  );

  if (existing?.content_hash === contentHash) {
    // No actual change, skip
    return;
  }

  // Process change...
}
```

### Solution 3: Event Source Tracking

```typescript
// When applying events from watch
emit({
  type: 'node_updated',
  actor: 'fs-watch',  // Mark source
  ...
})

// When deciding to apply to filesystem
function shouldApplyToFs(event: Event): boolean {
  // Don't apply events that came from filesystem
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
    data: {
      original_path: path,
      conflict_path: conflictPath,
    },
  });
}
```

---

## Folder Structure

### See-Through Folders

Folders don't require special metadata files. They're "see-through":

```
vault/
├── projects/           # folder node
│   ├── index.md        # optional: folder's own content
│   └── MyProject.md    # file node
└── inbox/
    └── note.md
```

### Folder Content Options

1. **No content** — folder is just a container
2. **index.md** — folder-level notes
3. **README.md** — alternative to index.md
4. **{foldername}.md** — folder-as-file pattern

```typescript
function getFolderContentFile(folderPath: string): string | null {
  const candidates = [
    join(folderPath, "index.md"),
    join(folderPath, "README.md"),
    join(folderPath, `${basename(folderPath)}.md`),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}
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

# Force sync specific path
km sync path/to/file.md
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

  # Folder content file preference
  folder_content:
    - index.md
    - README.md
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

## References

- [chokidar](https://github.com/paulmillr/chokidar) — Cross-platform file watching
- [FSEvents](https://developer.apple.com/documentation/coreservices/file_system_events) — macOS native file events
- [inotify](https://man7.org/linux/man-pages/man7/inotify.7.html) — Linux file notification
