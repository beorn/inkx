# TUI State Architecture

Technical specification for TUI state management across three packages.

---

## Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  APP LAYER (@km/tui)                                            │
│                                                                  │
│  • App.tsx - key handling, view orchestration                   │
│  • appState - modal state (helpOpen, searchOpen, pickerIndex)   │
│  • Views - pure rendering (CardsView, ListView, etc.)           │
│  • Height callbacks for spatial algorithms                      │
│                                                                  │
│  Owns: Modal state, view config, rendering, key mapping         │
└───────────────────────────────┬─────────────────────────────────┘
                                │ tree actions
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  TREE LAYER (@km/tui)                                           │
│                                                                  │
│  • treeReducer - cursor, selection, fold, zoom, navHistory      │
│  • spatialNav - cross-column algorithm (with height callback)   │
│  • types - TreeState, TreeAction, CursorPath                    │
│                                                                  │
│  Owns: Visual navigation state, selection, spatial algorithms   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ node queries
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  NODE LAYER (@km/tree)                                          │
│                                                                  │
│  • TreeNodeState - node structure (id, title, children, etc.)   │
│  • Node queries - getNodeAtPath, getChildren, search/filter     │
│  • Node transforms - flatten, filter, sort                      │
│                                                                  │
│  Owns: Node data structure, queries, transformations            │
└───────────────────────────────┬─────────────────────────────────┘
                                │ node CRUD
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  STORAGE LAYER (@km/storage)                                    │
│                                                                  │
│  Owns: Persistence, file sync, database                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
packages/
├── tui/                   # @km/tui
│   ├── src/
│   │   ├── App.tsx           # Main component, key handling
│   │   ├── appState.ts       # AppState, AppAction, appReducer
│   │   ├── types.ts          # TreeState, TreeAction
│   │   ├── treeReducer.ts    # Navigation, selection
│   │   ├── spatialNav.ts     # Cross-column algorithms
│   │   ├── views/            # CardsView, ListView, etc.
│   │   └── components/       # Card, Column, etc.
│   └── tests/
│
├── tree/                  # @km/tree
│   ├── src/
│   │   ├── types.ts          # Node, TreeNodeState
│   │   ├── queries.ts        # getNodeAtPath, filter, flatten
│   │   └── transforms.ts     # Node ↔ TreeNodeState conversion
│   └── tests/
│
└── storage/               # @km/storage
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

### TreeState (@km/tui)

Navigation and selection state:

```typescript
interface TreeState {
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

### TreeNodeState (@km/tree)

Unified node for any tree level:

```typescript
interface TreeNodeState {
  nodeId: string;
  title: string;
  children: TreeNodeState[];
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

### CursorPath

Variable-length path for navigation:

```typescript
type CursorPath = number[];

// Examples:
[0]        // First top-level node (column level)
[0, 2]     // Column 0, card 2
[0, 2, 1]  // Column 0, card 2, subcard 1
[1, 0, 0, 3]  // Arbitrary depth navigation
```

---

## Actions

### TreeAction (@km/tui)

```typescript
type TreeAction =
  // Navigation
  | { type: "NAV_PREV_SIBLING" }
  | { type: "NAV_NEXT_SIBLING" }
  | { type: "NAV_PARENT" }
  | { type: "NAV_CHILD" }
  | { type: "NAV_TO_PATH"; path: CursorPath }
  | { type: "NAV_FIRST_SIBLING" }
  | { type: "NAV_LAST_SIBLING" }
  // Selection
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "SELECT_ALL_SIBLINGS" }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_SELECTION" }
  // Fold/Collapse
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  // Filter
  | { type: "SET_SEARCH_QUERY"; query: string }
  // Zoom
  | { type: "ZOOM_IN"; nodeId: string }
  | { type: "ZOOM_OUT" }
  // History
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | { type: "SET_ROOT"; rootId: string | null; rootPath: string | null };
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

The tree reducer receives nodes from the tree layer:

```typescript
function treeReducer(
  state: TreeState,
  action: TreeAction,
  nodes: TreeNodeState[],  // from tree layer
): TreeState {
  switch (action.type) {
    case "NAV_NEXT_SIBLING": {
      const siblingCount = getSiblingCount(nodes, state.cursor);
      // ...
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

### App Layer (@km/tui)

| Concern | Examples |
|---------|----------|
| Modal state | helpOpen, searchOpen, newItemText |
| View config | maxOutlineDepth, maxContentLines |
| Key handling | Map keys → tree actions |
| Height calculation | getCardHeight(node) => 3 or 4 |
| Rendering | React components |

**Does NOT own:** Cursor, selection, tree structure

### Tree Layer (@km/tui)

| Concern | Examples |
|---------|----------|
| Cursor position | CursorPath = [col, card] |
| Selection | selectedNodes: Set<string> |
| Visual state | foldedNodes, collapsedNodes |
| Navigation history | zoomStack, navHistory |
| Spatial algorithms | calculateCrossColumnPath() |

**Does NOT own:** Modal state, rendering, node content

### Node Layer (@km/tree)

| Concern | Examples |
|---------|----------|
| Node structure | TreeNodeState { id, title, children } |
| Node queries | getNodeAtPath(nodes, path) |
| Node transforms | filter(nodes, query), flatten(nodes) |

**Does NOT own:** Cursor position, selection, visual state

---

## See Also

- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout and keybindings
- [km-design-system.md](km-design-system.md) — Visual styling rules
- [README.md](README.md) — Architecture overview
