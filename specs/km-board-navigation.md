# Visual Board Navigation Model

This defines how cursor movement, selection, and node manipulation work visually across all UIs (TUI, web, etc.).

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

## Rules

1. **Only visible** items navigable (folded = hidden)
2. **No column wrap** - j/k stay within column
3. **h/l from outline** - exits to card first
4. **Empty column** - h/l lands on column
5. **Title center matching** - cross-column uses card title y-center

---

## Architecture

This spec defines behavior across three packages:

```
@km/tui   → maps keys to actions, modal state, rendering
    │
    ▼
@km/board → cursor, selection, fold, zoom, history
    │       visual navigation algorithms (CURSOR_* in boardReducer)
    ▼
@km/tree  → tree structure, queries (NO visual state)
```

### Layer Responsibilities

**Tree Layer** (`@km/tree`) - Data structure only:

- `TreeNode` type definition (aliased as `NodeState` for compatibility)
- `TreePath` type (aliased as `CursorPath`)
- `getNodeAtPath`, `getSiblings`, `findPathByNodeId` queries
- **NO** cursor, selection, or visual state

**Board Layer** (`@km/board`) - Visual navigation state:

- `BoardState`: cursor, selectedNodes, foldedNodes, zoomStack, navHistory
- `boardReducer`: handles all navigation/selection actions
- CURSOR\_\* visual traversal algorithms (in boardReducer.ts)
- Actions: `CURSOR_*`, `EXTEND_SELECT_*`, `SHIFT_*`, `ZOOM_*`, `NAV_BACK/FORWARD`

**TUI Layer** (`@km/tui`) - UI-specific:

- Key → action mapping (hjkl → CURSOR\_\*, etc.)
- Modal state (help, search, newItem, projectPicker)
- View configuration (maxOutlineDepth, maxContentLines)
- Height callbacks for cross-column matching
- React components and rendering (OpenTUI-based)

---

## See Also

- [km-tui-state.md](km-tui-state.md) - TUI state architecture
- [km-ui.md](km-ui.md) - Display and rendering
- [km-design-system.md](km-design-system.md) - Visual styling
