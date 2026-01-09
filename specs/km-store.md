# Store Specification

Persisted and in-memory modes for km.

---

## Two Modes

| Mode | Trigger | Storage | Features |
|------|---------|---------|----------|
| **Persisted** | `.km/` exists | SQLite on disk | Full: events, history, sync |
| **In-Memory** | No `.km/` | SQLite `:memory:` | Instant: read-write, zero setup |

Both modes support read-write. In-memory writes directly to `.md` files.

---

## Mode Detection

```
km <command> [path]
    │
    ▼
Search for .km/ in ancestors
    │
    ├─► Found: Persisted mode
    │   └─ Root = directory containing .km/
    │
    └─► Not found: In-memory mode
        └─ Root = current directory
```

`.km/` is only created via explicit `km init`.

---

## Store Interface

```typescript
interface NodeStore {
  readonly mode: "persisted" | "memory";
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

## PersistedStore

Uses `.km/state.db` with event sourcing.

```typescript
class PersistedStore implements NodeStore {
  readonly mode = "persisted";

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
    return new PersistedStore(kmPath);
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

| Feature | Persisted | In-Memory |
|---------|-----------|-----------|
| View tree/tasks/board | Yes | Yes |
| Toggle checkboxes | Yes | Yes |
| Event history | Yes | No |
| `km show <id>` | Yes | No |
| Cross-session IDs | Yes | No |
| Symlinks | Yes | No |

---

## ID Strategy

| Mode | Format | Example |
|------|--------|---------|
| Persisted | ULID | `01H5XJKM...` |
| In-Memory | `path:line` | `projects/todo.md:42` |

Memory IDs are session-local. Write-back uses `fs_path` + `md_line`, not ID.

---

## See Also

- [Data Model](km-data-model.md) — Node schema, events
- [Display](km-display.md) — Views and rendering
- [Watch](km-watch.md) — Bidirectional sync (persisted mode)
