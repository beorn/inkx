# Storage

Modes, KNode schema, events, and bidirectional sync.

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

## KNode Schema

Everything is a node. The unified schema stored in SQLite:

```typescript
interface KNode {
  id: string // ULID (persisted) or path:line (memory)
  type: NodeType
  parent_id: string | null // Flat structure - parent reference
  parent_idx: number // Fractional index for ordering among siblings
  link_to: string | null // Target node ID for embeddings (![[...]])
  link_alias?: string // Optional display alias from |alias syntax

  // Filesystem mapping (for folder/file nodes)
  fs_path?: string // Absolute path to .md file or directory
  fs_ino?: number // Inode number for rename detection

  // Identity
  name?: string // Slug/identifier (filename without .md, or heading slug)

  // Markdown mapping (for sections/blocks)
  md_pos?: number // Byte offset in file
  md_line?: number // Line number in file (0-indexed)
  md_slug?: string // Heading slug (DEPRECATED: use name instead)

  // Task properties (can be set on any node type, not just type: "task")
  task_status?: TaskStatus
  task_mark?: TaskMark // ' ', 'x', '/', etc. (only for type: "task")
  assigned_to?: string // User/agent assigned to task
  due_date?: string // YYYY-MM-DD format
  scheduled_date?: string // YYYY-MM-DD format
  priority?: number // 1-5 (1 = highest)
  recurrence?: string // iCal RRULE format (e.g., "FREQ=DAILY")
  recur_prev?: string // Previous recurrence instance ID

  // Content
  content?: string // Text content (inline for small)
  content_hash?: string // CAS reference for large content
  title?: string // Display title (for sections: heading without rules)

  // Column/section rules (parsed from inline attributes)
  rules?: NodeRules

  // Metadata
  data: Record<string, unknown> // Frontmatter, custom fields
  created_at: number // Unix timestamp (ms)
  updated_at: number // Unix timestamp (ms)
  version: string // Last event ID that modified this node
}
```

**Note:** `KNode` is a flat record with `parent_id`. For tree navigation, use `TNode` from @km/core which extends `KNode` with recursive `children[]` and `depth`.

### Field Reference

| Field            | Type           | Description                                   |
| ---------------- | -------------- | --------------------------------------------- |
| `id`             | string         | ULID (disk mode) or `path:line` (memory mode) |
| `type`           | NodeType       | Node classification (see Node Types below)    |
| `parent_id`      | string \| null | ID of parent node (null for root)             |
| `parent_idx`     | number         | Fractional index for sibling ordering         |
| `link_to`        | string \| null | Target node ID if this is an embedding        |
| `link_alias`     | string         | Display alias from `\|alias` syntax           |
| `fs_path`        | string         | Absolute filesystem path                      |
| `fs_ino`         | number         | Filesystem inode (for rename detection)       |
| `name`           | string         | Identifier slug (filename or heading slug)    |
| `md_pos`         | number         | Byte offset in markdown file                  |
| `md_line`        | number         | Line number (0-indexed)                       |
| `md_slug`        | string         | **DEPRECATED**: Use `name` instead            |
| `task_status`    | TaskStatus     | Task workflow status                          |
| `task_mark`      | TaskMark       | Checkbox character                            |
| `assigned_to`    | string         | Assignee (user or agent ID)                   |
| `due_date`       | string         | Due date in YYYY-MM-DD format                 |
| `scheduled_date` | string         | Scheduled date in YYYY-MM-DD format           |
| `priority`       | number         | Priority 1-5 (1 = highest)                    |
| `recurrence`     | string         | iCal RRULE (e.g., `FREQ=WEEKLY;BYDAY=MO`)     |
| `recur_prev`     | string         | Links to previous recurrence instance         |
| `content`        | string         | Node text content                             |
| `content_hash`   | string         | CAS hash for large content                    |
| `title`          | string         | Display title (for sections)                  |
| `rules`          | NodeRules      | Column/section behavior rules                 |
| `data`           | object         | Frontmatter and custom fields                 |
| `created_at`     | number         | Creation timestamp (Unix ms)                  |
| `updated_at`     | number         | Last update timestamp (Unix ms)               |
| `version`        | string         | Event ID of last modification                 |

### NodeRules

Rules control column/section behavior in boards:

```typescript
interface NodeRules {
  add?: string // Query to auto-pull matching tasks
  sync?: string // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean // Start collapsed
  limit?: number // WIP limit
  default?: boolean // Default column for new items
  color?: string // Board/section color (cyan, yellow, magenta, etc.)
}
```

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
  | "agent"
````

### Task Status

```typescript
type TaskStatus =
  | "todo" // [ ] — available to work on
  | "wip" // [/] — actively being worked on
  | "blocked" // [!] — waiting on something/someone
  | "done" // [x] — completed
  | "dropped" // [-] — cancelled, won't do
```

### Task Marks

| Mark       | Status  | Display |
| ---------- | ------- | ------- |
| ` `        | todo    | `[ ]`   |
| `/`        | wip     | `[/]`   |
| `!`        | blocked | `[!]`   |
| `x` or `X` | done    | `[x]`   |
| `-`        | dropped | `[-]`   |

### Links (Embeddings)

Nodes can be **linked** to appear in multiple locations (e.g., `![[Target]]` embeddings):

```typescript
interface KNode {
  // ... other fields ...
  link_to?: string // ID of target node (if this is a link)
  link_alias?: string // Optional display alias from |alias syntax
}
```

**Key rules:**

1. **Links are positional references** — they exist in the tree but point elsewhere
2. **Content operations apply to target** — status, priority changes affect the linked node
3. **Positional operations apply to link** — moving within a board moves the link node
4. **Display reads from target** — links show the target's content
5. **Delete removes link only** — deleting a link does not delete the target
6. **Serialization reconstructs syntax** — `![[path|alias]]` rebuilt from `link_to` + `link_alias`

---

## ID Strategy

| Mode   | Format      | Example               |
| ------ | ----------- | --------------------- |
| Disk   | ULID        | `01H5XJKM7B...`       |
| Memory | `path:line` | `projects/todo.md:42` |

Memory IDs are session-local. Write-back uses `fs_path` + `md_line`, not ID.

---

## SQLite Schema

### nodes table

The main table storing all nodes:

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  parent_id TEXT,
  link_to TEXT,                  -- Target node ID for embeddings
  link_alias TEXT,               -- Display alias
  parent_idx REAL DEFAULT 0,     -- Fractional ordering

  -- Filesystem
  fs_path TEXT,                  -- Absolute path
  fs_ino INTEGER,                -- Inode for rename detection

  -- Identity
  name TEXT,                     -- Slug identifier
  title TEXT,                    -- Display title

  -- Markdown
  md_pos INTEGER,                -- Byte offset
  md_line INTEGER,               -- Line number (0-indexed)
  md_slug TEXT,                  -- DEPRECATED: use name

  -- Task
  task_status TEXT,              -- todo/wip/blocked/done/dropped
  task_mark TEXT,                -- ' ', 'x', '/', '-', '!'
  assigned_to TEXT,              -- Assignee
  due_date TEXT,                 -- YYYY-MM-DD
  scheduled_date TEXT,           -- YYYY-MM-DD
  priority INTEGER,              -- 1-5

  -- Content
  content TEXT,                  -- Inline text
  content_hash TEXT,             -- CAS reference

  -- Metadata
  data JSON DEFAULT '{}',        -- Frontmatter, custom fields
  created_at INTEGER,            -- Unix ms
  updated_at INTEGER,            -- Unix ms
  version TEXT                   -- Last event ID
);

-- Indexes for common queries
CREATE INDEX idx_nodes_parent ON nodes(parent_id);
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_fs_path ON nodes(fs_path);
CREATE INDEX idx_nodes_fs_ino ON nodes(fs_ino);
CREATE INDEX idx_nodes_task_status ON nodes(task_status);
CREATE INDEX idx_nodes_assigned ON nodes(assigned_to);
CREATE INDEX idx_nodes_due ON nodes(due_date);
```

### nodes_fts virtual table

Full-text search using SQLite FTS5:

```sql
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  id,
  content,
  content='nodes',          -- Content from nodes table
  content_rowid='rowid'     -- Sync with nodes.rowid
);
```

Triggers automatically sync FTS with node changes:

```sql
-- Insert trigger
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, content)
  VALUES (new.rowid, new.id, new.content);
END;

-- Delete trigger
CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, content)
  VALUES('delete', old.rowid, old.id, old.content);
END;

-- Update trigger
CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, content)
  VALUES('delete', old.rowid, old.id, old.content);
  INSERT INTO nodes_fts(rowid, id, content)
  VALUES (new.rowid, new.id, new.content);
END;
```

### links table

Tracks wikilinks for bidirectional linking:

```sql
CREATE TABLE links (
  source_id TEXT NOT NULL,       -- Node containing the link
  target_name TEXT NOT NULL,     -- Target filename/slug from [[target]]
  target_id TEXT,                -- Resolved target node ID (null if unresolved)
  section TEXT,                  -- Optional section anchor (#section)
  block_id TEXT,                 -- Optional block ID (^block)
  alias TEXT,                    -- Display alias (|alias)
  embedded INTEGER DEFAULT 0,    -- 1 if embedding (![[...]]), 0 otherwise
  created_at INTEGER,
  PRIMARY KEY (source_id, target_name, section, block_id)
);

CREATE INDEX idx_links_source ON links(source_id);
CREATE INDEX idx_links_target_name ON links(target_name);
CREATE INDEX idx_links_target_id ON links(target_id);
```

### meta table

Key-value store for system metadata:

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

Used for tracking event replay cursor and other internal state.

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
  id: string // ULID
  type: EventType
  actor: string // 'user', 'system', 'fs-watch', agent ID
  target?: string // Node ID
  data: unknown
  ts: number // Unix ms
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
{ type: 'task_released', actor: 'agent-1', target: id }
{ type: 'task_completed', actor: 'agent-1', target: id }
```

### State Rebuild

SQLite is a disposable cache. Rebuild anytime from events:

```typescript
async function rebuildState(): Promise<Database> {
  const db = new Database(".km/state.db")
  db.exec("DROP TABLE IF EXISTS nodes; ...")
  db.exec(CREATE_SCHEMA)

  const events = readEventsSync(".km/events.jsonl")
  for (const event of events) {
    applyEvent(db, event)
  }

  return db
}
```

---

## Vault Loader

The `loadVault()` function is the **unified entry point** for loading vaults in both memory and disk modes. It replaces the fragmented `ensureState`, `rebuildState`, `syncState` functions with a single generator-based pipeline.

### Usage

```typescript
import { loadVault, runGenerator } from "@km/storage"

// Basic usage (silent, no progress)
const result = runGenerator(loadVault("/path/to/vault"))

// With progress reporting
import { withProgress } from "@beorn/inkx-ui/wrappers"
const result = await withProgress(loadVault("/path/to/vault"), {
  phases: PHASES,
})
```

### Options

```typescript
interface LoadOptions {
  searchAncestors?: boolean // Look for .km/ in parent directories (default: true)
  force?: boolean // Force full rebuild even if state exists (default: false)
}
```

### Pipeline Phases

`loadVault()` yields progress through these phases:

| Phase           | Memory Mode                   | Disk Mode                         |
| --------------- | ----------------------------- | --------------------------------- |
| **discover**    | Count markdown files          | Count events in events.jsonl      |
| **parse**       | Parse files → generate events | (skipped - events already parsed) |
| **apply**       | Insert nodes into SQLite      | Apply events to SQLite            |
| **resolve**     | Resolve wikilinks             | (skipped - resolved during apply) |
| **materialize** | Evaluate add= rules           | Evaluate add= rules               |

### Return Value

```typescript
interface LoadResult {
  mode: "memory" | "disk"
  nodeCount: number
  linkCount: number
  errors: LoadError[]
  duration: number
}
```

### Legacy API

The old functions still work but delegate to `loadVault()`:

| Old Function        | New Equivalent                     |
| ------------------- | ---------------------------------- |
| `ensureState(root)` | `loadVault(root)`                  |
| `rebuildState()`    | `loadVault(root, { force: true })` |
| `syncState()`       | `loadVault(root)`                  |

### Cold Start vs Hot Path

`loadVault()` is for **cold start** (initial loading). For incremental updates after loading:

| Path       | Function       | When                           |
| ---------- | -------------- | ------------------------------ |
| Cold start | `loadVault()`  | CLI startup, initial load      |
| Hot path   | `applyEvent()` | Real-time file watcher changes |

The `SyncManager` handles the hot path via file watching → `reconcileDirectory()` → `applyEvent()`.

---

## Store Interface

```typescript
interface NodeStore {
  readonly mode: "memory" | "disk"
  readonly rootPath: string

  // Read
  getNode(id: string): Node | null
  getChildren(parentId: string | null): Node[]
  getAncestors(nodeId: string): Node[]

  // Query
  query<T>(sql: string, params?: unknown[]): T[]

  // Write
  updateNode(id: string, changes: Partial<Node>): void

  // Lifecycle
  refresh(): void
  close(): void
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

function resolveNode(query: string, type?: string): Node | null
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
