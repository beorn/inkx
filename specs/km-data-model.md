# Data Model Specification

Node schema, events, and storage for km.

---

## Node Schema

Everything is a node. The unified schema:

```typescript
interface Node {
  id: string;                    // ULID (persisted) or path:line (memory)
  type: NodeType;
  parent_id: string | null;
  sort_order: number;

  // Location (for write-back)
  fs_path: string | null;        // Absolute path to .md file
  md_line: number | null;        // Line number (0-indexed)

  // Content
  content: string | null;        // Display text

  // Task properties
  task_status: TaskStatus | null;
  task_mark: string | null;      // ' ', 'x', '/', etc.

  // Metadata
  data: Record<string, unknown>; // Frontmatter, custom fields
  created_at: number;
  updated_at: number;
}
```

### Node Types

```typescript
type NodeType =
  // Structural
  | 'folder'      // Directory
  | 'file'        // .md file
  | 'section'     // Heading

  // Content
  | 'task'        // - [ ] item
  | 'paragraph'   // Text block
  | 'ul'          // Unordered list item
  | 'ol'          // Ordered list item
  | 'quote'       // > blockquote
  | 'code'        // ```code```
  | 'table'
  | 'hr'
  | 'html'

  // Special (persisted mode)
  | 'board'
  | 'agent';
```

### Task Status

```typescript
type TaskStatus =
  | 'open'        // [ ]
  | 'in_progress' // [/]
  | 'done'        // [x]
  | 'blocked'
  | 'waiting'
  | 'cancelled';  // [-]
```

### Task Marks

| Mark | Status | Display |
|------|--------|---------|
| ` ` | open | `[ ]` |
| `x` or `X` | done | `[x]` |
| `/` | in_progress | `[/]` |
| `-` | cancelled | `[-]` |
| `?` | blocked | `[?]` |

---

## ID Strategy

| Mode | Format | Example |
|------|--------|---------|
| Persisted | ULID | `01H5XJKM7B...` |
| In-memory | `path:line` | `projects/todo.md:42` |

In-memory IDs are session-local but sufficient for:
- Tree navigation
- Write-back (via `fs_path` + `md_line`)
- Cursor position

---

## SQLite Schema

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  parent_id TEXT,
  sort_order REAL DEFAULT 0,

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

## Events (Persisted Mode Only)

Events are append-only records in `.km/events.jsonl`.

### Event Structure

```typescript
interface Event {
  id: string;          // ULID
  type: EventType;
  actor: string;       // 'user', 'system', 'fs-watch', agent ID
  target?: string;     // Node ID
  data: unknown;
  ts: number;          // Unix ms
}
```

### Event Types

```typescript
// Node lifecycle
{ type: 'node_created', data: { id, type, parent_id, content, ... } }
{ type: 'node_updated', target: id, data: { task_status: 'done' } }
{ type: 'node_moved', target: id, data: { parent_id, sort_order } }
{ type: 'node_deleted', target: id }

// Task actions
{ type: 'task_claimed', actor: 'agent-1', target: id }
{ type: 'task_completed', actor: 'agent-1', target: id }
```

### Emit Function

```typescript
function emit(event: Omit<Event, 'id' | 'ts'>): Event {
  const full: Event = {
    id: ulid(),
    ts: Date.now(),
    ...event
  };

  appendFileSync('.km/events.jsonl', JSON.stringify(full) + '\n');

  if (db) applyEvent(db, full);

  return full;
}
```

---

## State Rebuild

SQLite is a disposable cache. Rebuild anytime:

```typescript
async function rebuildState(): Promise<Database> {
  const db = new Database('.km/state.db');
  db.exec('DROP TABLE IF EXISTS nodes; ...');
  db.exec(CREATE_SCHEMA);

  const events = readEventsSync('.km/events.jsonl');
  for (const event of events) {
    applyEvent(db, event);
  }

  return db;
}
```

---

## Common Queries

```typescript
// Get children
function getChildren(parentId: string | null): Node[] {
  return db.all(`
    SELECT * FROM nodes
    WHERE parent_id ${parentId ? '= ?' : 'IS NULL'}
    ORDER BY sort_order
  `, parentId ? [parentId] : []);
}

// Get ancestors (root to node)
function getAncestors(nodeId: string): Node[] {
  return db.all(`
    WITH RECURSIVE ancestors AS (
      SELECT * FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN ancestors a ON n.id = a.parent_id
    )
    SELECT * FROM ancestors ORDER BY rowid DESC
  `, [nodeId]);
}

// Get all tasks
function getTasks(): Node[] {
  return db.all(`
    SELECT * FROM nodes
    WHERE type = 'task'
    ORDER BY created_at
  `);
}
```

---

## See Also

- [Store](km-store.md) — Persisted vs in-memory modes
- [Markdown](km-markdown.md) — Parsing .md to nodes
- [Overview](km-overview.md) — Quick start
