# Navigation

Visual board navigation model: cursor movement, selection, and node manipulation.

---

## Overview

This spec defines how cursor movement, selection, and node manipulation work visually across all UIs (TUI, web, etc.).

---

## Terminology

### Movement & Manipulation

| Term           | Meaning                                     | Keys                      |
| -------------- | ------------------------------------------- | ------------------------- |
| **Navigating** | Changing board root (zoom)                  | `u` / `Enter` / `[` / `]` |
| **Shifting**   | Moving selected node(s) in visual direction | `⌥+hjkl` or `⌥+arrows`    |
| **Moving**     | Moving node(s) from anywhere to anywhere    | `m` + destination         |

### Selection Methods

| Method                        | Meaning                                       | Input                           |
| ----------------------------- | --------------------------------------------- | ------------------------------- |
| **cursor-select** (cursoring) | Set cursor to single node in visual direction | `h j k l` or arrows             |
| **extend-select**             | Extend selection in visual direction          | `⇧+hjkl` or `⇧+arrows`          |
| **click-select**              | Set cursor via pointer device                 | mouse click                     |
| **drag-select**               | Select range via pointer device               | mouse drag                      |
| **command-select**            | Select via command palette/action             | `A` (select all siblings), etc. |

**Notes:**

- Selection operates in two modes: **node-selection** or **text-selection**
  - These modes work similarly but are distinct
  - This spec focuses on **node-selection mode**
- Most selection methods can **augment** (add to) or **reduce** (remove from) existing selection
- **multi-select** = any result with multiple nodes selected

---

## Visual Model: Full-Width Blocks

Every navigable element is a **bordered block** (full-width within its container):

```
┌─────────────────────────────────────┐
│ Board Title                         │  ← Board block
└─────────────────────────────────────┘
┌───────────────┐ ┌───────────────────┐
│ Column 1      │ │ Column 2          │  ← Column blocks
├───────────────┤ ├───────────────────┤
│ ┌───────────┐ │ │ ┌───────────────┐ │
│ │ Card A    │←───→│ Card C        │ │  ← Card blocks
│ │  ┌──────┐ │ │ │ └───────────────┘ │
│ │  │item 1│ │ │ │ ┌───────────────┐ │  ← Section/item blocks
│ │  ├──────┤ │ │ │ │ Card D        │ │
│ │  │item 2│ │ │ │ └───────────────┘ │
│ │  └──────┘ │ │ │                   │
│ └───────────┘ │ │                   │
│ ┌───────────┐ │ │                   │
│ │ Card B    │ │ │                   │
│ └───────────┘ │ │                   │
└───────────────┘ └───────────────────┘
```

**Key principles:**

- All blocks are **full-width** within their container (not inline spans)
- Sections and sub-items within cards also have blocks
- Card cross-column matching uses **title y-center** (not whole card center)

---

## Cursor-Select / Cursoring (h j k l / arrows)

**Cursoring moves to the visually adjacent block** - this may traverse tree structure arbitrarily (e.g., from a node to its prev sibling's great-grandchild if that's what's visually above).

### j/↓ (down) - Next visible block below

Navigate to whatever block is visually below the current one:

- May enter a child block
- May go to next sibling
- May exit to parent and continue to next sibling
- Follows **visual order**, not tree structure

### k/↑ (up) - Previous visible block above

Navigate to whatever block is visually above the current one:

- May go to previous sibling's last visible descendant
- May exit to parent
- Follows **visual order**, not tree structure

### h/l (left/right) - Between columns

| From         | h (left)                                    | l (right)                                   |
| ------------ | ------------------------------------------- | ------------------------------------------- |
| Board        | no-op                                       | no-op                                       |
| Column       | prev column                                 | next column                                 |
| Card         | prev column, closest card by title y-center | next column, closest card by title y-center |
| Item in card | exit to card, then h/l                      | exit to card, then h/l                      |

**Cross-column matching**: Use card **title y-center** for finding the closest card. Empty column → land on column header.

---

## Navigating (u / Enter / [ / ])

| Key         | Action                    |
| ----------- | ------------------------- |
| `u`         | Zoom out (root → parent)  |
| `Enter`/`o` | Zoom in (root → selected) |
| `[`         | History back              |
| `]`         | History forward           |

---

## Extend-Select (⇧+hjkl / ⇧+arrows)

Extend selection in visual direction (like text selection):

| Key       | Action                                |
| --------- | ------------------------------------- |
| `⇧j`/`⇧↓` | Extend selection down                 |
| `⇧k`/`⇧↑` | Extend selection up                   |
| `⇧h`/`⇧←` | Extend selection left (cross-column)  |
| `⇧l`/`⇧→` | Extend selection right (cross-column) |

---

## Shifting (⌥+hjkl / ⌥+arrows)

Move selected node(s) in visual direction:

| Key       | Action                               |
| --------- | ------------------------------------ |
| `⌥j`/`⌥↓` | Move down (swap with next sibling)   |
| `⌥k`/`⌥↑` | Move up (swap with previous sibling) |
| `⌥h`/`⌥←` | Move to previous column (or outdent) |
| `⌥l`/`⌥→` | Move to next column (or indent)      |

---

## Moving (m + destination)

Move selected node(s) to arbitrary location via cursor-based targeting:

| Key      | Action                                     |
| -------- | ------------------------------------------ |
| `m`      | Enter move mode with selected node(s)      |
| `hjkl`   | Navigate to destination (normal cursoring) |
| `Enter`  | Confirm move to current cursor position    |
| `Escape` | Cancel move mode, restore original cursor  |

**Flow:**

1. Select node(s) to move (or current cursor node if none selected)
2. Press `m` to enter move mode
3. Navigate with `hjkl` to destination
4. Press `Enter` to move node(s) after the cursor position
5. Or press `Escape` to cancel

---

## Navigation Rules

1. **Only visible** items navigable (folded = hidden)
2. **No column wrap** - j/k stay within column
3. **h/l from outline** - exits to card first
4. **Empty column** - h/l lands on column
5. **Title center matching** - cross-column uses card title y-center

---

## State Models

### BoardState

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

### CursorPath

Variable-length path for navigation:

```typescript
type TreePath = number[];
type CursorPath = TreePath;

// Examples:
[0][(0, 2)][(0, 2, 1)]; // First top-level node // Column 0, card 2 // Column 0, card 2, subcard 1
```

---

## Actions

### BoardAction

```typescript
type BoardAction =
  // Cursor-select (cursoring) - visual navigation (hjkl)
  | { type: "CURSOR_UP" }
  | { type: "CURSOR_DOWN" }
  | { type: "CURSOR_LEFT" }
  | { type: "CURSOR_RIGHT" }

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

  // Extend-select (shift+hjkl)
  | { type: "EXTEND_SELECT_UP" }
  | { type: "EXTEND_SELECT_DOWN" }
  | { type: "EXTEND_SELECT_LEFT" }
  | { type: "EXTEND_SELECT_RIGHT" }

  // Shifting (opt+hjkl)
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
  | { type: "ZOOM_IN"; nodeId: string; nodes: TNode[] }
  | { type: "ZOOM_OUT"; nodes: TNode[] }
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | {
      type: "NAV_TO";
      rootId: string | null;
      nodes: TNode[];
      rootPath: string | null;
    };
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

## See Also

- [02-architecture.md](02-architecture.md) — Layer responsibilities
- [08-ui.md](08-ui.md) — Visual styling rules
- [09-cli.md](09-cli.md) — TUI keybindings reference
