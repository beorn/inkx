# Architecture

km is a **PIM/PKM engine** that turns markdown files into a semantic tree. This document covers the five-layer architecture, data flow, and event system.

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

## Data Types

```
FS → Storage:    File content  → KNode     (parse markdown)
Storage → Tree:  KNode[]       → TNode[] (build recursive tree)
Tree → Board:    TNode[]    → (used as-is, visual state in Sets)
Board → App:     BoardState    → AppState  (add modals, search)
```

| Type         | Package   | Description                            |
| ------------ | --------- | -------------------------------------- |
| `KNode`      | @km/core  | Flat record with `parent_id` (SQLite)  |
| `TNode`      | @km/core  | Recursive with `children[]`            |
| `TPath`      | @km/tree  | Array of indices `[col, row, ...]`     |
| `BoardState` | @km/board | cursor, selection, fold, zoom, history |
| `AppState`   | apps/     | BoardState + modals, search, etc.      |

| Action Type   | Package   | Examples                          |
| ------------- | --------- | --------------------------------- |
| `TAction`     | @km/tree  | T_ADD_NODE, T_MOVE_NODE, T_DELETE |
| `BoardAction` | @km/board | CURSOR*\*, SELECT*\*, FOLD, ZOOM  |
| `AppAction`   | apps/     | TOGGLE_SEARCH, TOGGLE_HELP        |

---

## Idealized Command/Data Flow

All user actions should flow through the same pattern:

```
User Input (key, click, or command palette)
    ↓
Command Registry (maps input → command name)
    ↓
Action Creator (command → typed action)
    ↓
dispatch(action)
    ↓
Reducer Chain (App → Board)
    ↓
Effect Layer (handles side effects)
    ↓
Storage (SQLite + file sync)
    ↓
Re-render
```

### Command System

Commands are named operations that can be triggered from multiple sources:

| Source          | Example                       | Resolution                    |
| --------------- | ----------------------------- | ----------------------------- |
| Keyboard        | `x`                           | keymap → `toggle_task_status` |
| Command palette | `Cmd+Shift+P` → "Toggle Task" | search → `toggle_task_status` |
| CLI             | `km status <id> done`         | parser → `toggle_task_status` |

The command registry maps all inputs to the same command names, which then create typed actions:

```typescript
// Command registry (shared across apps)
const commands = {
  // Toggle logic lives in the command, action is idempotent
  toggle_task_done: (ctx) => ({
    type: "UPDATE_NODE",
    nodeId: ctx.currentNode.id,
    updates: {
      task_status: ctx.currentNode.taskStatus === "done" ? "todo" : "done",
    },
  }),
  // Direct set commands are also available (idempotent)
  set_task_done: (ctx) => ({
    type: "UPDATE_NODE",
    nodeId: ctx.currentNode.id,
    updates: { task_status: "done" },
  }),
  cursor_down: () => ({ type: "CURSOR_MOVE", dir: "down" }),
  cursor_up: () => ({ type: "CURSOR_MOVE", dir: "up" }),
  // ...
};
```

**Idempotency principle:** Actions at the reducer/storage level should be idempotent (set to a value, not toggle). Toggle logic belongs in commands, which read current state and compute the target value.

This enables:

- **Discoverability**: Command palette shows all available commands
- **Customization**: Users can rebind keys to any command
- **Consistency**: Same command works from keyboard, palette, or CLI

### Action Types and Boundaries

| Action Type   | State Owner | Side Effects              |
| ------------- | ----------- | ------------------------- |
| `BoardAction` | BoardState  | None (pure)               |
| `AppUIAction` | AppUIState  | None (pure)               |
| `TAction`     | Storage     | storage.updateNode() etc. |

**Key principle:** Reducers are pure. Side effects (storage calls) happen in an effect layer that observes dispatched actions.

### Why This Matters

- **Undo/redo**: All actions tracked in history
- **Testability**: Pure reducers are easy to test
- **Consistency**: One pattern for navigation AND mutations
- **Multi-window**: Actions can be broadcast to sync state

---

## Concrete Data Flow

### User Marks Task Done (TUI → File)

**Idealized flow** (target architecture):

```
1. Input      User presses `x`
2. Handler    Creates UPDATE_NODE action with {task_status: "done"}
3. dispatch   Action flows through reducer chain
4. Effect     Effect layer detects TAction, calls storage.updateNode()
5. Storage    Updates SQLite + syncs to filesystem
6. File       "- [x] Task" written to markdown
7. App        refreshTree() → dispatch(REFRESH) → re-render
```

**Current implementation note:** Data mutations (`x`, `d`, `tab`) currently call storage directly from the keyboard handler, bypassing the reducer chain. Navigation actions (`j`, `k`, `h`, `l`) correctly dispatch through reducers. A refactoring effort is planned to unify these patterns.

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

- [01-concepts.md](01-concepts.md) — Core concepts
- [03-storage.md](03-storage.md) — Storage layer, modes, sync details
