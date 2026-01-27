# Architecture

km is a **PIM/PKM engine** that turns markdown files into a semantic tree. This document covers the system architecture: layers, data flow, domain objects, and packages.

> **For the "why" behind these choices**, see [00-principles.md](00-principles.md).

---

## Five Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  APP        apps/ (@km/cli-app, @km/tui-app, @km/repl)              │
│             Rendering, modals, user input                           │
│             State: AppState = BoardState + AppUIState               │
├─────────────────────────────────────────────────────────────────────┤
│  BOARD      @km/board                                               │
│             Cursor, selection, fold, zoom, navigation history       │
│             State: BoardState    Actions: BoardAction               │
├─────────────────────────────────────────────────────────────────────┤
│  TREE       @km/tree                                                │
│             TNode (recursive), queries, display names               │
│             Data: TNode, TPath   Actions: TAction                   │
├─────────────────────────────────────────────────────────────────────┤
│  STORAGE    @km/storage                                             │
│             KNode (flat), SQLite, events, file sync                 │
│             Data: KNode          Functions: CRUD + emit()           │
├─────────────────────────────────────────────────────────────────────┤
│  FS         filesystem + @km/markdown                               │
│             Folders, .md files — source of truth                    │
│             Parser: markdown ↔ KNode (stateless)                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Rules:**

- Each layer only calls the layer directly below
- UI never touches filesystem directly
- All mutations flow through `emit()` (enables sync, undo, multi-window)

---

## Domain Objects

Functionality is exposed through **domain objects created by factory functions**. See [00-principles.md](00-principles.md) for the philosophy behind this approach.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Application Code                                                   │
│                                                                     │
│    using repo = runGenerator(createRepo(path))                      │
│    const board = createBoardState(repo.data, rootId)                │
│    await using watcher = repo.watch()                               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Domain Objects                                                     │
│                                                                     │
│    Repo          Board          Watcher         Config              │
│    ├─ data       ├─ moveCursor()├─ start()      ├─ beads            │
│    ├─ files      ├─ select()    ├─ stop()       └─ tui              │
│    ├─ config     ├─ zoom()      └─ on("change")                     │
│    ├─ watch()    └─ refresh()                                       │
│    └─ close()                                                       │
│                                                                     │
│    Disposable    plain object   Service         plain object        │
│    (sync)                       (async)                             │
├─────────────────────────────────────────────────────────────────────┤
│  Factory Functions                                                  │
│                                                                     │
│    createRepo(path, options)    → Repo                              │
│    createBoardState(data, root) → BoardState                             │
│    repo.watch()                 → Watcher (Service)                 │
│    loadConfigObject(repoPath)   → Config                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Domain Objects

| Object    | Factory              | Lifecycle    | Purpose                                    |
| --------- | -------------------- | ------------ | ------------------------------------------ |
| `Repo`    | `createRepo()`       | `Disposable` | DataStore + FileTree + Config              |
| `Board`   | `createBoardState()` | plain object | Navigation state (cursor, selection, zoom) |
| `Watcher` | `repo.watch()`       | `Service`    | File sync (start/stop lifecycle)           |
| `Config`  | `loadConfigObject`   | plain object | Repository configuration                   |

> **Current API:** Use `Repo` / `createRepo()` for all new code.

### Service Interface

Objects with start/stop lifecycle (like Watcher) implement the Service interface:

```typescript
interface Service extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping"
  start(): Promise<void>
  stop(): Promise<void>
}
```

### Composition Example

```typescript
async function runTui(path: string, rootId: string) {
  // Create domain objects with explicit dependencies
  using repo = runGenerator(createRepo(path))
  const board = createBoardState(repo.data, rootId)
  await using watcher = repo.watch()

  // Start file watching
  await watcher.start()
  watcher.on("change", () => board.refresh())

  // Run TUI...

  // Cleanup order (reverse): watcher.stop(), board cleanup, repo.close()
}
```

See [00-principles.md](00-principles.md) for the philosophy and patterns

---

## Data Types

```
FS → Storage:    File content  → KNode         (parse markdown)
Storage → App:   repo.data.getChildren() → KNode[] (on-demand tree queries)
App Render:      repo + state → columns       (derived at render time)
```

| Type                   | Package   | Description                                |
| ---------------------- | --------- | ------------------------------------------ |
| `KNode`                | @km/core  | Flat record with `parent_id` (SQLite)      |
| `TNode`                | @km/core  | Recursive with `children[]` (legacy paths) |
| `SimplifiedBoardState` | @km/board | cursorNodeId, fold, zoom (no tree data)    |
| `UIState`              | apps/     | Dialogs, view mode, dimensions             |

**Key design:** No tree data in board state. Navigation uses `repo.getChildren()` directly. Columns are derived at render time via `useColumns()`, cursor position via `useCursorPosition()`.

| Action Type   | Package   | Examples                          |
| ------------- | --------- | --------------------------------- |
| `TAction`     | @km/tree  | T_ADD_NODE, T_MOVE_NODE, T_DELETE |
| `BoardAction` | @km/board | CURSOR*\*, SELECT*\*, FOLD, ZOOM  |
| `AppAction`   | apps/     | TOGGLE_SEARCH, TOGGLE_HELP        |

---

## Command/Data Flow

All user actions flow through the command system:

```
User Input (key, click, or command palette)
    ↓
Key Normalization (unifies key formats)
    ↓
Binding Resolution (first-match with when predicates)
    ↓
Command Execution (cmd(ctx) - direct execution)
    ↓
State Updates (dispatchers, storage)
    ↓
Re-render
```

### Command System

Commands are functions that execute with a unified context:

```typescript
type Cmd = (ctx: Ctx) => void
type When = (ctx: Ctx) => boolean

interface Binding {
  keys: string[]
  cmd: Cmd
  when?: When
}
```

The same key can map to different commands based on context:

| Key | Context              | Command      |
| --- | -------------------- | ------------ |
| `j` | board                | `cursorNext` |
| `j` | projectPicker dialog | `pickerNext` |
| `j` | move mode            | `moveDest`   |

Commands execute directly rather than returning action descriptors:

```typescript
const cycleTaskStatus: Cmd = (ctx) => {
  if (!ctx.knode?.task_status) return
  const next = nextStatus(ctx.knode.task_status)
  ctx.storage.update(ctx.knode.id, { task_status: next })
  ctx.refresh()
}

const cursorNext: Cmd = (ctx) => {
  ctx.dispatchBoard({ type: "CURSOR_MOVE", dir: "next" })
}
```

This enables:

- **Context-aware bindings**: Same key, different behavior based on modal state
- **Direct storage access**: Commands can read/write storage directly
- **Testable**: Commands are pure functions with injectable context

See [09-commands.md](09-commands.md) for full documentation.

### Action Types and Boundaries

| Action Type   | State Owner | Side Effects       |
| ------------- | ----------- | ------------------ |
| `BoardAction` | BoardState  | None (pure)        |
| `UIAction`    | UIState     | None (pure)        |
| Storage calls | Storage     | SQLite + file sync |

**Key principle:** Reducers are pure. Storage mutations happen directly in commands via `ctx.storage`.

### Why This Matters

- **Undo/redo**: Storage tracks event history
- **Testability**: Commands are pure functions with mock context
- **Context-aware**: Same key binds to different commands based on layer
- **Multi-window**: Storage events can be broadcast

---

## Concrete Data Flow

### User Marks Task Done (TUI → File)

```
1. Input      User presses `x`
2. Resolve    Binding lookup: x + board + nodeIsTask → cycleTaskStatus
3. Execute    cycleTaskStatus(ctx) calls ctx.storage.update()
4. Storage    Updates SQLite + syncs to filesystem
5. File       "- [x] Task" written to markdown
6. Refresh    ctx.refresh() → dispatch(REFRESH) → re-render
```

Commands directly access storage via `ctx.storage` for mutations, and use `ctx.dispatchBoard` for cursor/selection state.

### User Edits File (File → TUI)

```
1. File       User saves tasks.md in vim
2. Watcher    Chokidar detects change (5s debounce)
3. Reconcile  Parse file, diff against DB, emit events
4. Storage    Updates SQLite state
5. Signal     SyncManager emits "state-change" → tuiEvents.emit("refresh")
6. App        refreshTree() → dispatch(REFRESH) → re-render
```

See [03-storage.md](03-storage.md) for details on how @km/storage implements bidirectional sync.

---

## Package Structure

```
packages/
  @km/core       - KNode, TNode, shared types
  @km/storage    - SQLite, events, sync
  @km/markdown   - Parser (markdown ↔ KNode)
  @km/tree       - Tree queries, display names
  @km/board      - BoardState, cursor, selection, fold

apps/
  km-cli/        → @km/cli-app     CLI commands
  km-repl/       → @km/repl        REPL application
  km-tui/        → @km/tui-app     TUI application
```

---

## Glossary

| Term            | Definition                                               |
| --------------- | -------------------------------------------------------- |
| **KNode**       | Flat record with `parent_id`. Stored in SQLite.          |
| **TNode**       | Recursive tree with `children[]`. For navigation.        |
| **BoardState**  | Visual state: cursor, selection, fold, zoom.             |
| **memory mode** | No `.km/`. SQLite in RAM. Ephemeral IDs.                 |
| **disk mode**   | `.km/` exists. SQLite on disk. Stable IDs, events, sync. |
| **collapsing**  | Merging same-named folder/file/H1 into one display line. |
| **cursoring**   | Moving to adjacent block (hjkl).                         |
| **navigating**  | Changing board root via zoom (u/Enter).                  |
| **shifting**    | Moving selected nodes in direction (opt+hjkl).           |

---

## See Also

- [00-principles.md](00-principles.md) — Architectural principles and philosophy
- [01-concepts.md](01-concepts.md) — Core concepts
- [03-storage.md](03-storage.md) — Storage layer, modes, sync details
