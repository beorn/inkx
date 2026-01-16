# TUI State Architecture

Technical specification for TUI state management across three packages.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ENTRY POINT (apps/km-cli)                                      │
│                                                                  │
│  • view command - imports @km/tui                               │
│  • sh command - imports @km/tui-core for shell                  │
│                                                                  │
│  Owns: CLI integration                                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │ uses
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  TUI LAYER (@km/tui)                                            │
│                                                                  │
│  • App.tsx - main component, key handling                       │
│  • views/ - CardsView, ListView, ColumnsView, etc.              │
│  • components/ - Card, Column, TreeNode, etc.                   │
│                                                                  │
│  Owns: Modal state, view config, rendering, design system       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ board actions
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  BOARD LAYER (@km/board)                                        │
│                                                                  │
│  • BoardState - cursor, selection, fold, zoom, history          │
│  • boardReducer - CURSOR_*, selection, navigation               │
│  • Visual navigation algorithms                                 │
│                                                                  │
│  Owns: Visual navigation state, selection, algorithms           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ tree queries
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  TREE LAYER (@km/tree)                                          │
│                                                                  │
│  • TreeNode - node structure (id, title, children, etc.)        │
│  • TreePath - path-based navigation                             │
│  • Queries - getNodeAtPath, getSiblings, findPathByNodeId       │
│                                                                  │
│  Owns: Tree data structure, queries (NO visual state)           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ node CRUD
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  STORAGE LAYER (@km/store)                                      │
│                                                                  │
│  Owns: Persistence, file sync, database                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
apps/
└── km-cli/
    └── src/
        ├── tui2/tui2.tsx        # Entry point - imports @km/tui
        └── commands/sh.ts       # Shell - imports @km/tui-core

packages/
├── km-tui/                # @km/tui - TUI layer (app + rendering)
│   ├── src/
│   │   ├── App.tsx           # Main component, key handling
│   │   ├── views/            # View components
│   │   │   ├── CardsView.tsx
│   │   │   ├── ListView.tsx
│   │   │   └── ColumnsView.tsx
│   │   └── components/       # UI components
│   │       ├── Card.tsx
│   │       ├── Column.tsx
│   │       └── TreeNode.tsx
│   └── tests/
│
├── km-board/              # @km/board - Visual board state
│   ├── src/
│   │   ├── types.ts          # BoardState, BoardAction, CursorPath
│   │   ├── boardReducer.ts   # Navigation, selection, CURSOR_*
│   │   └── index.ts          # Re-exports
│   └── package.json
│
├── km-tree/               # @km/tree - Tree data model
│   ├── src/
│   │   ├── types.ts          # TreeNode, TreePath
│   │   ├── queries.ts        # getNodeAtPath, getSiblings, etc.
│   │   └── index.ts          # Re-exports
│   └── package.json
│
├── km-tui-core/           # @km/tui-core - Shell and CLI support
│   ├── src/                  # (pending consolidation)
│   │   ├── commandParser.ts  # Command parsing
│   │   ├── shellExecutor.ts  # Shell execution
│   │   └── treeReducer.ts    # (duplicate - to be removed)
│   └── tests/
│
└── km-store/              # @km/store - Storage layer
    ├── src/
    │   ├── db.ts             # SQLite operations
    │   └── sync.ts           # File ↔ DB sync
    └── tests/
```

---

## State Models

### AppState (@km/tui)

Modal and view configuration state:

```typescript
interface AppState {
  helpOpen: boolean;
  searchOpen: boolean;
  newItem: { open: boolean; text: string };
  projectPicker: { open: boolean; query: string; index: number };
  detailPaneOpen: boolean;
  maxOutlineDepth: number;
  maxContentLines: number;
}
```

### BoardState (@km/board)

Navigation and selection state:

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

### TreeNode (@km/tree)

Unified node for any tree level (aliased as NodeState for compatibility):

```typescript
interface NodeState {
  nodeId: string;
  title: string;
  children: NodeState[];
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
```

### TreePath / CursorPath (@km/tree)

Variable-length path for navigation:

```typescript
type CursorPath = number[];

// Examples:
[0][(0, 2)][(0, 2, 1)][(1, 0, 0, 3)]; // First top-level node (column level) // Column 0, card 2 // Column 0, card 2, subcard 1 // Arbitrary depth navigation
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

### Entry Point (apps/km-cli/view)

Thin wiring - imports and renders @km/tui.

### TUI Layer (@km/tui)

| Concern            | Examples                          |
| ------------------ | --------------------------------- |
| Modal state        | helpOpen, searchOpen, newItemText |
| View config        | maxOutlineDepth, maxContentLines  |
| Key handling       | Map keys → board actions          |
| Height calculation | getCardHeight(node) => 3 or 4     |
| React components   | Card, Column, TreeNode            |
| Views              | CardsView, ListView, ColumnsView  |
| Visual styling     | Colors, layout, design system     |

**Does NOT own:** Cursor, selection, node structure

### Model Layer (@km/core)

Two internal sub-layers with clear separation:

**Board Layer (@km/core/board):**

| Concern            | Examples                    |
| ------------------ | --------------------------- |
| Cursor position    | CursorPath = [col, card]    |
| Selection          | selectedNodes: Set<string>  |
| Visual state       | foldedNodes, collapsedNodes |
| Navigation history | zoomStack, navHistory       |
| Spatial algorithms | calculateCrossColumnPath()  |
| Navigation logic   | boardReducer                |

**Does NOT own:** Modal state, rendering, node mutations

**Node Layer (@km/core/node):**

| Concern         | Examples                      |
| --------------- | ----------------------------- |
| Node structure  | NodeState { id, title, ... }  |
| Node queries    | getNodeAtPath(nodes, path)    |
| Node transforms | filter(nodes, query), flatten |
| Node mutations  | nodeReducer                   |

**Does NOT own:** Cursor position, selection, visual state

### Storage Layer (@km/storage)

| Concern     | Examples           |
| ----------- | ------------------ |
| Persistence | SQLite operations  |
| File sync   | Markdown ↔ DB sync |

**Does NOT own:** Node structure, navigation, rendering

---

## See Also

- [km-board-navigation.md](km-board-navigation.md) — Visual cursor, selection, shifting model
- [km-design-system.md](km-design-system.md) — Visual styling rules
- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout and keybindings
- [README.md](README.md) — Architecture overview
