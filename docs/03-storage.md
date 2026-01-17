# Storage

Modes, DBNode schema, events, and bidirectional sync.

---

## Two Modes

| Mode       | Trigger       | SQLite         | Event Log          | Node IDs  |
| ---------- | ------------- | -------------- | ------------------ | --------- |
| **Memory** | No `.km/`     | `:memory:`     | None               | Ephemeral |
| **Disk**   | `.km/` exists | `.km/state.db` | `.km/events.jsonl` | Stable    |

**Both modes are read-write.** The key differences:

| Aspect         | Memory Mode                 | Disk Mode                                   |
| -------------- | --------------------------- | ------------------------------------------- |
| **SQLite**     | Rebuilt from `.md` each run | Persisted in `.km/state.db`                 |
| **Event log**  | None                        | All changes in `events.jsonl`               |
| **Node IDs**   | `path:line` (session-local) | ULIDs (permanent)                           |
| **Write path** | Direct to `.md` files       | Event → SQLite → (optionally sync to `.md`) |
| **Startup**    | Scan filesystem             | Load SQLite                                 |
| **History**    | None                        | Full audit trail                            |

### Memory Mode

SQLite lives in RAM. Rebuilt from filesystem on each run:

```bash
cd ~/any-project
km tasks              # Scans .md files → builds :memory: SQLite
km status abc123 done # Updates :memory: + writes to .md file
# exit
km tasks              # Scans again, new IDs
```

- No setup required
- Changes go directly to `.md` files
- IDs are ephemeral (`projects/todo.md:42`)
- Great for: quick access, browsing repos, trying km

### Disk Mode

SQLite and events persist in `.km/`:

```bash
km init               # Creates .km/state.db, events.jsonl
km tasks              # Loads from SQLite (fast)
km status abc123 done # Appends to events.jsonl, updates SQLite
# exit
km show abc123        # Same ID still works
```

- Run `km init` once to enable
- All changes logged to `events.jsonl`
- SQLite is a rebuildable cache
- IDs are stable ULIDs
- Enables: history, undo, sync, cross-session references

### When to Use Each

| Use Case                         | Mode   |
| -------------------------------- | ------ |
| Browse any markdown folder       | Memory |
| Quick task toggle in random repo | Memory |
| Your main projects               | Disk   |
| Need history/undo                | Disk   |
| Reference tasks by stable ID     | Disk   |
| Multi-device sync (future)       | Disk   |

---

## Mode Detection

```
km <command> [path]
    │
    ▼
Search for .km/ in ancestors
    │
    ├─► Found .km/: Disk mode
    │   └─ Root = directory containing .km/
    │
    └─► Not found: Memory mode
        └─ Root = current directory
```

`.km/` is only created via explicit `km init`.

---

## DBNode Schema

Everything is a node. The unified schema stored in SQLite:

```typescript
interface DBNode {
  id: string; // ULID (persisted) or path:line (memory)
  type: NodeType;
  parent_id: string | null; // Flat structure - parent reference
  parent_idx: number;

  // Location (for write-back)
  fs_path: string | null; // Absolute path to .md file
  md_line: number | null; // Line number (0-indexed)

  // Content
  content: string | null; // Display text

  // Task properties
  task_status: TaskStatus | null;
  task_mark: string | null; // ' ', 'x', '/', etc.

  // Metadata
  data: Record<string, unknown>; // Frontmatter, custom fields
  created_at: number;
  updated_at: number;
}
```

**Note:** `DBNode` is a flat record with `parent_id`. For tree navigation, use `TNode` from @km/tree which has recursive `children[]`.

### Node Types

````typescript
type NodeType =
  // Structural
  | "folder" // Directory
  | "file" // .md file (merged with H1 if names match)
  | "section" // Heading (H2+ when H1 merged with file)

  // Content
  | "task" // - [ ] item
  | "paragraph" // Text block
  | "ul" // Unordered list item
  | "ol" // Ordered list item
  | "quote" // > blockquote
  | "code" // ```code```
  | "table"
  | "hr"
  | "html"

  // Special (persisted mode)
  | "board"
  | "agent";
````

### Task Status

```typescript
type TaskStatus =
  | "todo" // [ ] — available to work on
  | "wip" // [/] — actively being worked on
  | "blocked" // [!] — waiting on something/someone
  | "done" // [x] — completed
  | "dropped"; // [-] — cancelled, won't do
```

### Task Marks

| Mark       | Status  | Display |
| ---------- | ------- | ------- |
| ` `        | todo    | `[ ]`   |
| `/`        | wip     | `[/]`   |
| `!`        | blocked | `[!]`   |
| `x` or `X` | done    | `[x]`   |
| `-`        | dropped | `[-]`   |

### Embeddings (Symlinks)

Nodes can be **embedded** to appear in multiple locations:

```typescript
interface DBNode {
  // ... other fields ...
  symlink_to?: string; // ID of target node (if this is a symlink)
}
```

**Key rules:**

1. **Embeddings are positional references** — they exist in the tree but point elsewhere
2. **Content operations apply to target** — status, priority changes affect the linked node
3. **Positional operations apply to symlink** — moving within a board moves the symlink
4. **Display reads from target** — symlinks show the target's content
5. **Delete removes symlink only** — deleting a symlink does not delete the target

---

## ID Strategy

| Mode   | Format      | Example               |
| ------ | ----------- | --------------------- |
| Disk   | ULID        | `01H5XJKM7B...`       |
| Memory | `path:line` | `projects/todo.md:42` |

Memory IDs are session-local. Write-back uses `fs_path` + `md_line`, not ID.

---

## SQLite Schema

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  parent_id TEXT,
  parent_idx REAL DEFAULT 0,

  -- Location
  fs_path TEXT,
  md_line INTEGER,

  -- Content
  content TEXT,

  -- Task
  task_status TEXT,
  task_mark TEXT,

  -- Metadata
  data JSON,
  created_at INTEGER,
  updated_at INTEGER
);

-- Indexes
CREATE INDEX idx_parent ON nodes(parent_id);
CREATE INDEX idx_type ON nodes(type);
CREATE INDEX idx_fs_path ON nodes(fs_path);
CREATE INDEX idx_task_status ON nodes(task_status);
```

---

## Events (Disk Mode Only)

Events are append-only records in `.km/events.jsonl`. The `emit()` function is the central mutation path in @km/storage.

### The 4-Path Multiplexer

Every mutation flows through `emit()`, which triggers four parallel operations:

```
emit(event)
    ├─ Persist   → events.jsonl   (immutable audit log)
    ├─ Project   → state.db       (SQLite cache)
    ├─ Broadcast → WebSocket      (real-time to other clients)
    └─ Sync      → filesystem     (write back to .md files)
```

### Actor-Based Routing

The `actor` field controls which paths fire:

| Actor      | Persist | Project | Broadcast | File Sync |
| ---------- | :-----: | :-----: | :-------: | :-------: |
| `user`     |    ✓    |    ✓    |     ✓     |     ✓     |
| `fs-watch` |    ✓    |    ✓    |     ✓     |     ✗     |
| `agent-*`  |    ✓    |    ✓    |     ✓     |     ✓     |
| `system`   |    ✓    |    ✓    |     ✓     |     ✗     |

`fs-watch` skips file sync to prevent write-back loops.

### Event Structure

```typescript
interface Event {
  id: string; // ULID
  type: EventType;
  actor: string; // 'user', 'system', 'fs-watch', agent ID
  target?: string; // Node ID
  data: unknown;
  ts: number; // Unix ms
}
```

### Event Types

```typescript
// Node lifecycle
{ type: 'node_created', data: { id, type, parent_id, content, ... } }
{ type: 'node_updated', target: id, data: { task_status: 'done' } }
{ type: 'node_moved', target: id, data: { parent_id, parent_idx } }
{ type: 'node_deleted', target: id }

// Task actions
{ type: 'task_claimed', actor: 'agent-1', target: id }
{ type: 'task_completed', actor: 'agent-1', target: id }
```

### State Rebuild

SQLite is a disposable cache. Rebuild anytime from events:

```typescript
async function rebuildState(): Promise<Database> {
  const db = new Database(".km/state.db");
  db.exec("DROP TABLE IF EXISTS nodes; ...");
  db.exec(CREATE_SCHEMA);

  const events = readEventsSync(".km/events.jsonl");
  for (const event of events) {
    applyEvent(db, event);
  }

  return db;
}
```

---

## Store Interface

```typescript
interface NodeStore {
  readonly mode: "memory" | "disk";
  readonly rootPath: string;

  // Read
  getNode(id: string): Node | null;
  getChildren(parentId: string | null): Node[];
  getAncestors(nodeId: string): Node[];

  // Query
  query<T>(sql: string, params?: unknown[]): T[];

  // Write
  updateNode(id: string, changes: Partial<Node>): void;

  // Lifecycle
  refresh(): void;
  close(): void;
}
```

### Smart Node Resolution

The `resolveNode` function provides flexible node lookup:

```typescript
// Resolution order:
// 1. Exact ID match
// 2. ID prefix match (e.g., "abc" matches "abc123...")
// 3. ID suffix match (e.g., "xyz" matches "...xyz")
// 4. Exact filesystem path match
// 5. Filename match (fs_path ends with query)
// 6. Filename without extension ("@inbox" matches "@inbox.md")
// 7. Content/title match

function resolveNode(query: string, type?: string): Node | null;
```

Used by CLI commands:

```bash
km show 01H5X           # ID prefix
km view @inbox          # Filename (resolves @inbox.md)
km show --tree ./projects  # Path
```

---

## Feature Comparison

| Feature                    | Memory | Disk |
| -------------------------- | ------ | ---- |
| View tree/tasks/board      | Yes    | Yes  |
| Toggle checkboxes          | Yes    | Yes  |
| Event history              | No     | Yes  |
| Stable IDs across sessions | No     | Yes  |
| `km show <id>` works later | No     | Yes  |
| Undo/history               | No     | Yes  |
| Sync support               | No     | Yes  |

---

## Bidirectional Sync (Disk Mode)

In disk mode, km maintains sync between filesystem, SQLite, and event log.

### Sync Flow

```
┌────────────────────────────────────────────────────────────┐
│  Filesystem                                                │
│      │                                                     │
│      ▼                                                     │
│  FSWatcher ──► Debounce 5s ──► Reconcile ──► emit()       │
│                                                   │        │
│                                                   ▼        │
│                                              state.db      │
│                                                   │        │
│                                                   ▼        │
│  Write ◄── Debounce 3s ◄── Pending ◄─────────────┘        │
│      │                                                     │
│      ▼                                                     │
│  Filesystem                                                │
└────────────────────────────────────────────────────────────┘
```

### Round-Trip Prevention

Three mechanisms prevent infinite loops:

1. **In-flight tracking** — Watcher ignores files we're currently writing
2. **Actor filtering** — `fs-watch` events don't trigger file writes (see Actor-Based Routing above)
3. **Content hashing** — Skip re-parse if file content unchanged

### Conflict Resolution

When file changes in both filesystem and database:

| Strategy          | Behavior                            |
| ----------------- | ----------------------------------- |
| `last_write_wins` | Use whichever changed more recently |
| `fs_wins`         | Filesystem always wins              |
| `db_wins`         | Database always wins                |
| `merge`           | Attempt three-way merge             |

Configuration in `.km/config.yaml`:

```yaml
watch:
  debounce_fs: 5000 # ms before processing FS changes
  debounce_apply: 3000 # ms before applying DB changes to FS
  conflict_strategy: last_write_wins
```

### CLI Commands

```bash
km watch              # Start watch daemon
km sync               # One-time sync
km rebuild --from-fs  # Rebuild state from filesystem
km rebuild --from-db  # Rebuild filesystem from state
```

---

## See Also

- [01-concepts.md](01-concepts.md) — Core concepts, two modes overview
- [02-architecture.md](02-architecture.md) — Event system, data flow
- [04-markdown.md](04-markdown.md) — Parsing .md to nodes
