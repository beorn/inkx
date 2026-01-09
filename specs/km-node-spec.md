# Kimmi Node Specification

The data model, storage, and sync layer for Kimmi.

---

## Overview

Kimmi uses an event-sourced architecture where all state changes are recorded as immutable events in a single append-only file. SQLite serves as a disposable state cache for fast queries.

Everything is a node: folders, files, sections, paragraphs, list items, tasks.

### Design Principles

1. **Everything is a node** — unified tree structure
2. **Single source of truth**: `events.jsonl` contains everything
3. **Append-only**: Events are never modified or deleted
4. **Rebuildable**: SQLite state can be nuked and rebuilt anytime
5. **Git-native**: Events file is the sync mechanism

---

## Architecture

```
.kimmi/
├── events.jsonl      # Source of truth (git-tracked)
├── state.db          # SQLite snapshot (gitignored, disposable)
└── blobs/            # Content-addressable store (gitignored)
```

```
┌─────────────────────────────────────────────────────────────┐
│  Write Path                                                 │
│                                                             │
│  Action ──► emit() ──► events.jsonl                         │
│                              │                              │
│                              ▼                              │
│                        Projector                            │
│                              │                              │
│                              ▼                              │
│                        state.db                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Read Path                                                  │
│                                                             │
│  Query ──► state.db (fast, indexed)                         │
│                                                             │
│  History ──► events.jsonl (full audit trail)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Node Type Hierarchy

```
node
├── item (has children, navigable)
│   ├── folder      # Filesystem directory
│   ├── file        # Markdown file
│   └── section     # Heading (creates hierarchy)
└── block (content leaf)
    ├── paragraph   # Plain text block
    ├── quote       # > blockquote
    ├── code        # ```code```
    ├── list_item   # List item (ul, ol, or task)
    ├── table       # | table |
    ├── hr          # ---
    └── html        # Raw HTML
```

### Node Structure

```typescript
interface Node {
  id: string              // ULID
  type: NodeType
  parent_id: string | null
  sort_order: number      // Position within parent
  symlink_to: string | null  // Reference to another node

  // Filesystem mapping (for folder/file)
  fs_path?: string        // Absolute or relative path
  fs_ino?: number         // Inode for rename detection

  // Markdown mapping (for sections/blocks)
  md_pos?: number         // Byte offset in file
  md_slug?: string        // Heading slug (for sections)

  // Task properties
  task_status?: TaskStatus
  task_mark?: string      // ' ' | 'x' | '/' | '1' | '2'
  assigned_to?: string
  due_date?: string       // YYYY-MM-DD
  scheduled_date?: string
  priority?: number       // 1-5

  // Content
  content?: string        // Text content (inline for small)
  content_hash?: string   // CAS reference for large content

  // Metadata
  data: Record<string, any>  // Frontmatter, custom fields
  created_at: number
  updated_at: number
  version: string         // Last event ID that modified this
}

type NodeType =
  // Items
  | 'folder'
  | 'file'
  | 'section'
  // Blocks
  | 'paragraph'
  | 'quote'
  | 'code'
  | 'ul'        // Unordered list item
  | 'ol'        // Ordered list item
  | 'task'      // Task/todo item
  | 'table'
  | 'hr'
  | 'html'
  // Special
  | 'agent'     // AI agent
  | 'board'     // Kanban board

type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'blocked'
  | 'waiting'
  | 'scheduled'
  | 'cancelled'
```

### ID Mapping

Stable IDs across filesystem changes:

| Node Type | ID Strategy |
|-----------|-------------|
| folder | `ino:path` (inode + relative path) |
| file | `ino:path` (inode + relative path) |
| section | `file_id:pos:slug` (file + offset + heading slug) |
| block | `file_id:pos` (file + byte offset) |

When files move (rename), inode stays same → ID preserved.
When content shifts, pos changes but slug anchors sections.

### Symlinks

Nodes can reference other nodes via `symlink_to`:

```
Agent "agent-1" (node)
├── Task A (direct child)
├── Task B (symlink → /projects/auth/task-b)
└── Board X (symlink → /boards/sprint-1)
    ├── Task C
    └── Task D
```

Use cases:
- Tasks appearing in multiple views (agent queue + project board)
- Boards aggregating tasks from different parents
- Agents subscribing to task sources

---

## Events

### Event Structure

```typescript
interface Event {
  id: string        // ULID (globally unique, sortable)
  type: EventType
  actor: string     // Who caused this (user, agent, 'system', 'fs-watch')
  target?: string   // What it affects (node ID)
  data: any         // Event-specific payload
  ts: number        // Unix milliseconds
}
```

### Node Lifecycle Events

```typescript
// Create a new node
{ type: 'node_created', actor: 'user-1', data: {
    id: 'node-123',
    type: 'task',
    parent_id: 'folder-1',
    content: 'Implement auth',
    task_status: 'open'
}}

// Update node fields
{ type: 'node_updated', actor: 'agent-1', target: 'node-123', data: {
    task_status: 'in_progress'
}}

// Move node to new parent
{ type: 'node_moved', actor: 'user-1', target: 'node-123', data: {
    parent_id: 'folder-2',
    sort_order: 1.5
}}

// Delete node
{ type: 'node_deleted', actor: 'user-1', target: 'node-123', data: {
    reason: 'completed'
}}
```

### Task Events

```typescript
// Task claimed by agent
{ type: 'task_claimed', actor: 'agent-1', target: 'task-123' }

// Task released
{ type: 'task_released', actor: 'agent-1', target: 'task-123', data: {
    reason: 'blocked on dependency'
}}

// Task completed
{ type: 'task_completed', actor: 'agent-1', target: 'task-123', data: {
    summary: 'Implemented OAuth flow'
}}
```

### Messaging Events

```typescript
// Message between actors
{ type: 'message', actor: 'agent-1', target: 'agent-2', data: {
    body: 'Finished auth, ready for review',
    in_reply_to: 'evt-123'
}}
```

---

## Storage

### events.jsonl

Append-only, line-delimited JSON. Git-tracked.

```jsonl
{"id":"01H5X...","type":"node_created","actor":"user-1","data":{"id":"task-1","type":"task","content":"Auth"},"ts":1704700000}
{"id":"01H5Y...","type":"node_updated","actor":"user-1","target":"task-1","data":{"task_status":"in_progress"},"ts":1704700001}
```

### state.db (SQLite)

Disposable materialized view. Gitignored.

```sql
-- Core node table
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  parent_id TEXT,
  symlink_to TEXT,
  sort_order REAL DEFAULT 0,

  -- Filesystem
  fs_path TEXT,
  fs_ino INTEGER,

  -- Markdown
  md_pos INTEGER,
  md_slug TEXT,

  -- Task
  task_status TEXT,
  task_mark TEXT,
  assigned_to TEXT,
  due_date TEXT,
  scheduled_date TEXT,
  priority INTEGER,

  -- Content
  content TEXT,
  content_hash TEXT,

  -- Metadata
  data JSON,
  created_at INTEGER,
  updated_at INTEGER,
  version TEXT
);

-- Indexes
CREATE INDEX idx_nodes_parent ON nodes(parent_id);
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_fs_path ON nodes(fs_path);
CREATE INDEX idx_nodes_fs_ino ON nodes(fs_ino);
CREATE INDEX idx_nodes_task_status ON nodes(task_status);
CREATE INDEX idx_nodes_assigned ON nodes(assigned_to);
CREATE INDEX idx_nodes_due ON nodes(due_date);

-- Full-text search
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  content,
  content='nodes',
  content_rowid='rowid'
);

-- Event replay cursor
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### Content-Addressable Store (CAS)

Large content stored by hash:

```
.kimmi/blobs/
├── ab/cd1234...  # SHA-256 prefix sharding
└── ef/gh5678...
```

```typescript
function storeContent(content: string): string {
  const hash = sha256(content)
  const dir = join('.kimmi/blobs', hash.slice(0, 2))
  const path = join(dir, hash.slice(2))

  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, content)
  }

  return hash
}

function loadContent(hash: string): string {
  const path = join('.kimmi/blobs', hash.slice(0, 2), hash.slice(2))
  return readFileSync(path, 'utf-8')
}
```

---

## Projection

### Rebuild State

```typescript
async function rebuildState(): Promise<Database> {
  const db = new Database('.kimmi/state.db')

  db.exec(`
    DROP TABLE IF EXISTS nodes;
    DROP TABLE IF EXISTS nodes_fts;
    DROP TABLE IF EXISTS meta;
    -- ... create tables ...
  `)

  const events = readEventsSync('.kimmi/events.jsonl')

  for (const event of events) {
    applyEvent(db, event)
  }

  db.run('INSERT INTO meta (key, value) VALUES (?, ?)',
    ['last_event', events.at(-1)?.id ?? ''])

  return db
}
```

### Apply Events

```typescript
function applyEvent(db: Database, event: Event) {
  switch (event.type) {
    case 'node_created':
      db.run(`
        INSERT INTO nodes (
          id, type, parent_id, symlink_to, sort_order,
          fs_path, fs_ino, md_pos, md_slug,
          task_status, task_mark, assigned_to, due_date, priority,
          content, content_hash, data,
          created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        event.data.id,
        event.data.type,
        event.data.parent_id,
        event.data.symlink_to,
        event.data.sort_order ?? 0,
        event.data.fs_path,
        event.data.fs_ino,
        event.data.md_pos,
        event.data.md_slug,
        event.data.task_status,
        event.data.task_mark,
        event.data.assigned_to,
        event.data.due_date,
        event.data.priority,
        event.data.content,
        event.data.content_hash,
        JSON.stringify(event.data.data ?? {}),
        event.ts,
        event.ts,
        event.id
      ])
      break

    case 'node_updated':
      // Build dynamic update
      const sets: string[] = []
      const values: any[] = []

      for (const [key, value] of Object.entries(event.data)) {
        if (key === 'data') {
          sets.push('data = json_patch(data, ?)')
          values.push(JSON.stringify(value))
        } else {
          sets.push(`${key} = ?`)
          values.push(value)
        }
      }

      sets.push('updated_at = ?', 'version = ?')
      values.push(event.ts, event.id, event.target)

      db.run(`
        UPDATE nodes SET ${sets.join(', ')} WHERE id = ?
      `, values)
      break

    case 'node_moved':
      db.run(`
        UPDATE nodes
        SET parent_id = ?, sort_order = ?, updated_at = ?, version = ?
        WHERE id = ?
      `, [
        event.data.parent_id,
        event.data.sort_order ?? 0,
        event.ts,
        event.id,
        event.target
      ])
      break

    case 'node_deleted':
      db.run('DELETE FROM nodes WHERE id = ?', [event.target])
      break

    case 'task_claimed':
      db.run(`
        UPDATE nodes
        SET assigned_to = ?, task_status = 'in_progress', updated_at = ?, version = ?
        WHERE id = ?
      `, [event.actor, event.ts, event.id, event.target])
      break

    case 'task_released':
      db.run(`
        UPDATE nodes
        SET assigned_to = NULL, task_status = 'open', updated_at = ?, version = ?
        WHERE id = ?
      `, [event.ts, event.id, event.target])
      break

    case 'task_completed':
      db.run(`
        UPDATE nodes
        SET assigned_to = NULL, task_status = 'done', updated_at = ?, version = ?
        WHERE id = ?
      `, [event.ts, event.id, event.target])
      break
  }
}
```

### Emit Function

```typescript
import { appendFileSync } from 'fs'
import { ulid } from 'ulid'

function emit(event: Omit<Event, 'id' | 'ts'>): Event {
  const full: Event = {
    id: ulid(),
    ts: Date.now(),
    ...event
  }

  // Append to events file
  appendFileSync('.kimmi/events.jsonl', JSON.stringify(full) + '\n')

  // Apply to state.db (if loaded)
  if (db) {
    applyEvent(db, full)
  }

  return full
}
```

---

## Queries

### Common Queries

```typescript
// Get children of a node
function getChildren(parentId: string): Node[] {
  return db.all(`
    SELECT * FROM nodes
    WHERE parent_id = ?
    ORDER BY sort_order
  `, [parentId])
}

// Get subtree
function getSubtree(rootId: string): Node[] {
  return db.all(`
    WITH RECURSIVE subtree AS (
      SELECT * FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN subtree s ON n.parent_id = s.id
    )
    SELECT * FROM subtree
    ORDER BY sort_order
  `, [rootId])
}

// Get tasks by status
function getTasksByStatus(status: TaskStatus): Node[] {
  return db.all(`
    SELECT * FROM nodes
    WHERE type = 'task' AND task_status = ?
    ORDER BY priority, due_date, created_at
  `, [status])
}

// Full-text search
function search(query: string): Node[] {
  return db.all(`
    SELECT n.* FROM nodes n
    JOIN nodes_fts f ON n.rowid = f.rowid
    WHERE nodes_fts MATCH ?
    ORDER BY rank
  `, [query])
}

// Resolve symlinks
function resolveNode(node: Node): Node {
  if (node.symlink_to) {
    return db.get('SELECT * FROM nodes WHERE id = ?', [node.symlink_to])
  }
  return node
}
```

---

## Git Workflow

### .gitignore

```
.kimmi/state.db
.kimmi/state.db-journal
.kimmi/state.db-wal
.kimmi/blobs/
```

### Sync

```bash
# Pull remote changes
git pull

# Rebuild state from merged events
km rebuild

# Local work generates events...

# Push
git add .kimmi/events.jsonl
git commit -m "Events $(date +%Y-%m-%d)"
git push
```

### Merge Conflicts

Events use ULIDs (timestamp-based, unique):

- Different lines = auto-merge (append both)
- Same ULID = impossible (ULIDs are unique)
- Ordering = handled by replay (sort by ULID)

```typescript
function readEventsSync(path: string): Event[] {
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean)
  const events = lines.map(l => JSON.parse(l))

  // Dedupe by ID, sort by ULID
  const seen = new Set()
  return events
    .filter(e => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}
```

---

## File Size Estimates

| Content | Size per Unit | Daily | Monthly |
|---------|---------------|-------|---------|
| Node event | ~200 bytes | 1000 = 200KB | 6MB |
| Message | ~500 bytes | 500 = 250KB | 7.5MB |
| Session log | ~2KB | 2000 = 4MB | 120MB |

Manageable in git. Consider periodic archival for multi-year usage.

---

## References

- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [ULID Spec](https://github.com/ulid/spec)
- [Beads](https://github.com/steveyegge/beads) — Git-backed issue tracker
- [SQLite JSON](https://www.sqlite.org/json1.html) — JSON functions
