# TUI State Architecture

Technical specification for TUI state management.

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

## Package Structure

```
packages/                          # Shared libraries
├── km-storage/            # @km/storage - Storage layer
│   └── src/
│       ├── db.ts             # SQLite operations, DBNode CRUD
│       ├── emit.ts           # Event emission
│       ├── query/            # Query language parser + executor
│       └── watch/            # File ↔ DB sync
│
├── km-tree/               # @km/tree - Tree data model
│   └── src/
│       ├── types.ts          # TNode, TreePath
│       ├── queries.ts        # getNodeAtPath, getSiblings, etc.
│       └── display.ts        # getNodeDisplayName, normalizeName
│
├── km-board/              # @km/board - Visual board state
│   └── src/
│       ├── types.ts          # BoardState, BoardAction
│       ├── boardReducer.ts   # Navigation, selection, CURSOR_*
│       ├── selectors.ts      # getCurrentNode, isNodeFolded, etc.
│       ├── transformers.ts   # toNodeViewModel, toTreeViewModel
│       └── collapse.ts       # Collapse utilities

apps/
├── km-cli/                # @km/cli-app - CLI entry point
│   └── src/
│       ├── index.ts          # CLI commands
│       └── commands/         # Individual commands
│
├── km-tui/                # @km/tui-app - TUI application
│   ├── src/
│   │   └── index.ts          # TUI launcher
│   └── packages/
│       ├── km-ink/           # @km/ink - React/Ink renderer
│       │   └── src/
│       │       ├── App.tsx       # Main component
│       │       ├── views/        # CardsView, ListView, etc.
│       │       ├── components/   # Card, Column, TreeNode
│       │       └── icons.ts      # Status and type icons
│       └── km-opentui/       # OpenTUI renderer (experimental)
│
└── km-sh/                 # @km/sh-app - Shell application
    └── src/
        ├── index.ts          # Shell entry point
        ├── commandParser.ts  # Command parsing
        ├── shellExecutor.ts  # Shell execution
        └── commands.ts       # Command registry
```

---

## State Models

### AppState (@km/tui-app or @km/sh-app)

App-specific state (varies by application):

```typescript
// TUI App State
interface TuiAppState {
  helpOpen: boolean;
  searchOpen: boolean;
  newItem: { open: boolean; text: string };
  projectPicker: { open: boolean; query: string; index: number };
  detailPaneOpen: boolean;
  maxOutlineDepth: number;
  maxContentLines: number;
}

// Shell App State
interface ShellAppState {
  historyIndex: number;
  commandBuffer: string;
}
```

### BoardState (@km/board)

Visual navigation state (shared between TUI and shell):

```typescript
interface BoardState {
  // Current position in tree
  cursor: CursorPath;
  rootId: string | null;
  rootPath: string | null;

  // Selection
  selectedNodes: Set<string>;

  // Visual fold/collapse
  foldedNodes: Set<string>;
  collapsedNodes: Set<string>;

  // Navigation history
  zoomStack: Array<{ rootId: string | null; cursor: CursorPath }>;
  navHistory: Array<{ rootId: string | null; cursor: CursorPath }>;
  navHistoryIndex: number;

  // Filter (affects visible nodes)
  searchQuery: string;
}
```

### TNode (@km/tree)

Recursive tree node for navigation:

```typescript
interface TNode {
  nodeId: string;
  title: string;
  children: TNode[]; // Recursive children
  childCount: number;
  depth: number;

  // Task properties
  isTask: boolean;
  taskStatus?: TaskStatus;
  priority?: number;
  dueDate?: string;
  hasBacklinks?: boolean;
  refsCount?: number;
  content?: string;
  color?: string;
  icon?: string;
}

// Deprecated alias for migration
type NodeState = TNode;
```

### DBNode (@km/storage)

Flat database record:

```typescript
interface DBNode {
  id: string;
  type: NodeType;
  parent_id: string | null; // Flat structure
  parent_idx: number;
  fs_path: string | null;
  content: string | null;
  task_status: TaskStatus | null;
  // ... see km-data-model.md for full schema
}
```

### TreePath / CursorPath (@km/tree)

Variable-length path for navigation:

```typescript
type TreePath = number[];
type CursorPath = TreePath;

// Examples:
[0][(0, 2)][(0, 2, 1)]; // First top-level node // Column 0, card 2 // Column 0, card 2, subcard 1
```

---

## Actions

### BoardAction (@km/board)

See [km-board-navigation.md](km-board-navigation.md) for terminology and behavior.

```typescript
type BoardAction =
  // Cursor-select (cursoring) - visual navigation (hjkl)
  | { type: "CURSOR_UP" } // previous visible block above
  | { type: "CURSOR_DOWN" } // next visible block below
  | { type: "CURSOR_LEFT" } // cross-column left
  | { type: "CURSOR_RIGHT" } // cross-column right

  // Structural navigation (internal use)
  | { type: "NAV_PREV_SIBLING" }
  | { type: "NAV_NEXT_SIBLING" }
  | { type: "NAV_PARENT" }
  | { type: "NAV_CHILD" }
  | { type: "NAV_TO_PATH"; path: CursorPath }
  | { type: "NAV_FIRST_SIBLING" }
  | { type: "NAV_LAST_SIBLING" }
  | { type: "NAV_CROSS_COLUMN"; direction: "left" | "right" }

  // Selection
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "SELECT_ALL_SIBLINGS" }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_SELECTION" }

  // Extend-select (shift+hjkl) - add to selection while cursoring
  | { type: "EXTEND_SELECT_UP" }
  | { type: "EXTEND_SELECT_DOWN" }
  | { type: "EXTEND_SELECT_LEFT" }
  | { type: "EXTEND_SELECT_RIGHT" }

  // Shifting (opt+hjkl) - move nodes in visual direction
  | { type: "SHIFT_UP" }
  | { type: "SHIFT_DOWN" }
  | { type: "SHIFT_LEFT" }
  | { type: "SHIFT_RIGHT" }

  // Fold/Collapse
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  | { type: "FOLD_LEVEL"; depth: number }
  | { type: "UNFOLD_LEVEL"; depth: number }

  // Filter
  | { type: "SET_SEARCH_QUERY"; query: string }

  // Navigating (zoom/root change)
  | { type: "ZOOM_IN"; nodeId: string; nodes: NodeState[] }
  | { type: "ZOOM_OUT"; nodes: NodeState[] }
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | {
      type: "NAV_TO";
      rootId: string | null;
      nodes: NodeState[];
      rootPath: string | null;
    };
```

### AppAction (@km/tui)

```typescript
type AppAction =
  // Modals
  | { type: "TOGGLE_HELP" }
  | { type: "TOGGLE_SEARCH" }
  | { type: "TOGGLE_NEW_ITEM" }
  | { type: "SET_NEW_ITEM_TEXT"; text: string }
  | { type: "TOGGLE_PROJECT_PICKER" }
  | { type: "SET_PICKER_QUERY"; query: string }
  | { type: "PICKER_UP" }
  | { type: "PICKER_DOWN"; maxIndex: number }
  | { type: "CLOSE_PROJECT_PICKER" }
  | { type: "TOGGLE_DETAIL_PANE" }
  // View config
  | { type: "INCREASE_OUTLINE_DEPTH" }
  | { type: "DECREASE_OUTLINE_DEPTH" }
  | { type: "INCREASE_CONTENT_LINES" }
  | { type: "DECREASE_CONTENT_LINES" };
```

---

## Reducer Signature

The board reducer receives nodes from the node layer:

```typescript
function boardReducer(
  state: BoardState,
  action: BoardAction,
  nodes: NodeState[], // from node layer
): BoardState {
  switch (action.type) {
    case "NAV_NEXT_SIBLING": {
      const siblingCount = getSiblingCount(nodes, state.cursor);
      // ...
    }
  }
}
```

The node reducer handles structural mutations:

```typescript
function nodeReducer(nodes: NodeState[], action: NodeAction): NodeState[] {
  switch (action.type) {
    case "ADD_NODE": {
      /* ... */
    }
    case "REMOVE_NODE": {
      /* ... */
    }
    case "MOVE_NODE": {
      /* ... */
    }
    case "UPDATE_NODE": {
      /* ... */
    }
  }
}
```

---

## View Level Configuration

Views declare how they interpret tree levels:

```typescript
interface ViewLevelConfig {
  columnLevel: number;
  itemLevel: number;
  maxInlineDepth: number;
  flattenAll: boolean;
}
```

### Presets

| View Mode | columnLevel | itemLevel | maxInlineDepth | flattenAll |
| --------- | ----------- | --------- | -------------- | ---------- |
| `cards`   | 0           | 1         | 1              | false      |
| `list`    | 0           | 1         | 99             | true       |
| `columns` | 0           | 1         | 2              | false      |
| `tabs`    | 0           | 1         | 1              | false      |

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
| Navigation logic   | boardReducer                 |
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

## See Also

- [km-board-navigation.md](km-board-navigation.md) — Visual cursor, selection, shifting model
- [km-design-system.md](km-design-system.md) — Visual styling rules
- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout and keybindings
- [README.md](README.md) — Architecture overview
