# Architecture

Package structure, layering, data flow, and architectural principles.

---

## Package Structure

```
packages/                          # Shared libraries
  @km/core       - Shared types, utilities
  @km/storage    - DBNode, SQLite, queries, events, sync
  @km/markdown   - Parser (markdown ↔ DBNode)
  @km/tree       - TNode, tree queries, display names
  @km/board      - BoardState, cursor, selection, fold

apps/
  km-cli/        → @km/cli-app     CLI commands
  km-sh/         → @km/sh-app      Shell application
  km-tui/        → @km/tui-app     TUI application
    packages/
      km-ink/    → @km/ink         React/Ink renderer
      km-opentui/→ @km/opentui     OpenTUI renderer (experimental)
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/                                                          │
│  @km/cli-app       CLI commands (km task, km view, km show)     │
│  @km/tui-app       TUI application (km view)                    │
│  @km/sh-app        Shell application (km sh)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────────┐ ┌───────────────────────────────────────┐
│  Agent Runtime      │ │  @km/board          Visual navigation │
│  (12-agents.md)     │ │  Cursor, selection, fold, zoom        │
│  Harnesses, queues  │ └───────────────────────────────────────┘
└─────────────────────┘               │
              │                       ▼
              │       ┌───────────────────────────────────────┐
              │       │  @km/tree             Tree data model │
              └──────►│  TNode, queries, display names        │
                      └───────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────┐
              │  @km/storage          (03-storage.md)         │
              │  DBNode, SQLite, events, sync                 │
              └───────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────┐
              │  @km/markdown         (05-markdown.md)        │
              │  Markdown files ↔ DBNode                      │
              └───────────────────────────────────────────────┘
```

---

## Five-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  APP LAYER (apps/)                                              │
│                                                                  │
│  @km/tui-app   TUI application (km view)                        │
│  @km/sh-app    Shell application (km sh)                        │
│  @km/cli-app   CLI commands + app launchers                     │
│                                                                  │
│  Owns: App-specific state (modals, search), rendering           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ board actions
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  BOARD LAYER (@km/board)                                        │
│                                                                  │
│  • BoardState - cursor, selection, fold, zoom, history          │
│  • boardReducer - CURSOR_*, selection, navigation               │
│  • Selectors, transformers, collapse utilities                  │
│                                                                  │
│  Owns: Visual navigation state, selection, algorithms           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ tree queries
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  TREE LAYER (@km/tree)                                          │
│                                                                  │
│  • TNode - recursive node (id, title, children[], depth)        │
│  • TPath - path-based navigation indices                        │
│  • TAction - content manipulation (add, move, delete, update)   │
│  • Queries - getNodeAtPath, getSiblings, findPathByNodeId       │
│                                                                  │
│  Owns: Tree data structure, queries (NO visual state)           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ DBNode CRUD
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  DB LAYER (@km/storage)                                         │
│                                                                  │
│  • DBNode - flat record (id, parent_id, content, etc.)          │
│  • SQLite operations, events, file sync                         │
│                                                                  │
│  Owns: Persistence, file sync, database                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │ parse/write
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  FS LAYER (filesystem)                                          │
│                                                                  │
│  • Folders - directories containing markdown files              │
│  • Files - *.md files with frontmatter, content, tasks          │
│  • @km/markdown - parser (markdown ↔ DBNode)                    │
│                                                                  │
│  Owns: Source of truth (plain markdown files)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer Model

Each layer has its own data types, state, actions, and responsibilities:

| Layer | Package      | Data Type | State        | Actions       | Responsibilities                    |
| ----- | ------------ | --------- | ------------ | ------------- | ----------------------------------- |
| App   | apps/\*      | -         | `AppState`   | `AppAction`   | Modals, dialogs, rendering          |
| Board | @km/board    | `TNode`\* | `BoardState` | `BoardAction` | Cursor, selection, fold, zoom       |
| Tree  | @km/tree     | `TNode`   | (stateless)  | `TAction`     | Tree structure, queries, transforms |
| DB    | @km/storage  | `DBNode`  | (SQLite)     | (functions)   | Persistence, events, file sync      |
| FS    | (filesystem) | File      | (filesystem) | (fs ops)      | Source of truth (markdown files)    |

\* Board layer uses `TNode` from Tree layer directly

### Data Type Transformations

```
FS → DB:      File content   → DBNode    (parse markdown, extract metadata)
DB → Tree:    DBNode[]       → TNode[]   (build recursive tree from flat records)
Tree → Board: TNode[]        → uses as-is (visual state tracks Sets, not per-node)
Board → App:  BoardState     → AppState  (combine with app-specific UI state)
```

### Type Details

| Type         | Description                                     |
| ------------ | ----------------------------------------------- |
| `File`       | Markdown file with frontmatter, content, tasks  |
| `DBNode`     | Flat record with `parent_id` (stored in SQLite) |
| `TNode`      | Recursive with `children[]` (for navigation)    |
| `TPath`      | Array of indices for path-based navigation      |
| `BoardState` | Visual state: cursor, selection, fold, zoom     |
| `AppState`   | BoardState + app-specific: modals, search       |

### Action Types

| Type          | Description                                           |
| ------------- | ----------------------------------------------------- |
| `TAction`     | Content manipulation: T_ADD_NODE, T_MOVE_NODE, etc.   |
| `BoardAction` | Navigation: CURSOR*\*, NAV*\*, SELECT\_\*, FOLD, etc. |
| `AppAction`   | App UI: TOGGLE_SEARCH_MODE, TOGGLE_HELP_MODE, etc.    |

---

## Clear Layering Principle

```
┌───────────────────────────────────────────────────────────────┐
│  App Layer              (apps/)                               │
│  • @km/tui-app, @km/sh-app, @km/cli-app                       │
│  • AppState = BoardState + AppUIState (modals, search)        │
│  • appReducer handles AppAction, delegates to boardReducer    │
└───────────────────────────────────────────────────────────────┘
                              │ AppAction → BoardAction
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Board Layer            (@km/board)                           │
│  • BoardState: cursor, selection, fold, zoom, history         │
│  • boardReducer handles BoardAction, passes TAction through   │
│  • Selectors, transformers for view models                    │
└───────────────────────────────────────────────────────────────┘
                              │ TAction → @km/storage functions
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Tree Layer             (@km/tree)                            │
│  • TNode (recursive tree structure)                           │
│  • TAction describes content intent (add, move, delete)       │
│  • Tree queries, traversal, display names                     │
└───────────────────────────────────────────────────────────────┘
                              │ DBNode CRUD
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  DB Layer               (@km/storage)                         │
│  • DBNode - flat record with parent_id                        │
│  • SQLite CRUD operations, event emission                     │
│  • Filesystem ↔ DB synchronization                            │
└───────────────────────────────────────────────────────────────┘
                              │ parse/write via @km/markdown
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  FS Layer               (filesystem)                          │
│  • Folders - directories (become parent nodes)                │
│  • Files - *.md files (become file nodes)                     │
│  • Content - frontmatter, sections, tasks, paragraphs         │
│  • Source of truth (plain markdown files)                     │
└───────────────────────────────────────────────────────────────┘
```

**Rules:**

- Each layer only calls the layer directly below it
- UI never touches filesystem directly
- Model changes MUST propagate to filesystem (bidirectional)
- Parser (@km/markdown) is stateless — pure transformation
- Visual state (fold, selection) is tracked in Sets, not per-node

---

## Bidirectional Sync

All task modifications MUST flow both directions.

### TUI → File

```
User toggles task in TUI
         │
         ▼
┌─────────────────┐
│  UI Layer       │  Calls: store.updateNode(id, {task_status: "done"})
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Model Layer    │  Updates SQLite, emits node_updated event
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Sync Layer     │  Detects change, calls writer
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Parser Layer   │  Regenerates markdown for affected node
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Filesystem     │  File updated: - [x] Task
└─────────────────┘
```

### File → TUI

```
User edits markdown file
         │
         ▼
┌─────────────────┐
│  Filesystem     │  File watcher detects change
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Sync Layer     │  Debounces, triggers re-parse
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Parser Layer   │  Parses markdown → nodes
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Model Layer    │  Diffs and updates SQLite
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  UI Layer       │  Re-renders with new state
└─────────────────┘
```

---

## Layer Responsibilities

### App Layer (apps/)

| Package     | Concern                       |
| ----------- | ----------------------------- |
| @km/cli-app | CLI commands, app launchers   |
| @km/tui-app | TUI rendering, modal state    |
| @km/sh-app  | Shell REPL, command execution |

**State:** `AppState = BoardState & AppUIState`
**Actions:** `AppAction = BoardAction | AppUIAction`
**Owns:** App-specific state (modals, search), rendering, user input handling

### Board Layer (@km/board)

| Concern            | Examples                          |
| ------------------ | --------------------------------- |
| Cursor position    | TPath = [col, card]               |
| Selection          | selectedNodes: Set<string>        |
| Visual state       | foldedNodes, collapsedNodes       |
| Navigation history | zoomStack, navHistory             |
| Spatial algorithms | getNextVisiblePath()              |
| Navigation logic   | boardReducer                      |
| Selectors          | getCurrentNode, isNodeFolded      |
| Transformers       | toNodeViewModel, toBoardViewModel |

**State:** `BoardState`
**Actions:** `BoardAction` (CURSOR*\*, NAV*\*, SELECT\_\*, FOLD, ZOOM)
**Does NOT own:** App-specific state, rendering, DBNode mutations

### Tree Layer (@km/tree)

| Concern         | Examples                      |
| --------------- | ----------------------------- |
| Tree structure  | TNode { id, title, children } |
| Path navigation | TPath = number[]              |
| Content actions | TAction (T_ADD_NODE, etc.)    |
| Tree queries    | getNodeAtPath(nodes, path)    |
| Display names   | getNodeDisplayName            |

**Data:** `TNode`, `TPath`
**Actions:** `TAction` (T_ADD_NODE, T_MOVE_NODE, T_DELETE_NODE, T_UPDATE_NODE)
**Does NOT own:** Visual state, DBNode storage

### DB Layer (@km/storage)

| Concern     | Examples                 |
| ----------- | ------------------------ |
| DBNode CRUD | getNode, updateNode      |
| Persistence | SQLite operations        |
| Events      | emit, emitNodeUpdated    |
| File sync   | Markdown ↔ DB sync       |
| Query lang  | parseQuery, executeQuery |

**Data:** `DBNode` (flat record with parent_id)
**Does NOT own:** Tree structure, navigation, rendering

### FS Layer (filesystem)

| Concern | Examples                         |
| ------- | -------------------------------- |
| Folders | Directories → parent nodes       |
| Files   | \*.md files → file nodes         |
| Content | Frontmatter, sections, tasks     |
| Parser  | @km/markdown (markdown ↔ DBNode) |

**Data:** Files and folders (plain markdown)
**Owns:** Source of truth for content

---

## Design Principles

1. **Everything is a node** — folders, files, sections, tasks, paragraphs
2. **Zero setup** — works on any markdown directory
3. **Markdown-native** — files are the source of truth
4. **Git-friendly** — plain text, mergeable
5. **Progressive enhancement** — `km init` adds persistence when needed

---

## Glossary

| Term              | Definition                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| **DBNode**        | Flat database record with `parent_id`. Stored in SQLite (@km/storage).           |
| **TNode**         | Recursive tree structure with `children[]`. For navigation (@km/tree).           |
| **BoardState**    | Visual navigation state: cursor, selection, fold (@km/board).                    |
| **fs-tree**       | Raw filesystem: folders, files, markdown content. Source of truth.               |
| **node**          | Everything is a node: folder, file, section, task, paragraph, etc.               |
| **collapsing**    | Unifying same-named folder/file/section into one display line.                   |
| **memory mode**   | No `.km/`. SQLite in RAM. Rebuilt each run. Ephemeral IDs.                       |
| **disk mode**     | `.km/` exists. SQLite on disk. Full tracking: events, history, stable IDs, sync. |
| **cursoring**     | Moving cursor to visually adjacent block (hjkl keys).                            |
| **navigating**    | Changing board root via zoom (u/Enter/Backspace/[/]).                            |
| **extend-select** | Extending selection in visual direction (shift+hjkl).                            |
| **shifting**      | Moving selected nodes in visual direction (opt+hjkl).                            |
| **moving**        | Relocating nodes to arbitrary destination (m + destination).                     |

---

## See Also

- [01-concepts.md](01-concepts.md) — Core concepts
- [03-storage.md](03-storage.md) — Storage layer details
- [04-sync.md](04-sync.md) — Bidirectional sync implementation
- [07-navigation.md](07-navigation.md) — Visual navigation model
