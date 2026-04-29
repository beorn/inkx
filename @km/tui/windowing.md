---
id: "@km/tui/windowing"
aliases:
  - km-tui.windowing
  - km-tui-windowing
created_by: claude:d3a7049b
created_at: 2026-02-22T00:24:52Z
closed_at: 2026-02-22T21:31:09Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Pane windowing system: tiling, layouts, workspaces @km/tui #epic #P2 @claude:28b14b32

## Problem

km currently has a fixed layout: board (left) + optional detail pane (right). No way to view multiple boards, open a journal alongside work, or work across projects simultaneously. The detail pane is special-cased rather than being a general-purpose view.

## Architecture

### Workspace layer
A **workspace** is a new layer above the board:
```
App → Workspace → Pane[] → View (board | detail | journal | empty)
```

Currently: `App → Board → DetailPane?`. The workspace manages pane layout, focus, and lifecycle. Each pane is an independent view container with its own state (cursor, folds, nav history, view mode).

Store changes from flat board state to:
```ts
{ workspace: { panes: Map<string, PaneState>, layout: LayoutTree, focusedId: string }, global: GlobalState }
```
Global state (toasts, clipboard, dialogs, terminal dimensions) stays at top level.

### Plugin/module architecture
The windowing system splits into reusable inkx module + @km/_orphan/specific layer:

**inkx layer** (`vendor/beorn-inkx`) — generic terminal pane management:
- `PaneManager` — layout tree, pane CRUD, focus routing between panes
- `<SplitView>` component — renders binary split tree with borders
- `<PaneHost>` component — bordered container with `[id] title` in border
- Resize handling (keyboard + mouse drag on borders)
- Pane focus memory (per-group), zoom/maximize toggle

**km layer** (`apps/km-tui`) — app-specific pane configuration:
- Pane view types: `BoardView`, `DetailView`, `EmptyView`, `JournalView` (future)
- Linked pane semantics (2d/2s suffix, parent-child lifecycle)
- Workspace persistence (save/restore layouts)
- Board favorites (1-9), `Ctrl+D` toggle detail, `gn`/`gp`/`gt`/`gj` routing

### Layout representation
Binary split tree:
```ts
type LayoutTree = PaneLeaf | SplitNode
type SplitNode = { type: "split", direction: "h"|"v", ratio: number, left: LayoutTree, right: LayoutTree }
type PaneLeaf = { type: "pane", id: string }
```
Sizes are percentage-based (adapt to terminal resize). Minimum pane size enforced (20 cols / 5 rows).

## Pane Types

### Board pane
Columns view of a board (current main view).

### Detail pane
Node detail (body, tags, dates). No longer special-cased — just a pane with view type "detail":
- **Linked by default**: opened via `Enter`/`Ctrl+I`, follows parent board cursor
- **Can be pinned**: explicit pin freezes on a specific node; pinning converts from linked sub-pane to independent pane
- **Can be unlinked**: replaced by any other view
- `showDetailPane` removed from UIState — replaced by pane existence

### Empty pane (welcome screen)
```
╭── [3] ─────────────────────────────╮
│                                     │
│   Empty pane                        │
│                                     │
│   gp  open board picker             │
│   gt  open @today                   │
│   gj  open daily journal            │
│   gx  open @next                    │
│                                     │
│   Ctrl+W q  close this pane         │
│                                     │
╰─────────────────────────────────────╯
```

### Journal pane (future)
Daily journal / scratch pad.

## Pane Numbering

- Top-level panes: `[1]`, `[2]`, `[3]` — shown in border, keyboard targets via `Ctrl+1-9`
- Linked sub-panes: `[2d]` (detail), `[2s]` (search) — display-only in border, NOT keyboard targets
- Numbers are stable — closing pane 2 does not renumber pane 3
- Semantic letters: `d`=detail, `s`=search, `j`=journal, `g`=graph
- Linked panes closed with parent; can also be closed independently
- Pane titles shown in borders next to number: `[2] project-x`

## Navigation

### Direct jump: `Ctrl+1-9`
Instant focus to pane N. If pane N does not exist, creates empty pane in that slot.
`1-9` (without Ctrl) stays as board favorites — no conflict.

### Cycle: `Tab` / `Shift+Tab`
Tab cycles within a pane group first (pane 2 → 2d → 2s), then to next top-level pane.

### Spatial: `Ctrl+W h/j/k/l`
Move focus to the pane in that direction.

### Previous: `Ctrl+W p`
Toggle between last two focused panes (like vim `Ctrl+W p`).

### Detail toggle: `Ctrl+D`
Opens/focuses the detail for the current pane. If detail already focused, closes it.

### Mouse click
Click on any pane to focus it.

### Group focus memory
Pane groups (parent + linked children) remember last-focused sub-pane. Leaving group 2 and returning restores focus to whichever sub-pane (2, 2d, 2s) was last active.

## Pane Lifecycle

### Opening
- **App start**: single pane with board (or restore last workspace)
- **`Ctrl+W v`**: vertical split — new empty pane right
- **`Ctrl+W s`**: horizontal split — new empty pane below
- **`Enter` / `Ctrl+I`**: opens linked detail pane
- **`Shift+Enter`**: opens node in NEW independent pane (split)
- **`gn`**: split + board picker in new pane

### Closing
- **`Ctrl+W q`**: close focused pane (last pane → show empty or exit, configurable)
- **`Ctrl+W o`**: close all panes except focused ("only", like vim)
- Closing parent closes linked sub-panes
- Auto-close: empty panes close when focus leaves (optional, configurable)

## Pane Resizing

### Keyboard
- `Ctrl+W >` / `Ctrl+W <` — increase/decrease width
- `Ctrl+W +` / `Ctrl+W -` — increase/decrease height
- `Ctrl+W =` — equalize all pane sizes
- `Ctrl+W z` — zoom/maximize toggle (like tmux)

### Pane movement
- `Ctrl+W H/J/K/L` (capital) — swap/move pane position with neighbor

### Mouse
- Drag pane borders to resize (inkx hitTest)

### Safety
- `Ctrl+W` disabled in INSERT/text mode to prevent accidental pane ops while typing

## Smart routing for go-to commands
- `gp` → opens board picker in current pane (replaces)
- `gt` → if @today already open in a pane, focuses it; otherwise opens in current pane
- `gj` → same smart routing
- `gn` → splits and opens board picker in new pane
- `gx` → go to @next (same smart routing as gt)

## Workspace Persistence

### Save/restore
- `:workspace save <name>` / `:ws save <name>` — save current layout
- `:workspace <name>` / `:ws <name>` — restore
- `:workspace list` / `:ws list` — list saved
- `:workspace delete <name>` / `:ws delete <name>` — remove

### What is saved
- Pane layout tree (split directions, ratios)
- Each pane view type + target (which board, which node)
- Per-pane view mode (cards/list/tabs)
- Per-pane fold/collapse state (optional)
- Focus position (which pane group, which sub-pane)

### Storage
JSON in vault metadata (`.km/workspaces/<name>.json`) or SQLite.
Auto-save last workspace on exit, restore on launch.

### Quick-switch (future)
Command palette: `:ws morning`, `:ws deepwork`

## Per-Pane State

| State | Per-pane | Global |
|-------|----------|--------|
| rootId, rootPath | ✓ | |
| cursorNodeId, cursorStore | ✓ | |
| foldedNodes, collapsedNodes | ✓ | |
| navHistory, navHistoryIndex | ✓ | |
| viewMode (cards/list/tabs) | ✓ | |
| inlineEditBlock | ✓ | |
| localSearch, filterText | ✓ | |
| multiSelected | ✓ | |
| terminal dimensions | | ✓ |
| toastQueue | | ✓ |
| clipboard | | ✓ |
| help/omnibox/search dialogs | | ✓ |
| sync/watcher status | | ✓ |

## Architectural Changes

1. **New Workspace layer**: manages pane layout tree, creation/destruction, focus routing
2. **PaneState type**: extracted from current flat BoardAppStore — each pane gets its own instance
3. **Command routing**: `buildActionCtx()` pulls from focused pane state, not global store root
4. **Store restructure**: `{ workspace: { panes, layout, focusedId }, global }`
5. **Board.tsx split**: current Board becomes "BoardView" pane type
6. **DetailPane.tsx**: becomes "DetailView" pane type, no longer conditionally rendered inside Board
7. Each pane is an inkx `focusScope`; focus system (@km/silvery-legacy/tea) handles the tree

## Edge Cases

- Same board open in two panes → both reflect data mutations (shared data layer)
- Global dialogs (help, omnibox, search) overlay above entire pane layout
- Closing last pane → show empty welcome or exit app (configurable)
- Workspace restore with stale data (board deleted) → open as empty pane with message

## Visual Examples

Morning planning:
```
╭── [1] @today ───────────────────╮╭── [2] @next ────────────────────╮
│ ▸ Fix auth bug                   ││   Write RFC                     │
│   Deploy staging                 ││   Call dentist                  │
│  NORMAL ❯                        ││                                 │
╰──────────────────────────────────╯╰─────────────────────────────────╯
```

Deep work:
```
╭── [1] project-x ────────────────╮╭── [1d] Fix auth bug ────────────╮
│ ▸ Fix auth bug                   ││ body: Token refresh fails...    │
│   Write tests                    ││ tags: #bug #auth                │
│  NORMAL ❯                        ││                                 │
╰──────────────────────────────────╯╰─────────────────────────────────╯
```

## Implementation Phasing

1. Refactor store to `{ workspace: { panes, layout, focusedId }, global }` — single-pane still
2. Externalize detail as a pane type (no visual change yet)
3. Basic splitting (`Ctrl+W v/s`) + empty pane welcome
4. Focus movement (`Ctrl+W hjkl`, `Tab`, `Ctrl+1-9`)
5. Nested splits + resize commands
6. Wire go-to commands to open in panes (`gp`, `gn`, `Ctrl+D`, `Shift+Enter`)
7. Workspace persistence (save/restore)
8. Polish: group focus memory, mouse, auto-close empty, pane reorder
9. Testing edge cases (9 panes, rapid close/open, workspace reload)

## Dependencies
- @km/silvery-legacy/tea (focus system — panes are focus scopes)
- @km/tui/ui-chrome (command box, mode pill, breadcrumb rendering)