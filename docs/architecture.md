# Architecture

km is an **externalized brain** for humans and AI agents — a headless knowledge engine that turns plain markdown files into a structured, queryable, history-aware knowledge system. This document covers the system architecture: layers, data flow, domain objects, and packages.

> **For the "why" behind these choices**, see [principles.md](principles.md).

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

Functionality is exposed through **domain objects created by factory functions**. See [principles.md](principles.md) for the philosophy behind this approach.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Application Code                                                   │
│                                                                     │
│    using repo = runGenerator(createRepo(path))                      │
│    const board = createBoardState(rootId)                           │
│    await using watcher = repo.watch()                               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Domain Objects                                                     │
│                                                                     │
│    Repo          BoardState     Watcher         Config              │
│    ├─ data       (plain state)  ├─ start()      ├─ beads            │
│    ├─ files      Updated via    ├─ stop()       └─ tui              │
│    ├─ config     boardReducer() └─ on("change")                     │
│    ├─ watch()    + BoardAction                                      │
│    └─ close()                                                       │
│                                                                     │
│    Disposable    plain object   Service         plain object        │
│    (sync)        (reducer)      (async)                             │
├─────────────────────────────────────────────────────────────────────┤
│  Factory Functions                                                  │
│                                                                     │
│    createRepo(path, options)    → Repo                              │
│    createBoardState(rootId)    → BoardState                         │
│    repo.watch()                → Watcher (Service)                  │
│    loadConfigObject(repoPath)  → Config                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Domain Objects

| Object    | Factory              | Lifecycle    | Purpose                                    |
| --------- | -------------------- | ------------ | ------------------------------------------ |
| `Repo`    | `createRepo()`       | `Disposable` | DataStore + FileTree + Config              |
| `Board`   | `createBoardState()` | plain object | Navigation state (cursor, selection, fold). Updated via `boardReducer()` + `BoardAction` |
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
  let board = createBoardState(rootId)
  await using watcher = repo.watch()

  // Start file watching
  await watcher.start()

  // State updates via reducer + actions
  board = boardReducer(board, { type: "SELECT", nodeId: firstChildId })

  // Cleanup order (reverse): watcher.stop(), repo.close()
}
```

See [principles.md](principles.md) for the philosophy and patterns

---

## Data Types

```
FS → Storage:    File content  → ProcessedMarkdown → KNode (parse + transform)
Storage → App:   repo.data.getChildren() → KNode[] (on-demand tree queries)
App Render:      repo + state → columns       (derived at render time)
```

| Type                   | Package     | Description                                                    |
| ---------------------- | ----------- | -------------------------------------------------------------- |
| `KNode`                | @km/core    | Flat record with `parent_id` (SQLite, null for repo root only) |
| `TNode`                | @km/core    | Recursive with `children[]` (legacy paths)                     |
| `ProcessedMarkdown`    | @km/storage | Parsed file + hash (intermediate data type)                    |
| `BoardState`           | @km/board   | cursorNodeId, fold, zoom (no tree data)                        |
| `UIState`              | apps/       | Dialogs, view mode, dimensions                                 |

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

See [ref/commands.md](ref/commands.md) for full documentation.

### Action Types and Boundaries

| Action Type    | State Owner | Side Effects       |
| -------------- | ----------- | ------------------ |
| `BoardAction`  | BoardState  | None (pure)        |
| `CommandAction` | Handlers   | Repo mutations     |
| Storage calls  | Storage     | SQLite + file sync |

`CommandAction` = `VerbOp | NavOp | EditOp | TextOp | BoardOp | DialogOp | PaneOp | ViewOp`. The 8-line router in `board-actions.ts` dispatches to focused sub-handlers.

**Key principle:** Reducers are pure. Storage mutations happen directly in handlers via `ctx.repo`.

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
5. Signal     SyncManager emits "state-change" → repo.touch() (cache bust + version bump)
6. App        useColumns re-derives via useSyncExternalStore → re-render
```

See [storage.md](storage.md) for details on how @km/storage implements bidirectional sync.

---

## Package Structure

```
packages/
  @km/core              - KNode, TNode, shared types
  @km/storage           - SQLite, events, sync
  @km/markdown          - Parser (markdown ↔ KNode)
  @km/tree              - Tree queries, display names
  @km/board             - BoardState, cursor, selection, fold
  @km/commands          - Command system, keybindings, context
  @km/beads             - Issue tracking queries (bd integration)
  @km/agent             - Agent runtime, harnesses, sessions
  @km/connector-caldav  - CalDAV/CardDAV client

apps/
  km-cli/        → @km/cli-app     CLI commands
  km-repl/       → @km/repl        REPL application
  km-tui/        → @km/tui-app     TUI application
```

---

## Names, Paths, and IDs

km uses a three-tier naming system inspired by filesystem semantics:

| Concept  | Example                | Unique? | Purpose                           |
| -------- | ---------------------- | ------- | --------------------------------- |
| **Name** | `inbox`, `readme`      | No      | Human-friendly, can repeat        |
| **Path** | `projects/inbox.md`    | Yes     | Composed of names, like fs paths  |
| **ID**   | `01H5X...` or `p/i:42` | Yes     | Internal reference, stable        |

### Resolution Algorithm

The `resolveNode()` function uses path-first semantics:

```
Query contains "/" (path-like)?
├─ Starts with /, ./, ../ → Absolute path resolution
└─ Contains / → Relative path suffix match

Query is bare name (no "/")?
├─ Exact ID match (unambiguous)
├─ Name field match (may warn if ambiguous)
├─ fs_path suffix match
└─ ID prefix/suffix match (short IDs)
```

**Ambiguity handling:** When multiple nodes match a bare name (e.g., `readme` matches both `/readme.md` and `/archive/readme.md`), km warns and returns the first match. Use paths for precision.

### Block References

Following [Obsidian's pattern](https://help.obsidian.md/links), blocks can have explicit IDs:

```markdown
This paragraph has an ID. ^my-block

- Task with reference ^task-123
```

Block IDs are:
- Added on-demand (only when first linked)
- Short strings (not UUIDs like [Logseq](https://discuss.logseq.com/t/what-are-id-links-vs-block-ids-vs-page-ids/1318))
- Used in links: `[[file#^my-block]]`

See [storage.md](storage.md) for detailed resolution behavior.

---

## Glossary

| Term            | Definition                                                              |
| --------------- | ----------------------------------------------------------------------- |
| **KNode**       | Flat record with `parent_id`. Stored in SQLite.                         |
| **TNode**       | Recursive tree with `children[]`. For navigation.                       |
| **BoardState**  | Visual state: cursor, selection, fold, zoom.                            |
| **repo root**   | Single folder node with `parent_id = null` representing the repository. |
| **memory mode** | No `.km/`. SQLite in RAM. Ephemeral IDs.                                |
| **disk mode**   | `.km/` exists. SQLite on disk. Stable IDs, events, sync.                |
| **name**        | Basename of file/folder/heading. Not unique (can repeat).               |
| **path**        | Composed of names with `/`. Unique within repo.                         |
| **collapsing**  | Merging same-named folder/file/H1 into one display line.                |
| **cursoring**   | Moving to adjacent block (hjkl).                                        |
| **navigating**  | Changing board root via zoom (u/Enter).                                 |
| **shifting**    | Moving selected nodes in direction (opt+hjkl).                          |
| **brain**       | The engine — a folder enhanced with chat processing. See [brain.md](architecture/brain.md). |
| **chat**        | A bounded sequence of events from one source (agent, edit session, sync). |
| **knowledge tree** | Human-visible content — markdown files in the node tree.             |
| **memory graph** | Agent-visible structured knowledge — SPO triples derived from chats.  |
| **item**        | A meaningful unit in the knowledge tree (note, task, contact, section). |
| **block**       | Content within an item (paragraph, code block, quote).                  |
| **solidification** | Memory graph → markdown file (knowledge becomes permanent/visible).  |
| **extraction**  | Markdown edit → memory graph update (parsing properties + NL processing). |
| **shaping**     | Triples → typed entity (deterministic projection, no LLM).               |

---

## Event System

km uses a lightweight event system for cross-layer communication and observability. Built on [nanoevents](https://github.com/ai/nanoevents) (107 bytes), it provides type-safe pub/sub with Disposable support.

### Quick Start

```typescript
import { kmEvents } from "@km/core"

// Subscribe
const unsub = kmEvents.on("parse-error", (e) => {
  console.log(`Parse error in ${e.file}:${e.line} - ${e.message}`)
})

// Emit
kmEvents.emit("parse-error", {
  file: "tasks.md",
  line: 42,
  message: "Invalid syntax",
})

// Cleanup
unsub()
```

### Event Categories

Events are organized by purpose:

| Category   | Purpose          | Consumers                |
| ---------- | ---------------- | ------------------------ |
| **User**   | UI feedback      | TUI status bar, CLI logs |
| **Debug**  | Internal tracing | debug() logger           |
| **Metric** | Performance      | Monitoring, optimization |

**User Events** - Cross-layer errors that need user feedback:

- `parse-error` - Markdown parsing failed
- `sync-error` - File sync issue
- `validation-warning` - Node validation warning

**Debug Events** - Internal diagnostics (used with `DEBUG=km:*`):

- `command-executed` - Command timing
- `action-handled` - Action result tracking

**Metric Events** - Performance monitoring:

- `repo-loaded` - Repo initialization timing
- `file-parsed` - File parsing stats

### Subscription Patterns

```typescript
// Basic subscription
const unsub = kmEvents.on("sync-error", (e) => {
  showStatus(`Sync error: ${e.path}`)
})
unsub()

// React useEffect
useEffect(() => {
  const unsub = kmEvents.on("parse-error", (e) => {
    toast.error(`Parse error in ${e.file}`)
  })
  return unsub // cleanup on unmount
}, [])

// Using keyword (TypeScript 5.2+)
function handleScope() {
  using sub = kmEvents.on("parse-error", handler)
  // auto-disposed when scope exits
}

// DisposableStore (multiple subscriptions)
const store = new DisposableStore()
store.add(kmEvents.on("parse-error", handler1))
store.add(kmEvents.on("sync-error", handler2))
store.dispose() // cleans up all
```

### DisposableStore Pattern

`DisposableStore` manages multiple `Disposable` subscriptions with a single cleanup call:

```typescript
// packages/km-core/src/events.ts
export class DisposableStore implements Disposable {
  private disposables: Disposable[] = []

  add<T extends Disposable>(d: T): T {
    this.disposables.push(d)
    return d
  }

  dispose(): void {
    this.disposables.forEach((d) => d[Symbol.dispose]())
    this.disposables = []
  }

  [Symbol.dispose](): void {
    this.dispose()
  }
}
```

**Usage pattern:**

```typescript
// Manual cleanup
const store = new DisposableStore()
store.add(kmEvents.on("parse-error", handler1))
store.add(kmEvents.on("sync-error", handler2))
// ... use store ...
store.dispose()

// Automatic cleanup with `using` keyword (TypeScript 5.2+)
async function withAutoCleanup() {
  using store = new DisposableStore()
  store.add(kmEvents.on("parse-error", handler1))
  store.add(kmEvents.on("sync-error", handler2))
  // All cleaned up automatically when scope exits
}
```

**Benefits:**

- Single disposal point for related subscriptions
- Prevents memory leaks from forgotten unsubscriptions
- Works seamlessly with TypeScript 5.2+ `using` declarations
- Commonly used in component lifecycles and service shutdown

### Adding New Events

1. **Define in KmEvents interface**:

```typescript
// packages/km-core/src/events.ts
export interface KmEvents {
  "new-event": (e: { foo: string; bar: number }) => void
}
```

2. **Emit from source layer**:

```typescript
kmEvents.emit("parse-error", { file, line, message })
```

3. **Subscribe in consumer**:

```typescript
kmEvents.on("parse-error", (e) => {
  dispatch(actions.setStatus({ level: "error", message: e.message }))
})
```

### Design Decisions

Events are **synchronous** (emit → handlers run immediately → emit returns).

**Benefits**:

- Predictable execution order
- Simple testing (no `await`)
- No race conditions

**Why nanoevents?** Smallest size (107b) with best TypeScript support. Returns unbind function directly (cleaner than `.off()`).

---

## See Also

- [architecture/brain.md](architecture/brain.md) — Brain layer: chats, memory graph, knowledge tree, solidification
- [principles.md](principles.md) — Architectural principles and philosophy
- [concepts.md](concepts.md) — Core concepts
- [storage.md](storage.md) — Storage layer, modes, sync details
