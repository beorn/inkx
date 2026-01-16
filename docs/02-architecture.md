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

## Four-Layer Architecture

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
│  BOARD LAYER (@km/board)                                     │
│                                                                  │
│  • BoardState - cursor, selection, fold, zoom, history          │
│  • treeReducer - CURSOR_*, selection, navigation                │
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
│  • TreePath - path-based navigation                             │
│  • Queries - getNodeAtPath, getSiblings, findPathByNodeId       │
│  • Display names - getNodeDisplayName, normalizeName            │
│                                                                  │
│  Owns: Tree data structure, queries (NO visual state)           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ DBNode CRUD
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  STORAGE LAYER (@km/storage)                                    │
│                                                                  │
│  • DBNode - flat record (id, parent_id, content, etc.)          │
│  • SQLite operations, events, file sync                         │
│                                                                  │
│  Owns: Persistence, file sync, database                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Type Hierarchy

| Layer | Type         | Description                                     |
| ----- | ------------ | ----------------------------------------------- |
| DB    | `DBNode`     | Flat record with `parent_id` (stored in SQLite) |
| Tree  | `TNode`      | Recursive with `children[]` (for navigation)    |
| Board | `BoardState` | Visual state: cursor, selection, fold           |
| App   | `AppState`   | App-specific: modals, search, view mode         |

---

## Clear Layering Principle

```
┌───────────────────────────────────────────────────────────────┐
│  App Layer              (apps/)                               │
│  • @km/tui-app, @km/sh-app, @km/cli-app                       │
│  • App-specific state (modals, search)                        │
│  • User input → actions                                       │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Board Layer            (@km/board)                        │
│  • Visual navigation state                                    │
│  • Cursor, selection, fold, zoom                              │
│  • Returns BoardState                                         │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Tree Layer             (@km/tree)                            │
│  • TNode (recursive tree structure)                           │
│  • Tree queries, traversal                                    │
│  • Display name computation                                   │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Storage Layer          (@km/storage)                         │
│  • DBNode CRUD operations                                     │
│  • Event emission (disk mode)                                 │
│  • Filesystem ↔ DB synchronization                            │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Parser Layer           (@km/markdown)                        │
│  • Markdown → AST → DBNode                                    │
│  • DBNode → Markdown                                          │
│  • Extracts: frontmatter, tasks, refs, fields                 │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Filesystem             (plain markdown files)                │
│  • Source of truth in memory mode                             │
│  • Synchronized with model in disk mode                       │
└───────────────────────────────────────────────────────────────┘
```

**Rules:**

- Each layer only calls the layer directly below it
- UI never touches filesystem directly
- Model changes MUST propagate to filesystem (bidirectional)
- Parser is stateless — pure transformation

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

**Owns:** App-specific state, rendering, user input handling

### Board Layer (@km/board)

| Concern            | Examples                     |
| ------------------ | ---------------------------- |
| Cursor position    | CursorPath = [col, card]     |
| Selection          | selectedNodes: Set<string>   |
| Visual state       | foldedNodes, collapsedNodes  |
| Navigation history | zoomStack, navHistory        |
| Spatial algorithms | calculateCrossColumnPath()   |
| Navigation logic   | treeReducer                  |
| Selectors          | getCurrentNode, isNodeFolded |
| Transformers       | toNodeViewModel              |
| Collapse utils     | collapseRedundantAncestors   |

**Does NOT own:** App-specific state, rendering, DBNode mutations

### Tree Layer (@km/tree)

| Concern         | Examples                      |
| --------------- | ----------------------------- |
| Tree structure  | TNode { id, title, children } |
| Tree queries    | getNodeAtPath(nodes, path)    |
| Tree transforms | filter, flatten               |
| Display names   | getNodeDisplayName            |

**Does NOT own:** Visual state, DBNode storage

### Storage Layer (@km/storage)

| Concern     | Examples                 |
| ----------- | ------------------------ |
| DBNode CRUD | getNode, updateNode      |
| Persistence | SQLite operations        |
| Events      | emit, emitNodeUpdated    |
| File sync   | Markdown ↔ DB sync       |
| Query lang  | parseQuery, executeQuery |

**Does NOT own:** Tree structure, navigation, rendering

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
