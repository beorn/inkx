# UI Specification

Views, navigation, collapsing, and the TUI design system.

---

## Tree Representations

km uses three tree levels:

| Tree        | Location    | Purpose                                            |
| ----------- | ----------- | -------------------------------------------------- |
| **fs-tree** | Disk        | Folders, files, markdown content. Source of truth. |
| **km-tree** | SQLite      | Unified nodes. Queryable.                          |
| **ui-tree** | Render-time | Collapsed, formatted for output.                   |

Collapsing happens only in ui-tree — km-tree preserves actual structure.

---

## Views

| View  | Command                      | Collapsing      | Use                          |
| ----- | ---------------------------- | --------------- | ---------------------------- |
| List  | `km list` / `km ls`          | No              | Flat node list               |
| List  | `km ls --context`            | Yes (ancestors) | With ancestor paths          |
| Tasks | `km tasks`                   | Yes (ancestors) | = `ls --type task --context` |
| Board | `km view`                    | Yes (children)  | Kanban columns               |
| Tree  | `km show --tree`             | No              | Actual structure             |
| Tree  | `km show --tree --collapsed` | Yes             | Compact view                 |

All views support `--id` to show node IDs (hidden by default).

---

## Collapsing

### The Problem

Users create matching folder/file/section structures:

```
Taxes/           # folder
  Taxes.md       # file
    # Taxes      # section
```

Three levels for one concept is redundant.

### The Solution

Consecutive nodes with the same normalized name collapse into one line:

```
Taxes / .md #    # shows all three types in suffix
```

### Name Normalization

| Original             | Normalized           |
| -------------------- | -------------------- |
| `Taxes/`             | `taxes`              |
| `Taxes.md`           | `taxes`              |
| `# Taxes`            | `taxes`              |
| `US-Financial-Setup` | `us financial setup` |

Rules: strip `#`, `.md`, replace `-_` with space, lowercase, trim.

### Collapsing Directions

| Direction     | Used By       | Algorithm                                |
| ------------- | ------------- | ---------------------------------------- |
| **Bottom-up** | Task context  | Walk ancestors, group matching names     |
| **Top-down**  | Board columns | Walk children, find first different name |

---

## Type Indicators

| Type    | Indicator         | Example        |
| ------- | ----------------- | -------------- |
| folder  | `/`               | `Projects/`    |
| file    | `.md`             | `README.md`    |
| section | `#`               | `# Overview`   |
| task    | `[ ]` `[x]` `[/]` | `[ ] Do thing` |

### Collapsed Suffix

| Collapsed               | Suffix    |
| ----------------------- | --------- |
| folder + file           | `/ .md`   |
| folder + file + section | `/ .md #` |
| file + section          | `.md #`   |

Suffix renders dim/gray.

---

## Design System

### Terminal Color Constraints

The TUI targets **256-color terminals** as the baseline. All core features work with the standard 256-color palette (ANSI 0-255).

- **256 colors**: Required for full functionality
- **True color** (24-bit RGB): Optional enhancement for due date underlines
- **16 colors**: Not officially supported (may work but not tested)

### Visual Hierarchy

1. **Selection**: Cursor and selected items (cyan background)
2. **Active context**: Current panel/card (bright border)
3. **Standard content**: Default colors
4. **De-emphasized**: Completed tasks, inactive regions (dimmed)

### Accessibility

- Selection states use high-contrast background colors
- Status icons combine color AND shape (colorblind-safe)
- Dim styling reduces visual noise without hiding content

---

## Color Palette

### Selection Colors

| Color                  | Usage                   | Rationale                          |
| ---------------------- | ----------------------- | ---------------------------------- |
| `cyan` bg + `black` fg | **Selection (all)**     | Cursor, focused item, multi-select |
| `cyanBright` border    | **Active panel/card**   | Draws eye to focused region        |
| `blackBright` border   | **Inactive panel/card** | Present but de-emphasized          |

### Header Colors

| Color                  | Usage                        | Rationale                             |
| ---------------------- | ---------------------------- | ------------------------------------- |
| `yellow` + bold        | **Selected column header**   | Stands out, indicates current context |
| `yellowBright` + dim   | **Unselected column header** | Visible but clearly secondary         |
| `cyan` bg + `black` fg | **Header at cursor level**   | Consistent with item selection        |

### Status Icon Colors

| Color    | Status  | Icon | Meaning        |
| -------- | ------- | ---- | -------------- |
| `gray`   | todo    | ○    | Not started    |
| `yellow` | wip     | ◐    | In progress    |
| `red`    | blocked | ⊘    | Cannot proceed |
| `green`  | done    | ✓    | Completed      |
| `gray`   | dropped | ∅    | Abandoned      |

### Tag/Board Colors (User-Assignable)

Users can assign colors to boards and tags using the `km.color::` attribute:

| Color     | ANSI | Suggested Use                                  |
| --------- | ---- | ---------------------------------------------- |
| `white`   | 7    | Default, neutral                               |
| `blue`    | 4    | Information, reference                         |
| `magenta` | 5    | Special, highlight                             |
| `yellow`  | 3    | Warning, attention (avoid - used by WIP icon)  |
| `red`     | 1    | Urgent, blocked (avoid - used by blocked icon) |
| `green`   | 2    | Success, done (avoid - used by done icon)      |

**Avoid for tags**: `cyan` (reserved for selection), `gray` (used for dimming/chrome).

### UI Chrome Colors

| Element           | Color                  | Usage                           |
| ----------------- | ---------------------- | ------------------------------- |
| Separators        | `gray`                 | Column dividers, borders        |
| Scroll indicators | `gray` bg + `white` fg | Show more content available     |
| Hints/metadata    | `dimColor`             | Secondary information           |
| Embedded context  | `dimColor` + `italic`  | Parent path for symlinked tasks |

---

## Reserved Colors

These colors have specific semantic meanings and **MUST NOT** be reused:

| Color             | Reserved For                  | Why                                          |
| ----------------- | ----------------------------- | -------------------------------------------- |
| `cyan` background | **Selection only**            | Users must instantly identify where they are |
| `inverse` video   | **Input cursor, mode badges** | Text input focus indicator                   |
| `$selected` + `dimColor` | **Unfocused pane cursor** | Cursor visible but subdued in inactive pane |

### Anti-patterns

- Using cyan background for status indication or general emphasis
- Using inverse for general emphasis or cursor highlight (use `$selected` color instead)
- Using `inverse` in detail pane items (use `color="$selected"` + `dimColor` pattern)

---

## Chalk vs silvery Styling

The TUI uses two styling systems that can conflict:

| System         | How it works                                              | Best for                                     |
| -------------- | --------------------------------------------------------- | -------------------------------------------- |
| **silvery props** | `<Box backgroundColor="cyan">` fills entire computed area | Backgrounds, containers, selection           |
| **chalk/ANSI** | `chalk.bgCyan('text')` only colors text characters        | Inline text styling (bold, italic, fg color) |

### The Rule

**Don't use chalk.bg\* when silvery backgroundColor is set on the Text or any parent Box.**

When both are used, chalk bg only colors the text characters while silvery fills the whole box, creating visible gaps in the padding/empty space.

### Safe Patterns

```tsx
// OK: silvery bg only
<Box backgroundColor="cyan"><Text>plain text</Text></Box>

// OK: chalk bg only (no silvery bg)
<Text>{chalk.bgYellow('highlighted')}</Text>

// OK: chalk for text styling (no bg), silvery for container bg
<Box backgroundColor="cyan"><Text>{chalk.bold('bold text')}</Text></Box>
```

### Unsafe Pattern

```tsx
// BAD: Both silvery bg AND chalk bg
<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack("text")}</Text> // Creates visual gaps
</Box>
```

### Runtime Detection

InkX detects this conflict at runtime. Control via `SILVERY_BG_CONFLICT` env var:

| Value             | Behavior                              |
| ----------------- | ------------------------------------- |
| `throw` (default) | Throws error immediately              |
| `warn`            | Logs warning once per unique conflict |
| `ignore`          | No detection (for performance)        |

### Intentional Override

If you know what you're doing and intentionally want both backgrounds, use `bgOverride()` from @silvery/ansi:

```tsx
import { bgOverride } from "@silvery/ansi"

// This is allowed - you're explicitly opting out of the safety check
;<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack("intentional"))}</Text>
</Box>
```

---

## Selection States

### Item-Level Selection

| State    | Background | Foreground | Modifiers                   |
| -------- | ---------- | ---------- | --------------------------- |
| Normal   | -          | default    | -                           |
| Selected | `cyan`     | `black`    | -                           |
| Done     | -          | -          | `dimColor`, `strikethrough` |
| Dropped  | -          | -          | `dimColor`, `strikethrough` |

### Panel-Level Focus

| State          | Border Color  | Header Style               |
| -------------- | ------------- | -------------------------- |
| Active panel   | `cyanBright`  | `yellow`, `bold`           |
| Inactive panel | `blackBright` | `yellowBright`, `dimColor` |

### Input Fields

| State                   | Style                       |
| ----------------------- | --------------------------- |
| Text cursor position    | `inverse` (single space)    |
| Selected item in picker | `cyan` bg, arrow prefix `▸` |
| Unselected item         | no prefix indent            |

---

## Due Date Urgency

Due dates use colored underlines to indicate urgency:

| Urgency        | Underline Style | Color (RGB)              |
| -------------- | --------------- | ------------------------ |
| Overdue        | curly           | `[255, 80, 80]` (red)    |
| Today/Tomorrow | curly           | `[255, 165, 0]` (orange) |
| Within 7 days  | single          | `[255, 255, 0]` (yellow) |
| Beyond 7 days  | none            | -                        |

These use true color (24-bit RGB) and may not render in all terminals.

---

## Board View Layout

```
$ km view

┌─ Inbox ──────────┐ ┌─ In Progress ────┐ ┌─ Done ───────────┐
│                  │ │                  │ │                  │
│ [ ] Review PR    │ │ [/] Write spec   │ │ [x] Design model │
│ [ ] Call dentist │ │                  │ │ [x] Setup repo   │
│                  │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Outline Mode

Cards expand to show children:

```
┌─ Projects ─────────────────────┐
│                                │
│ ▼ Auth                         │
│   [ ] Implement OAuth          │
│   [ ] Add tests                │
│ ▶ Database (2)                 │
│                                │
└────────────────────────────────┘
```

---

## List with Context

`km ls --context` (or `km tasks` for tasks) shows ancestor paths:

```
$ km tasks
# equivalent to: km ls --type task --context

Taxes / .md #                           ← collapsed ancestors
  ## 2025
    [ ] File return                     due: Apr 15

US Financial Setup / .md                ← partial collapse
  # US Financial Setup (2025-26)        ← section name differs
    [ ] Open brokerage account
```

---

## Tree View

```
$ km show --tree projects/

projects/
  Taxes/
    Taxes.md
      # Taxes
        ## 2025
          [ ] File return
```

No collapsing — shows actual km-tree structure.

With `--collapsed`:

```
$ km show --tree --collapsed projects/

projects/
  Taxes / .md #
    ## 2025
      [ ] File return
```

---

## Display Functions

Located in `@km/tree` (except `normalizeName` which is in `@km/core`):

```typescript
// Get display name (strips .md, # markers)
getNodeDisplayName(node: Node): string

// Normalize for comparison (from @km/core)
normalizeName(name: string): string

// Type indicator: "/", ".md", "#", ""
getTypeIndicator(type: NodeType): string

// Top-down: get collapsed suffix for a node
getCollapsedTypeSuffix(node: Node): string

// Bottom-up: collapse ancestor path
collapseAncestorsWithTypes(ancestors: Node[]): CollapsedAncestor[]

interface CollapsedAncestor {
  node: Node;
  typeSuffix: string;
}
```

---

## Extending the Design System

When adding new visual elements:

1. **Check reserved colors first** - don't reuse cyan bg or inverse
2. **Use semantic color mapping** - pick colors that match the meaning
3. **Stick to 256-color palette** - avoid true color for core features
4. **Update this document** - keep the design system current
5. **Add to storybook** - visual regression testing

---

## Navigation Model

### Movement Types

| Term           | Meaning                                   | Keys                      |
| -------------- | ----------------------------------------- | ------------------------- |
| **Cursoring**  | Move to visually adjacent block           | `h j k l` or arrows       |
| **Navigating** | Change board root (zoom)                  | `u` / `Enter` / `[` / `]` |
| **Shifting**   | Move selected node(s) in visual direction | `⌥+hjkl` or `⌥+arrows`    |
| **Moving**     | Move node(s) to arbitrary destination     | `m` + cursor + `Enter`    |

### Visual Block Model

Every navigable element is a full-width block. Cursor moves between blocks visually, not by tree structure:

```
┌───────────────┐ ┌───────────────────┐
│ Column 1      │ │ Column 2          │
├───────────────┤ ├───────────────────┤
│ ┌───────────┐ │ │ ┌───────────────┐ │
│ │ Card A    │←───→│ Card C        │ │  ← h/l moves between columns
│ └───────────┘ │ │ └───────────────┘ │
│ ┌───────────┐ │ │ ┌───────────────┐ │
│ │ Card B    │ │ │ │ Card D        │ │  ← j/k moves within column
│ └───────────┘ │ │ └───────────────┘ │
└───────────────┘ └───────────────────┘
```

### Keybindings

| Key      | Action                             |
| -------- | ---------------------------------- |
| `j`/`↓`  | Move cursor down (visual)          |
| `k`/`↑`  | Move cursor up (visual)            |
| `h`/`←`  | Move cursor left (cross-column)    |
| `l`/`→`  | Move cursor right (cross-column)   |
| `u`      | Zoom out (root → parent)           |
| `Enter`  | Zoom in (root → selected)          |
| `[`      | History back                       |
| `]`      | History forward                    |
| `⇧+hjkl` | Extend selection in direction      |
| `⌥+hjkl` | Move selected node(s) in direction |
| `m`      | Enter move mode                    |
| `x`      | Toggle task status                 |
| `Space`  | Toggle fold                        |
| `A`      | Select all siblings                |
| `Escape` | Clear selection / cancel mode      |

### BoardState

```typescript
interface BoardState {
  // Root context
  rootId: string | null // Current view root (zoom level)
  rootPath: string | null // File path for root

  // Cursor: sel.node.cursor() is the sole authority (not stored in BoardState)
  // Access via ctx.cursor in action handlers, sel.node.cursor() in components

  // Tree state
  foldDepths: Map<string, number> // Depth budget per node (0 = fully folded)
  collapsedNodes: Set<string> // Collapsed columns (toggle with 'c')

  // Navigation
  navHistory: NavHistoryEntry[] // Back/forward navigation
  navHistoryIndex: number

  // Move mode
  moveMode: boolean
  moveSourceNodes: string[] // Node IDs being moved (m then hjkl)
  moveSourceCursorNodeId: string | null // Original cursor node

  // View configuration
  maxOutlineDepth: number
  maxContentLines: number

  // Sticky cursor (curswant)
  curswantX: number | null // Sticky column index for board↔column navigation
  curswantY: number | null // Sticky card index for cross-column navigation
}
```

**Key design:** `sel.node.cursor()` is the sole cursor authority. Visual indices (`colIndex`, `cardIndex`) are **derived at render time** via `deriveCursorIndices()`. Cursor is always visible — fold nudges cursor to card, navigation auto-unfolds. See [selection-model.md](../design/selection-model.md) for the full selection API.

**No tree data in state:** Repo provides tree queries directly. Column IDs are derived from `PaneSignals.visibleLens` (computed TreeLens). Components take string IDs and self-resolve via `useNode(id)`.

**Terminology:** "cursor" = single focused node. "selection" = multi-select via visual mode ('v').

### Pane Focus (Focus Scopes)

Each pane (board, detail) is a silvery **focus scope** — a container that remembers its last focused element. Pane focus is managed via `focusManager.activateScope()` (WPF FocusScope model), which:

1. Saves the current focus in the outgoing scope's memory
2. Switches `activeScopeId` to the new scope
3. Restores remembered focus in the incoming scope

**Focus source of truth:** `focusManager.activeScopeId` is the single source of truth for which pane is active. `workspace.focusedPaneId` is kept in sync via `syncFocusScope()` for persistence/state access.

**Cursor visibility:** Both focused and unfocused panes show their cursor. The unfocused pane uses a per-pane theme override (`deriveUnfocusedTheme`) where `$selected` resolves to gray instead of gold. This is applied via `<Box theme={paneTheme}>` in WorkspaceView — all `$token` references inside automatically resolve against the dimmed theme.

**Scope-aware commands:** Navigation commands (`cursor_down`, `cursor_up`, `enter`) check the active scope type and dispatch to the appropriate handler (board vs detail). This eliminates duplicate `detail_pane.*` commands.

| Key       | Board Scope           | Detail Scope                          |
| --------- | --------------------- | ------------------------------------- |
| `j` / `k` | Move cursor down/up   | Move detail cursor down/up            |
| `h`       | Move to prev column   | Return to board pane                  |
| `Enter`   | Zoom into card        | Zoom into detail cursor node          |
| `n`       | Toggle detail pane    | Toggle detail pane (cycles focus)     |

### Cursor Depth and Direction Translation

Cursor depth is **derived** from `cursor.length`, not stored separately:

- `depth 0` = board level (no node selected)
- `depth 1` = column level (cursor on column header)
- `depth 2+` = card level (cursor on card or deeper)

The `visualToStructural(depth, direction)` function translates visual directions to structural tree operations:

| Cursor Depth | j (down)         | k (up)               | h (left)    | l (right)   |
| ------------ | ---------------- | -------------------- | ----------- | ----------- |
| 0 (board)    | enter 1st column | no-op                | no-op       | no-op       |
| 1 (column)   | enter 1st card   | exit to board        | prev column | next column |
| 2+ (card)    | next sibling     | prev sibling or exit | prev column | next column |

This eliminates the need for a stored selection level state (`sel.kind`) — the behavior is purely determined by cursor path depth. See [selection-model.md](../design/selection-model.md).

### Sticky Cursor (curswant)

The board view implements **curswant** (cursor wanted position), a pattern borrowed from Vim that preserves cursor position during navigation through containers of varying size.

#### Bounding Boxes

Each card has two bounding boxes used for position calculations:

- **Head box**: The bullet + title line only (1 terminal row)
- **Card box**: The full card including border, head, and visible subitems

```
╭─────────────╮ ┐
│ ● Card Title│ ├─ head box (1 row)
│   - subitem │ │
│   - subitem │ ├─ card box (full height)
╰─────────────╯ ┘
```

#### curswantX: Board ↔ Column Navigation

When navigating between board level and column level with j/k:

- `k` at column level → board level: stores current column index as curswantX
- `j` at board level → column level: returns to curswantX column (or column 0 if not set)
- Cleared by: h/l at board level, entering a card, explicit navigation

#### curswantY: Cross-Column Navigation (h/l)

Uses visual Y coordinates to maintain cursor position across columns.

**Cleared by:** j/k navigation, zoom, explicit navigation.

**Lazily captured** from current card on first h/l press (looked up by `nodeId` in the layout registry). At h/l time, the focused card is always rendered (no dispatch has happened yet), so the lookup is reliable.

- Calculate `curswantY` = vertical midpoint of current card's **title row** (`headY + headHeight/2`)
- Title row is always 1 line high, so `curswantY` is near the top of the card

**On subsequent h/l moves:**

- `curswantY` is preserved (no recapture)
- Find the card in target column whose **card midpoint** (`y + cardHeight/2`) is closest to `curswantY`
- May land on column header if `curswantY` is above all cards

**Implementation:** See [`getCardMidY()`](../../apps/km-tui/src/card-positions.ts) and [`findCardAtYVisual()`](../../apps/km-tui/src/card-positions.ts).

#### Insertion Slots for Card Shifting (Alt+h/l)

When shifting a card to another column, find the insertion position:

```
│ ● Column Header │
├─────────────────┤
│                 │ ← slot 0 (after header)
│ ╭─────────────╮ │
│ │ ● Card 0    │ │
│ ╰─────────────╯ │
│                 │ ← slot 1 (between cards)
│ ╭─────────────╮ │
│ │ ● Card 1    │ │
│ ╰─────────────╯ │
│                 │ ← slot 2 (after last card)
```

Each slot has a Y coordinate (the gap between cards). Insert at the slot whose Y is closest to curswantY.

**Implementation:** Visual navigation uses `layoutRegistry` to track card screen positions. For h/l navigation, `layoutRegistry.findCardAtYVisual(targetColumn, currentY)` finds the card at the same Y coordinate in the target column.

**Example: curswantY with variable card heights**

```
Column A                    Column B
│ ● Header  │               │ ● Header  │
├───────────┤               ├───────────┤
│ ╭───────╮ │               │ ╭───────╮ │
│ │●Card 0│◄├── curswantY ──┼─│●Card 0│◄├── lands here
│ │ -sub  │ │   (title mid) │ ╰───────╯ │   (closest midpoint)
│ │ -sub  │ │               │ ╭───────╮ │
│ ╰───────╯ │               │ │●Card 1│ │
│ ╭───────╮ │               │ │ -sub  │ │
│ │●Card 1│ │               │ │ -sub  │ │
│ ╰───────╯ │               │ │ -sub  │ │
│ ╭───────╮ │               │ ╰───────╯ │
│ │●Card 2│ │               │           │
│ ╰───────╯ │               │           │
```

When cursor is on Card 0 in Column A and pressing `l`:
- `curswantY` = title midpoint of Card 0 (~row 4)
- In Column B, Card 0's midpoint is closest to row 4
- Result: cursor lands on Card 0 in Column B

See bead km-a6ti for implementation details.

---

## Keyboard Shortcuts Reference

Press `?` in the TUI to show the interactive help overlay.

### Navigation

| Key         | Action                                |
| ----------- | ------------------------------------- |
| `j` / `↓`   | Move cursor down (visual)             |
| `k` / `↑`   | Move cursor up (visual)               |
| `h` / `←`   | Move cursor left (cross-column)       |
| `l` / `→`   | Move cursor right (cross-column)      |
| `g`         | Go to first card in column            |
| `G`         | Go to last card in column             |
| `Shift+1-9` | Jump to column 1-9                    |
| `1-9`       | Jump to favorite board (@next, etc.)  |
| `u`         | Zoom out (go to parent node)          |
| `Enter`     | Zoom in / open detail pane            |
| `o`         | Open item in context (grandparent)    |
| `[`         | History back                          |
| `]`         | History forward                       |
| `Esc`       | Close pane / exit mode / quit         |

### Card Operations

| Key            | Action                                         |
| -------------- | ---------------------------------------------- |
| `Space`        | Cycle task status (todo→wip→done→dropped→todo) |
| `D`            | Delete card (symlinks: remove from board)      |
| `n`            | Open new item dialog                           |
| `Tab`          | Indent (make child of item above)              |
| `Shift+Tab`    | Outdent (make sibling of parent)               |
| `p`            | Open item picker (move to project)              |
| `e`            | Edit item in external editor                   |
| `1-5` (detail) | Set priority (when detail pane open)           |

### Moving Items

| Key           | Action                         |
| ------------- | ------------------------------ |
| `⌥+j` / `⌥+↓` | Move card down in column       |
| `⌥+k` / `⌥+↑` | Move card up in column         |
| `⌥+h` / `⌥+←` | Move card to column left       |
| `⌥+l` / `⌥+→` | Move card to column right      |
| `⌥+1-9`       | Move card to top of column 1-9 |

### View Controls

| Key       | Action                                    |
| --------- | ----------------------------------------- |
| `v`       | Cycle view mode (cards→columns→list→tabs) |
| `+` / `=` | Increase outline depth                    |
| `-`       | Decrease outline depth                    |
| `z`       | Fold all cards in column                  |
| `Z`       | Unfold all cards in column                |
| `c`       | Toggle column collapse                    |
| `i`       | Toggle detail pane                        |

### Selection

| Key                   | Action                                      |
| --------------------- | ------------------------------------------- |
| `Shift+A`             | Select all (progressive: card→column→board) |
| `Shift+j` / `Shift+↓` | Extend selection down                       |
| `Shift+k` / `Shift+↑` | Extend selection up                         |
| `Shift+h` / `Shift+←` | Extend selection left (column)              |
| `Shift+l` / `Shift+→` | Extend selection right (column)             |

### General

| Key | Action              |
| --- | ------------------- |
| `?` | Toggle help overlay |
| `q` | Quit                |

---

## Status Bar

The status bar displays user action feedback with appropriate severity levels.

### Location

Between the main content area and bottom bar (path/sync status).

### Notification Levels

| Level   | Icon | Color  | Use Case                                      |
| ------- | ---- | ------ | --------------------------------------------- |
| info    | ℹ    | cyan   | Informational (selection count, mode changes) |
| success | ✓    | green  | Successful operations (saved, synced)         |
| warning | ⚠    | yellow | Non-blocking issues (conflicts, warnings)     |
| error   | ✗    | red    | Failed operations, errors                     |

### Usage

Status messages are set via UI reducers:

```typescript
// Show status
dispatch(actions.setStatus({ level: "info", message: "3 tasks selected" }))

// Clear status
dispatch(actions.clearStatus())
```

### Behavior

- Message truncates with ellipsis if exceeds terminal width
- Typically cleared when next action occurs
- Not rendered when `ui.status` is null

### Examples

- Selection: "5 tasks selected"
- Mode change: "Outline mode enabled"
- File operations: "Saved to board.md" (success)
- Errors: "Failed to save file" (error)

---

## Toast Notifications

km uses a Sonner-inspired toast API for temporary notifications with optional actions (like undo).

### Quick Start

```typescript
import { createToastQueue } from "@km/core"

// Create a queue (Disposable — use `using` for automatic cleanup)
using toastQueue = createToastQueue()

// Convenience methods
toastQueue.success("Saved successfully")
toastQueue.error("Failed to sync")
toastQueue.warning("Network connection unstable")
toastQueue.info("3 tasks selected")

// With description
toastQueue.error("Failed to save", {
  description: "Network connection lost",
})

// With action (undo, retry, etc.)
toastQueue.info("Task archived", {
  action: { label: "Undo", trigger: "z" },
})
```

### Toast Queue

Each `ToastQueue` instance manages its own active toasts:

```typescript
const allToasts = toastQueue.getAll()
const latest = toastQueue.getLatest()
toastQueue.dismiss(id)
toastQueue.dismissAll()
```

### Batching

Similar toasts can be automatically batched using a `batchKey`:

```typescript
toastQueue.info("item archived", { batchKey: "archive" })
toastQueue.info("item archived", { batchKey: "archive" })
toastQueue.info("item archived", { batchKey: "archive" })
// → Shows "3 item archived" (batched within 100ms window)
```

### TUI Rendering

Toasts appear above the bottom bar:

```
┌────────────────────────────────────────────────────┐
│ Board View                                         │
│   ├─ Project A                                     │
│   └─ Project B                                     │
├────────────────────────────────────────────────────┤
│ ✓ 3 tasks archived  [z] Undo  Esc                  │  ← Toast
├────────────────────────────────────────────────────┤
│ NORMAL >                DISK ~/repo  📋123 📄45    │  ← Command bar
└────────────────────────────────────────────────────┘
```

**Display Rules:**

- Only the **latest** toast is shown (not a stack)
- Icon indicates level: ℹ (info), ✓ (success), ⚠ (warning), ✗ (error)
- **Esc** dismisses toast

### Toast Options

```typescript
interface ToastOptions {
  description?: string // Secondary text on line 2
  duration?: number // milliseconds (default 10000)
  dismissible?: boolean // default true
  action?: ToastAction // Optional action button
  batchKey?: string // For coalescing similar toasts
}
```

### Auto-Toasts (Event-Driven)

km automatically shows toasts for certain events:

- **Sync Events**: `toast.success("Synced 3 files", { batchKey: "sync" })`
- **Parse Errors**: `toast.error("Parse error in tasks.md:42")`
- **Sync Errors**: `toast.error("Sync error: tasks.md")`

**Implementation**: API in `packages/km-core/src/toast.ts`, TUI rendering in `apps/km-tui/src/views/Toast.tsx`.

---

## See Also

- [../architecture.md](../architecture.md) — Layer responsibilities
- [../storage.md](../storage.md) — Node schema
- [../dev/ink-patterns.md](../dev/ink-patterns.md) — Ink framework workarounds and patterns
