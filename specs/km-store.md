# Store Specification

Memory vs disk modes for km.

---

## Two Modes

| Mode | Trigger | SQLite | Event Log | Node IDs |
|------|---------|--------|-----------|----------|
| **Memory** | No `.km/` | `:memory:` | None | Ephemeral |
| **Disk** | `.km/` exists | `.km/state.db` | `.km/events.jsonl` | Stable |

**Both modes are read-write.** The key differences:

### What's Different

| Aspect | Memory Mode | Disk Mode |
|--------|-------------|-----------|
| **SQLite** | Rebuilt from `.md` each run | Persisted in `.km/state.db` |
| **Event log** | None | All changes in `events.jsonl` |
| **Node IDs** | `path:line` (session-local) | ULIDs (permanent) |
| **Write path** | Direct to `.md` files | Event → SQLite → (optionally sync to `.md`) |
| **Startup** | Scan filesystem | Load SQLite |
| **History** | None | Full audit trail |

### Memory Mode

SQLite lives in RAM. Rebuilt from filesystem on each run:

```bash
cd ~/any-project
km tasks              # Scans .md files → builds :memory: SQLite
km toggle abc123      # Updates :memory: + writes to .md file
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
km toggle abc123      # Appends to events.jsonl, updates SQLite
# exit
km show abc123        # Same ID still works
```

- Run `km init` once to enable
- All changes logged to `events.jsonl`
- SQLite is a rebuildable cache
- IDs are stable ULIDs
- Enables: history, undo, sync, cross-session references

### When to Use Each

| Use Case | Mode |
|----------|------|
| Browse any markdown folder | Memory |
| Quick task toggle in random repo | Memory |
| Your main projects | Disk |
| Need history/undo | Disk |
| Reference tasks by stable ID | Disk |
| Multi-device sync (future) | Disk |

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

---

## DiskStore

Uses `.km/state.db` with event sourcing.

```typescript
class DiskStore implements NodeStore {
  readonly mode = "disk";

  updateNode(id: string, changes: Partial<Node>): void {
    // 1. Emit event
    emit({ type: "node_updated", target: id, data: changes });
    // 2. Event projection applies to SQLite
  }
}
```

---

## MemoryStore

Uses `:memory:` SQLite with write-through to `.md` files.

```typescript
class MemoryStore implements NodeStore {
  readonly mode = "memory";

  constructor(rootPath: string) {
    this.db = new Database(":memory:");
    this.scanFilesystem(rootPath);
  }

  updateNode(id: string, changes: Partial<Node>): void {
    const node = this.getNode(id);

    // 1. Update in-memory SQLite
    this.db.run("UPDATE nodes SET ...");

    // 2. Write through to .md file
    if (changes.task_status && node.fs_path && node.md_line != null) {
      this.updateMarkdownFile(node, changes);
    }
  }

  private updateMarkdownFile(node: Node, changes: Partial<Node>): void {
    const lines = readFileSync(node.fs_path, "utf-8").split("\n");
    lines[node.md_line] = lines[node.md_line].replace(
      /^(\s*- \[).(])/,
      `$1${changes.task_status === "done" ? "x" : " "}$2`
    );
    writeFileSync(node.fs_path, lines.join("\n"));
  }
}
```

---

## Initialization

```typescript
export function initStore(path?: string): NodeStore {
  const startPath = path ?? process.cwd();
  const kmPath = findKmDirectory(startPath);

  if (kmPath) {
    return new DiskStore(kmPath);
  } else {
    return new MemoryStore(startPath);
  }
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

## Feature Comparison

| Feature | Memory | Disk |
|---------|--------|------|
| View tree/tasks/board | Yes | Yes |
| Toggle checkboxes | Yes | Yes |
| Event history | No | Yes |
| Stable IDs across sessions | No | Yes |
| `km show <id>` works later | No | Yes |
| Undo/history | No | Yes |
| Sync support | No | Yes |

---

## ID Strategy

| Mode | Format | Example |
|------|--------|---------|
| Disk | ULID | `01H5XJKM...` |
| Memory | `path:line` | `projects/todo.md:42` |

Memory IDs are session-local. Write-back uses `fs_path` + `md_line`, not ID.

---

## See Also

- [Data Model](km-data-model.md) — Node schema, events
- [UI](km-ui.md) — Views and rendering
- [Watch](km-watch.md) — Bidirectional sync (disk mode)
