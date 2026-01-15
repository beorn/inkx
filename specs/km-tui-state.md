# TUI State Architecture

Technical specification for `km-tui-core` state management.

---

## Overview

The TUI uses a generic tree-based state model that supports:

1. **Arbitrary depth navigation** — Path-based cursor instead of fixed 2D
2. **Configurable view rendering** — Views interpret tree levels differently

---

## State Models

### TreeState (Generic)

The primary state model supporting arbitrary depth:

```typescript
interface TreeState {
  // Root context
  rootId: string | null; // Current view root (null = vault root)
  rootPath: string | null; // Filesystem path for breadcrumb

  // Tree data
  nodes: TreeNodeState[]; // Top-level nodes at current root

  // Path-based navigation
  cursor: CursorPath; // e.g., [2, 0, 3] = node 2, child 0, grandchild 3

  // UI state
  selectedNodes: Set<string>; // Multi-select by node ID
  foldedNodes: Set<string>; // Collapsed cards
  collapsedNodes: Set<string>; // Collapsed columns

  // Zoom history
  zoomStack: Array<{ rootId: string | null; cursor: CursorPath }>;

  // ... modals, search, etc.
}
```

### TreeNodeState

Unified node for any tree level:

```typescript
interface TreeNodeState {
  nodeId: string;
  title: string;
  children: TreeNodeState[]; // Recursive, can be lazy-loaded
  childCount: number; // Total children (may > children.length)
  depth: number; // Distance from current view root

  // Task properties
  isTask: boolean;
  taskStatus?: TaskStatus;
  priority?: number;
  dueDate?: string;
  // ...
}
```

### CursorPath

Variable-length path replacing fixed `(colIndex, cardIndex)`:

```typescript
type CursorPath = number[];

// Examples:
[0][(0, 2)][(0, 2, 1)][(1, 0, 0, 3)]; // First top-level node (column) // Column 0, card 2 // Column 0, card 2, subcard 1 // Arbitrary depth navigation
```

---

## Navigation Actions

### Path-Based (New)

| Action             | Effect                           |
| ------------------ | -------------------------------- |
| `NAV_PREV_SIBLING` | Decrement last path index        |
| `NAV_NEXT_SIBLING` | Increment last path index        |
| `NAV_PARENT`       | Remove last path element (go up) |
| `NAV_CHILD`        | Append `0` to path (drill down)  |
| `NAV_TO_PATH`      | Jump to specific path            |

### Legacy (Mapped)

Legacy actions are mapped to path-based equivalents:

| Legacy       | Maps To                     | Notes                |
| ------------ | --------------------------- | -------------------- |
| `MOVE_UP`    | `NAV_PREV_SIBLING`          | Move within siblings |
| `MOVE_DOWN`  | `NAV_NEXT_SIBLING`          | Move within siblings |
| `MOVE_LEFT`  | `NAV_PARENT` or prev column | Context-dependent    |
| `MOVE_RIGHT` | `NAV_CHILD` or next column  | Context-dependent    |

---

## View Level Configuration

Views declare how they interpret tree levels:

```typescript
interface ViewLevelConfig {
  columnLevel: number; // Which depth = horizontal groups
  itemLevel: number; // Which depth = vertical items
  maxInlineDepth: number; // Max depth before requiring drill-down
  flattenAll: boolean; // Flatten all levels (ListView)
}
```

### Presets

| View Mode | columnLevel | itemLevel | maxInlineDepth | flattenAll |
| --------- | ----------- | --------- | -------------- | ---------- |
| `cards`   | 0           | 1         | 1              | false      |
| `list`    | 0           | 1         | 99             | true       |
| `columns` | 0           | 1         | 2              | false      |
| `tabs`    | 0           | 1         | 1              | false      |

**Example: CardsView**

```
depth 0 = columns (horizontal layout)
depth 1 = cards (vertical list in each column)
depth 2+ = hidden (requires zoom to view)
```

**Example: ListView**

```
All depths flattened with indentation
depth 0 = no indent
depth 1 = 2 spaces indent
depth 2 = 4 spaces indent
...
```

---

## Package Structure

```
packages/km-tui-core/
├── src/
│   ├── types.ts          # All type definitions (TreeState, TreeNodeState)
│   ├── treeReducer.ts    # Path-based reducer
│   ├── transformers.ts   # State → ViewModel
│   ├── selectors.ts      # State queries
│   └── index.ts          # Public exports
└── tests/
    ├── treeReducer.test.ts
    └── transformers.test.ts
```

---

## See Also

- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout and keybindings
- [km-design-system.md](km-design-system.md) — Visual styling rules
- [README.md](README.md) — Architecture overview
