# Store Architecture Specification

This document defines the layered architecture for km's data store, supporting both persisted and in-memory modes.

## Overview

km operates in two modes depending on whether a `.km/` directory exists:

| Mode | Trigger | Storage | Persistence | Use Case |
|------|---------|---------|-------------|----------|
| **Persisted** | `.km/` exists | SQLite on disk | Yes | Full features, event history |
| **In-Memory** | No `.km/` found | SQLite `:memory:` | No | Portable read-write, zero setup |

**Both modes support read-write operations.** In-memory mode writes changes directly to markdown files (e.g., toggling checkboxes), while persisted mode additionally records events for history and sync.

## Mode Detection

```
km <command> [path]
    │
    ▼
Find .km/ directory
    │
    ├─► Found: Use persisted mode
    │   - Root = directory containing .km/
    │   - DB = .km/state.db
    │   - Events = .km/events.jsonl
    │
    └─► Not found: Use in-memory mode
        - Root = $CWD (or specified path)
        - DB = :memory:
        - No events, no history
```

### Initialization

`.km/` is only created explicitly:

```bash
km init              # Create .km/ in current directory
km init ~/projects   # Create .km/ in specified directory
```

Without `km init`, km works as a read-write viewer with no persistent state.

---

## Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI / TUI Layer                          │
│  commands: tasks, board, tree, show, etc.                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Display Layer                              │
│  Transforms km-tree → display-tree                              │
│  - Node collapsing (folder+file+section → unified)              │
│  - Type suffixes (/ .md #)                                      │
│  - Formatting for output                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Store Layer                               │
│  NodeStore interface                                            │
│  - getNode(), getChildren(), getAncestors()                     │
│  - updateNode() (writes through to source)                      │
│  Implementations: PersistedStore, MemoryStore                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       km-tree (Parsed)                           │
│  Unified node tree in SQLite                                    │
│  - All node types: folder, file, section, task, etc.            │
│  - parent_id relationships                                      │
│  - Content stored inline or in source files                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       fs-tree (Source)                           │
│  Raw filesystem + markdown content                              │
│  - Folders and files                                            │
│  - Markdown parsed into sections, tasks, blocks                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tree Nomenclature

### fs-tree (Filesystem Source)

The raw filesystem structure plus markdown content:

```
projects/                    # folder
  Taxes/                     # folder
    Taxes.md                 # file
      # Taxes               # section (in markdown)
        - [ ] File return   # task (in markdown)
```

**Characteristics:**
- Physical files and directories
- Markdown parsed but not yet unified
- Source of truth for content

### km-tree (Parsed/Unified)

The database representation where all nodes live in a single hierarchy:

```sql
nodes (id, type, parent_id, content, fs_path, md_line, ...)
```

```
folder: projects/
  └─ folder: Taxes/
       └─ file: Taxes.md
            └─ section: "Taxes"
                 └─ task: "File return"
```

**Characteristics:**
- Unified node model (everything is a node)
- Queryable via SQL
- Contains location info (fs_path, md_line) for write-back
- Same structure in both persisted and in-memory modes

### display-tree (Presentation)

The transformed tree for UI rendering:

```
projects/
  Taxes / .md #              ← collapsed: folder + file + section
    [ ] File return
```

**Characteristics:**
- Exists only at render time (not persisted)
- Collapsing applied based on context
- Formatted with type indicators, colors, indentation

For details on collapsing, views, and formatting, see [km-ui-spec](km-ui-spec.md).

---

## Store Interface

```typescript
interface NodeStore {
  // Mode info
  readonly mode: "persisted" | "memory";
  readonly rootPath: string;

  // Read operations
  getNode(id: string): Node | null;
  getChildren(parentId: string | null): Node[];
  getAncestors(nodeId: string): Node[];
  getRootNodes(): Node[];

  // Query
  query<T>(sql: string, params?: unknown[]): T[];

  // Write operations
  updateNode(id: string, changes: Partial<Node>): void;

  // Lifecycle
  refresh(): void;  // Re-scan filesystem (memory mode)
  close(): void;
}
```

### PersistedStore

```typescript
class PersistedStore implements NodeStore {
  readonly mode = "persisted";
  private db: Database;

  constructor(kmPath: string) {
    this.db = new Database(join(kmPath, "state.db"));
    // Load from events.jsonl if needed
  }

  updateNode(id: string, changes: Partial<Node>): void {
    // 1. Emit event to events.jsonl
    // 2. Apply to SQLite
    emit({ type: "node_updated", target: id, data: changes });
  }
}
```

### MemoryStore

**Read-write without persistence.** Changes are written directly to markdown files.

```typescript
class MemoryStore implements NodeStore {
  readonly mode = "memory";
  private db: Database;

  constructor(rootPath: string) {
    this.db = new Database(":memory:");
    this.db.exec(SCHEMA);
    this.scanFilesystem(rootPath);
  }

  updateNode(id: string, changes: Partial<Node>): void {
    const node = this.getNode(id);
    if (!node) return;

    // 1. Update in-memory SQLite
    this.db.run("UPDATE nodes SET ... WHERE id = ?", [...]);

    // 2. Write through to markdown file
    if (changes.task_status && node.fs_path && node.md_line != null) {
      this.updateMarkdownFile(node, changes);
    }
  }

  private updateMarkdownFile(node: Node, changes: Partial<Node>): void {
    const lines = readFileSync(node.fs_path, "utf-8").split("\n");
    // Toggle checkbox: - [ ] ↔ - [x]
    lines[node.md_line] = lines[node.md_line].replace(
      /^(\s*- \[).(])/,
      `$1${changes.task_status === "done" ? "x" : " "}$2`
    );
    writeFileSync(node.fs_path, lines.join("\n"));
  }

  refresh(): void {
    // Clear and re-scan
    this.db.exec("DELETE FROM nodes");
    this.scanFilesystem(this.rootPath);
  }
}
```

**Write-through behavior:** When a task's status changes, MemoryStore:
1. Updates the in-memory SQLite database
2. Immediately writes the change to the source `.md` file using `fs_path` and `md_line`

This enables full task management (toggling checkboxes, etc.) without requiring `km init`.

---

## Store Initialization

```typescript
// src/node/store.ts

let store: NodeStore | null = null;

export function initStore(path?: string): NodeStore {
  const startPath = path ?? process.cwd();
  const kmPath = findKmDirectory(startPath);

  if (kmPath) {
    store = new PersistedStore(kmPath);
  } else {
    store = new MemoryStore(startPath);
  }

  return store;
}

export function getStore(): NodeStore {
  if (!store) {
    return initStore();
  }
  return store;
}

function findKmDirectory(startPath: string): string | null {
  let current = startPath;
  while (current !== "/") {
    const kmPath = join(current, ".km");
    if (existsSync(kmPath) && statSync(kmPath).isDirectory()) {
      return kmPath;
    }
    current = dirname(current);
  }
  return null;
}
```

---

## Node Schema

Both modes use the same node structure:

```typescript
interface Node {
  id: string;              // ULID (persisted) or path-based (memory)
  type: NodeType;
  parent_id: string | null;
  sort_order: number;

  // Filesystem location (for write-back)
  fs_path: string | null;  // Absolute path to .md file
  md_line: number | null;  // Line number in file (0-indexed)

  // Content
  content: string | null;  // Text content

  // Task properties
  task_status: TaskStatus | null;
  task_mark: string | null;  // ' ', 'x', '/', etc.

  // Metadata
  data: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}
```

### ID Strategy

| Mode | ID Format | Example |
|------|-----------|---------|
| Persisted | ULID | `01H5XJKM...` |
| Memory | `path:line` | `projects/todo.md:42` |

Memory mode IDs are session-local. They're sufficient for:
- Tree navigation
- Write-back (fs_path + md_line)
- UI state (cursor position by index)

They don't support:
- Cross-session references
- `km show <id>` command
- Symlinks

---

## Feature Comparison

| Feature | Persisted | Memory |
|---------|-----------|--------|
| View tree | ✓ | ✓ |
| View tasks | ✓ | ✓ |
| Board TUI | ✓ | ✓ |
| Toggle checkbox | ✓ | ✓ |
| Set due date | ✓ | ✗ |
| Set priority | ✓ | ✗ (unless inline) |
| Move nodes | ✓ | ✗ |
| Symlinks | ✓ | ✗ |
| Event history | ✓ | ✗ |
| `km show <id>` | ✓ | ✗ |
| Cross-session state | ✓ | ✗ |

---

## Migration Path

Existing code imports from `src/node/db.ts`. Migration:

1. Create `src/node/store.ts` with `NodeStore` interface
2. Implement `PersistedStore` wrapping existing db.ts code
3. Implement `MemoryStore` with filesystem scanning
4. Update imports: `db.ts` → `store.ts`
5. Add mode detection in CLI entry point

```typescript
// Before
import { getNode, getChildren } from "../node/db.ts";

// After
import { getNode, getChildren } from "../node/store.ts";
```

The store module re-exports the same functions, dispatching to the active store.

---

## See Also

- [km-tree-spec.md](km-tree-spec.md) — Tree nomenclature (fs-tree, km-tree, display-tree)
- [km-ui-spec.md](km-ui-spec.md) — Display layer, views, collapsing
- [km-node-spec.md](km-node-spec.md) — Node data model (persisted mode)
- [km-cli-spec.md](km-cli-spec.md) — CLI commands
