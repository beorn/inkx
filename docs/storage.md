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

## Repo Root Node

As of the data model redesign, the repository root is now represented as a **folder node with `parent_id = null`** rather than having root-level nodes with `parent_id = null`. This change provides cleaner navigation boundaries and more consistent tree structure.

### Key Characteristics

**Repo Root Node:**

- `type: "folder"`
- `parent_id: null` (only node with null parent)
- `data.is_repo_root: true` (flag in data field)
- `fs_path` points to repository root directory
- All root-level files/folders have `parent_id = repoRootId` (not null)

### Navigation Boundaries

The repo root node serves as an absolute navigation boundary:

1. **Cannot navigate above repo root** - When `parent_id = null` is detected, navigation stops
2. **Cannot zoom out from repo root** - Zoom out command checks `parent_id === null` and returns boundary condition
3. **Cursor cannot move to parent** - Tree navigation prevents moving up from a node whose parent has `parent_id = null`

From `/Users/beorn/Code/pim/km/apps/km-tui/src/board-actions-zoom.ts`:

```typescript
if (!currentRoot || currentRoot.parent_id === null) {
  // Can't zoom out from repo root
  return boundary("zoom_out", "at repo root")
}
```

From `/Users/beorn/Code/pim/km/apps/km-tui/src/navigation-handlers.ts`:

```typescript
if (currentNode.parent_id === null) {
  debug("tree nav: at repo root, can't move to parent")
  return null // At repo root (parent_id is null)
}
```

### Root Node

The repo root node (`id = "."`) is created by `ensureRepoRootNode()` before discovery or event replay.

- ID is `"."` (the relative path for repo root)
- `fs_path = "."`, `is_repo_root = true` in data
- Only node with `parent_id = NULL` — all other nodes must have a parent

In `applyEvents`, any `parent_id: null` from old events.jsonl is normalized to `"."`.

`km doctor` detects orphan nodes and absolute `fs_path` values as health issues.

#### Pre-Launch Flexibility

**The project is pre-launch, so breaking changes to the data model are acceptable.** Migration code exists for development convenience, but users can simply delete their `.km/` directory and re-scan if they encounter issues.

Why this matters:

- **No backwards compatibility burden** - We can make structural changes like adding the repo root node without worrying about complex migrations
- **Clean slate option** - Users can always `rm -rf .km/ && km init` to get the latest schema
- **Development velocity** - Migration code is optional developer tooling, not a production requirement
- **Fail-fast approach** - Better to surface incompatibilities early than maintain legacy patterns

Once km launches publicly, we'll maintain strict backwards compatibility. Until then, breaking changes that improve the architecture are encouraged.

From `ensureRepoRootNode()` in `repo-loader.ts`:

```typescript
db.prepare(`INSERT INTO nodes (...) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(".", "folder", null, 0, ".", basename(repoRoot),
    JSON.stringify({ name: basename(repoRoot), is_repo_root: true }), now, now, "")
```

### Clarification: `parent_id = null` Meaning

**Important:** When documentation or code refers to "`parent_id = null` = root", this means:

- The **repo root node itself** (the single folder node representing the repository)
- **NOT** a "root level view" or a set of root-level children
- **NOT** nodes that should be at the top level

Before this change, `parent_id = null` meant "this is a root-level node". Now it means "this is THE repo root node" - there should be exactly one.

### Query Implications

**Getting root-level children:**

```typescript
// Before: parent_id = null returned all root-level nodes
repo.getChildren(null)

// After: parent_id = null returns the repo root node only
// To get root-level nodes, use:
const repoRoot = repo.getChildren(null)[0] // Get the repo root node
const rootLevelNodes = repo.getChildren(repoRoot.id) // Get its children
```

**Finding the repo root:**

```sql
-- Single repo root node (should be exactly one)
SELECT * FROM nodes WHERE parent_id IS NULL

-- Root-level files/folders (children of repo root)
SELECT * FROM nodes WHERE parent_id = (SELECT id FROM nodes WHERE parent_id IS NULL)
```

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
  fs_mtime?: number // File modification time at last sync (milliseconds)

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
  priority?: number // 0-4 (P0=urgent, P4=backlog)
  rrule?: string // iCal RRULE format (e.g., "FREQ=DAILY;FROM=DUE")
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
| `parent_id`      | string \| null | ID of parent node (null for repo root only)   |
| `parent_idx`     | number         | Fractional index for sibling ordering         |
| `link_to`        | string \| null | Target node ID if this is an embedding        |
| `link_alias`     | string         | Display alias from `\|alias` syntax           |
| `fs_path`        | string         | Absolute filesystem path                      |
| `fs_ino`         | number         | Filesystem inode (for rename detection)       |
| `fs_mtime`       | number         | File modification time at last sync (ms)      |
| `name`           | string         | Identifier slug (filename or heading slug)    |
| `md_pos`         | number         | Byte offset in markdown file                  |
| `md_line`        | number         | Line number (0-indexed)                       |
| `md_slug`        | string         | **DEPRECATED**: Use `name` instead            |
| `task_status`    | TaskStatus     | Task workflow status                          |
| `task_mark`      | TaskMark       | Checkbox character                            |
| `assigned_to`    | string         | Assignee (user or agent ID)                   |
| `due_date`       | string         | Due date in YYYY-MM-DD format                 |
| `scheduled_date` | string         | Scheduled date in YYYY-MM-DD format           |
| `priority`       | number         | Priority 0-4 (P0=urgent, P4=backlog)          |
| `rrule`          | string         | iCal RRULE (e.g., `FREQ=WEEKLY;BYDAY=MO;FROM=DUE`) |
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
  | "board" // Board section/column
  | "agent" // Persistent agent
  | "embed" // Embedded reference (![[target]]) linking to another node
````

> **Current: km-ast v2** — 8 block types: p, h, code, quote, table, hr, html, math. Embed is orthogonal (`embed_source` on any type). See [design/km-ast/model.md](design/km-ast/model.md).

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
  priority INTEGER,              -- 0-4 (P0=urgent, P4=backlog)

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

> **Planned**: The [brain architecture](architecture/brain.md) evolves events.jsonl into per-chat JSONL files (`.km/chats/`), where all interactions — agent conversations, edit sessions, sync operations — are modeled as chats. The emit() pipeline and event types below remain the foundation.

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

## Repo Loader

The `loadRepo()` function is the **unified entry point** for loading repos in both memory and disk modes. It replaces the fragmented `ensureState`, `rebuildState`, `syncState` functions with a single generator-based pipeline.

### Usage

```typescript
import { loadRepo, runGenerator } from "@km/storage"

// Basic usage (silent, no progress)
const result = runGenerator(loadRepo("/path/to/repo"))

// With progress reporting
import { withProgress } from "@silvery/ag-react/ui/wrappers"
const result = await withProgress(loadRepo("/path/to/repo"), {
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

`loadRepo()` yields progress through these phases:

| Phase           | Memory Mode                   | Disk Mode                         |
| --------------- | ----------------------------- | --------------------------------- |
| **discover**    | Count markdown files          | Count events in events.jsonl      |
| **parse**       | Parse files → generate events | (skipped - events already parsed) |
| **apply**       | Insert nodes into SQLite      | Apply events to SQLite            |
| **resolve**     | Resolve wikilinks             | (skipped - resolved during apply) |
| **materialize** | Evaluate km.add:: rules        | Evaluate km.add:: rules            |

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

The old functions still work but delegate to `loadRepo()`:

| Old Function        | New Equivalent                    |
| ------------------- | --------------------------------- |
| `ensureState(root)` | `loadRepo(root)`                  |
| `rebuildState()`    | `loadRepo(root, { force: true })` |
| `syncState()`       | `loadRepo(root)`                  |

### Cold Start vs Hot Path

`loadRepo()` is for **cold start** (initial loading). For incremental updates after loading:

| Path       | Function       | When                           |
| ---------- | -------------- | ------------------------------ |
| Cold start | `loadRepo()`   | CLI startup, initial load      |
| Hot path   | `applyEvent()` | Real-time file watcher changes |

The `SyncManager` handles the hot path via file watching → `reconcileDirectory()` → `applyEvent()`.

---

## Markdown Data Layer

The `ProcessedMarkdown` type sits between the parser (@km/markdown) and storage/application layers. It provides a canonical representation of a parsed markdown file that is independent of storage concerns.

### Data Flow

```
Filesystem
    ↓
Parser (parseMarkdownWithLinks)
    ↓
ProcessedMarkdown  ← Canonical parsed file type
    ↓
Transforms (toNodeEvents, toResolvedLinks)
    ↓
Storage (DataStore, links table)
```

### ProcessedMarkdown Type

```typescript
interface ProcessedMarkdown {
  path: string // File path
  ino?: number // Inode (rename detection)
  mtime?: number // Mtime (change detection)
  hash: string // Content hash
  nodes: KNode[] // Parsed nodes
  wikilinks: WikilinkRef[] // Extracted links
  warnings: ParseWarning[]
}
```

### Transform Functions

Transform functions convert `ProcessedMarkdown` to different formats for different use cases:

| Function            | Purpose                         | Used By      |
| ------------------- | ------------------------------- | ------------ |
| `toNodeEvents()`    | Convert to node_created events  | Loading path |
| `toPendingLinks()`  | Extract links for batch resolve | Loading path |
| `toResolvedLinks()` | Resolve links via LinkResolver  | Syncing path |

### Usage Example

```typescript
import { processMarkdownFile, toResolvedLinks, toNodeEvents } from "@km/storage"

// Parse a markdown file
const content = fs.readFileSync(path, "utf-8")
const processed = processMarkdownFile(content, path, ino, mtime)

// Loading path: convert to events for batch application
const events = toNodeEvents(processed, "fs-scan")

// Syncing path: resolve wikilinks immediately
const resolver = createLinkResolver(db)
const links = toResolvedLinks(processed, resolver)
```

### Type Hierarchy

```
KNode             = one node (file, section, task)
TNode             = KNode + children[] (for tree traversal)
ParseResult       = KNode[] + wikilinks (parser output)
ProcessedMarkdown = ParseResult + fs context (parsed file ready for storage)
```

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

### Names, Paths, and IDs

km distinguishes between three concepts:

| Concept | Example | Unique? | Purpose |
|---------|---------|---------|---------|
| **Name** | `inbox`, `readme` | No | Human-friendly identifier, multiple files can have same name |
| **Path** | `projects/inbox.md` | Yes | Filesystem location, composed of names |
| **ID** | `01H5XJKM...` (disk) or `projects/inbox.md:42` (memory) | Yes | Internal reference, stable across renames |

**Key insight:** Names are not unique. `inbox.md` could exist at `/inbox.md`, `/archive/inbox.md`, and `/projects/inbox.md`. Resolution must handle this ambiguity.

#### Block References (`^id`)

Following Obsidian's pattern, blocks can have explicit IDs for linking:

```markdown
This is a paragraph with an ID. ^my-block-id

- Task item ^task-123
```

Block IDs are:
- Added on-demand (only when first referenced)
- Short, human-readable strings (not UUIDs)
- Used in links: `[[file#^my-block-id]]`

Compare to Logseq which uses full UUIDs (`((uuid))`), making links less readable.

### Smart Node Resolution

The `resolveNode` function provides flexible node lookup with path-first semantics:

```typescript
// Resolution strategy (paths prioritized):
// 1. Explicit paths (/, ./, ../) → absolute fs_path match
// 2. Relative paths (contains /) → fs_path suffix match (unique)
// 3. Bare names (no /) → name-based search (may warn on ambiguity)
// 4. Fallback: ID match, content match

function resolveNode(query: string, type?: string): Node | null
```

#### Resolution Order (Detailed)

**For explicit paths** (`/path`, `./path`, `../path`):
1. Exact absolute fs_path match
2. Try with `.md` extension
3. Try `index.md` inside directory
4. Stop (don't fall through to fuzzy matching)

**For relative paths** (contains `/` like `docs/readme`):
1. fs_path suffix match
2. Try with `.md` extension
3. Exact ID match (IDs can contain `/`)
4. Stop

**For bare names** (no `/` like `readme`):
1. Exact ID match (unambiguous)
2. Name field match (may be ambiguous)
3. Name with `.md` extension
4. fs_path suffix match
5. ID prefix/suffix match (for short IDs)
6. Content/title match

#### Ambiguity Detection

When multiple nodes match a bare name, km logs a warning:

```
Warning: Ambiguous resolution for 'readme' - 3 matches found (using first)
```

The first match is returned, but users should use more specific paths to avoid ambiguity.

#### CLI Examples

```bash
km view ./docs/readme.md   # Explicit path (unambiguous)
km view docs/readme        # Relative path (unambiguous)
km view readme             # Bare name (may warn if multiple)
km show 01H5X              # ID prefix match
km view @next              # Filename (resolves @next.md)
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
│  FSWatcher ──► Debounce 5s ──► Reconcile ──► emit()        │
│                                                   │        │
│                                                   ▼        │
│                                              state.db      │
│                                                   │        │
│                                                   ▼        │
│  Write ◄── Debounce 3s ◄── Pending ◄─────────────┘         │
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
km doctor rebuild     # Rebuild state.db from events + worktree
km doctor reset       # Reset from worktree only (trust filesystem)
```

---

## See Also

- [architecture/brain.md](architecture/brain.md) — Brain layer: chats, memory graph, solidification
- [concepts.md](concepts.md) — Core concepts, two modes overview
- [architecture.md](architecture.md) — Event system, data flow
- [ref/markdown.md](ref/markdown.md) — Parsing .md to nodes
