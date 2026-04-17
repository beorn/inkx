# km Knowledge — km agent

Last updated: 2026-04-12

## References (canonical sources — don't duplicate, supplement)

- `docs/design/model/knode.md` — KNode, items vs blocks, board hierarchy
- `docs/design/ui/selection.md` — selection system design
- `docs/design/tea.md` — TEA pattern, state machine composition
- `docs/lessons/input-architecture.md` — 5-stage input pipeline
- `apps/km-tui/tests/CLAUDE.md` — test patterns, assertion hierarchy, canonical examples

**DRY note**: sections below that overlap with design docs are initial snapshots. On future updates, prune to operational delta — gotchas, edge cases, source structure maps, cross-domain connections.

## Board Model

The board is a tree of `KNode` records stored flat in SQLite with `parent_id` references. Visual roles are **positional, not typed** -- the same KNode type renders differently depending on its depth relative to the board root:

| Depth | Role | Visual Treatment |
|---|---|---|
| 0 | Board root | Fullscreen, no chrome |
| 1 | Column | Header bar highlight |
| 2 | Card | Bordered box (title + sub-items + body) |
| 3+ | Sub-item | Indented line; expands to card-like frame when cursor is on it |

### KNode structure

```
KNode {
  id: string (ULID)
  type: "p"|"h"|"code"|"quote"|"table"|"hr"|...
  item?: ItemData         -- presence = structural item (can have children)
  parent_id: string       -- parent reference ("." for root)
  parent_idx: number      -- sibling order (fractional indexing)
  content: string         -- text content
  name: string            -- slug/identifier
  title: string           -- display title (materialized)
  embed_of: string|null   -- cache: sole-content embed target
  fstype: "repo"|"folder"|"file"|"mdsection"
  rules: { collapse, limit, color, ... }
}
```

### Items vs Blocks

The single most important distinction:

- **Item** (`node.item != null`): structural node that can have children, cursor target, participates in outliner ops (indent, outdent, split, merge). `ItemData = { list?: string, task?: { marker, status } }`.
- **Block** (no `item` field): leaf content, not directly selectable, part of a parent item's body.

Type guards (SlateJS namespace pattern): `KNode.isItem(node)`, `KNode.isBlock(node)`, `KNode.isOutline(node)` (type "h" + item), `KNode.isListItem(node)` (non-h + item), `KNode.isTask(node)`, `KNode.isEmbed(node)`.

### Body content

"Body" = block children that appear **before the first sub-item** in a parent. Extracted by `extractBody(children)` which returns `{ body, items }`. Body blocks are dimmed in card rendering.

### View models

| View Model | Wraps | Adds |
|---|---|---|
| `CardView` | KNode | `isBody`, `resolvedNode` (embed), `isBrokenEmbed`, `hasBodyChildren` |
| `ColumnSnapshot` | KNode + children | `wipLimit`, `isVirtual`, `totalCardCount`, `hiddenDescendantCount` |

### Key types and files

- `packages/km-core/` -- `KNode`, `ItemData`, `TaskStatus`, `Position`
- `packages/km-tree/src/types.ts` -- `TreeOp` operations
- `packages/km-tree/src/walk.ts` -- `KTree.nodes()` composable tree iteration
- `packages/km-board/src/board-types.ts` -- `BoardState`, `ViewMode`, `MoveState`, `NavHistoryEntry`
- `apps/km-tui/src/board/board-types.ts` -- TUI-specific types, `PerPaneUIFields`, re-exports from `@km/board`
- `docs/design/model/knode.md` -- canonical reference

## Selection System

Selection uses `@silvery/selection` -- a reactive store built on alien-signals with two layers.

### Layer 1: Node selection (always present)

```ts
sel.node.cursor         // Computed<ID | null> -- primary selected node
sel.node.anchor         // Computed<ID | null> -- extend origin
sel.node.ids            // Computed<OrderedSet<ID>> -- tree-walk ordered, O(1) .has()
sel.node.select(ids, toggle?)  // replace, or XOR toggle
sel.node.extend(cursor)        // range: anchor stays, cursor moves
sel.node.collapse()            // multi -> single, keep cursor
sel.node.remove(id)            // remove one, repair cursor/anchor
```

Constraints: all selected nodes must be siblings (same parent), contiguous, within one column.

### Layer 2: Sub-selection (optional, polymorphic)

Text editing, path points, crop -- one slot via `sel.sub`:

```ts
sel.text()                     // { kind: "text", nodeId, cursor, anchor? } | null
sel.text.edit(nodeId, offset)  // enter text mode
sel.text.select(cursor?, anchor?)  // move caret or set range
sel.text.deselect()            // exit text mode
```

### Mode ladder

```
text --Esc--> node --Esc--> idle (board mode) --j/click--> node --Enter--> text
```

`sel.kind` computed: `"idle" | "node" | "text"` (or sub-selection kind).

### Derived cursor tracking (render optimization)

| Field | What | Source |
|---|---|---|
| `sel.node.cursor` | The actual selected node | `@silvery/selection` |
| `cursorCardNodeId` | Card containing cursor | Derived via `classifyCursorFromLens()` |
| `cursorColumnNodeId` | Column containing cursor | Derived via `classifyCursorFromLens()` |

### Key files

- `packages/silvery-selection/` -- `createSelection()`, `SelectionStore` type
- `apps/km-tui/src/state/selection-adapter.ts` -- bridges selection store to km's tree
- `apps/km-tui/src/board/board-actions-selection.ts` -- multi-select handlers
- `apps/km-tui/src/board/board-selection-helpers.ts` -- `clearSelection()`, `progressiveSelectAll()`, `getSelectedNodes()`, `getSelectedNodeIds()`
- `docs/design/ui/selection.md` -- canonical reference

## Editing Flows

### Inline editing

1. User presses `Enter` on a node (or `i`/`a`/`o` in vim-like fashion)
2. Command system produces a `TEXT_INSERT`/etc. op or triggers `sel.text.edit(nodeId, offset)`
3. `InlineEditField` mounts (React component) using `useEditContext()` from silvery
4. `useEditContext` registers an `EditTarget` -- silvery's `activeEditTargetRef.current` points to it
5. All key input routes through the command system with `when: textInputFocused` guard
6. Text ops (`TEXT_INSERT`, `TEXT_DELETE_BACKWARD`, `TEXT_CURSOR_*`) are dispatched to the active `EditTarget`
7. `Escape` or `Enter` confirms/cancels, clearing `sel.text` and unmounting the edit field

### Detail pane editing

- `D` toggles the detail pane (`TOGGLE_DETAIL_PANE` op)
- Detail pane is a split view (`DetailView.tsx`) showing metadata + content tree
- Navigation within detail pane uses same cursor system but with virtual `__meta__*` node IDs for metadata rows

### Mode transitions

- **Normal -> Edit**: `Enter`, `i`, `a`, `o` -> `sel.text.edit(nodeId, offset)`
- **Edit -> Normal**: `Escape` -> `sel.text.deselect()`; `Enter` in title -> confirm + split or confirm
- **Normal -> Dialog**: `/` (search), `n` (new item), `?` (help)
- **Dialog -> Normal**: `Escape` or dialog confirm

### Key files

- `apps/km-tui/src/views/InlineEditField.tsx` -- inline text editor component
- `apps/km-tui/src/views/BodyEditField.tsx` -- body block editor
- `apps/km-tui/src/board/board-actions-edit.ts` -- edit operations (add, delete, status change, move, indent/outdent)
- `apps/km-tui/src/views/tree-node-edit.tsx` -- tree node edit logic
- `apps/km-tui/src/board/board-tree-ops.ts` -- `boardSplit()`, `boardMergeBackward()`, `boardMergeForward()`
- `apps/km-tui/src/tui-context.ts` -- `OpCtx` with `textEditHints`

## Command System

The command system (`@km/commands`) is data-driven: key -> command -> `KmOp` -> handler.

### Architecture

```
keypress -> command-bridge.ts (processKeyWithContext)
         -> @km/commands/keybindings.ts (resolve key to command ID)
         -> @km/commands/executor.ts (executeCommand -> CommandDef.execute)
         -> KmOp (data)
         -> board-actions.ts (handleKmOp dispatches to specialized handlers)
```

### Key types

- **`CommandDef`**: `{ id, name, description, category, modes?, execute: (ctx) => KmOp | null }`
- **`CommandContext`**: position info, current node, view mode, selection, fold depths
- **`KmOp`**: discriminated union of all operation types (see below)
- **`Keybinding`**: `{ key, commandId, when?, modes?, targetId?, execute? }`
- **`KeybindingContext`**: boolean flags for conditional binding resolution (`textInputFocused`, `isInDetailPane`, `inMoveMode`, etc.)

### KmOp categories (discriminated union)

| Category | Types | Handled by |
|---|---|---|
| `NavOp` | cursor_up/down/left/right, page_up/down | `board-actions-nav.ts` |
| `EditOp` | DELETE_NODE, indent/outdent, duplicate, add | `board-actions-edit.ts` |
| `TextOp` | TEXT_INSERT, TEXT_DELETE_*, TEXT_CURSOR_* | `activeEditTargetRef.current` |
| `VerbOp` | CURSOR_TO, REPARENT_TO, LINK_TO, CREATE_AT | `board-actions.ts` (verb x location) |
| `BoardOp` | CYCLE_VIEW_MODE, fold/unfold ops | `board-actions.ts` |
| `DialogOp` | SHOW_SEARCH_DIALOG, SHOW_HELP, etc. | `board-actions.ts` |
| `PaneOp` | TOGGLE_DETAIL_PANE, CLOSE_DETAIL_PANE | `board-actions.ts` |
| `ViewOp` | CYCLE_VIEW_MODE, CYCLE_ICON_STYLE | `board-actions.ts` |
| `HistoryOp` | HISTORY_UNDO, HISTORY_REDO | `board-actions.ts` |
| Task ops | TASK_SET_STATUS, TASK_CYCLE_STATUS, CLEAR_TASK | `board-actions.ts` |

### Command registration

Commands are defined in `packages/km-commands/src/commands/` -- one file per category:
`navigation.ts`, `edit.ts`, `selection.ts`, `task.ts`, `text-editing.ts`, `block-edit.ts`, `dialog.ts`, `history.ts`, `pane.ts`, `view.ts`, `tui.ts`.

Keybindings are defined in `packages/km-commands/src/keybindings.ts` with `when` predicates from `when.ts` for conditional resolution.

### `when` predicates

Guards that control keybinding activation: `textInputFocused`, `isInDetailPane`, `isInlineEditing`, `helpOverlayOpen`, `consoleOpen`, `inMoveMode`, `localFindActive`, `searchReplaceOpen`, `inDialog`, `hasKitty`.

### Chords

Space-separated key strings: `"v c"` (prefix "v", suffix "c"), `"g g"`. Chord state tracked in `packages/km-commands/src/chord-state.ts`.

### Verb x Location grid

`VerbOp` combines a verb (cursor_to, reparent_to, link_to, create_at) with a location key (e.g., "i" for inbox, "1"-"9" for favorites). Defined in `packages/km-commands/src/verb-locations.ts`.

### Key files

- `packages/km-commands/src/` -- command system package
- `apps/km-tui/src/board/command-bridge.ts` -- bridges `@km/commands` to TUI
- `apps/km-tui/src/board/board-actions.ts` -- main KmOp dispatcher
- `apps/km-tui/src/action-handlers.ts` -- `assertNever` for exhaustive KmOp handling

## View Modes

Five view modes, cycled via `vm` keybinding (`CYCLE_VIEW_MODE`):

| Mode | Component | Description |
|---|---|---|
| `cards` | `CardColumn.tsx` via `HorizontalVirtualList` | Default kanban -- columns side by side, cards as bordered boxes |
| `columns` | `ColumnsView.tsx` | Tree/outline within each column, horizontal windowing |
| `list` | `ListView.tsx` | Full-width hierarchical outline, single scrollable list |
| `tabs` | `TabsView.tsx` | One column at a time with tab bar for switching |
| `detail` | `DetailView.tsx` | Document-style view of a single node with metadata |

### Shared infrastructure

All views use:
- `@silvery/selection` for cursor/selection state
- `NodeStore` (alien-signals per-node reactive state) for granular re-rendering
- `ViewTreeProjection` from `@km/board` for tree traversal with fold/filter awareness
- `ViewNavigation` interface -- each view implements `navigate(dir, state, repo, navigator)` to resolve directional movement

### View-specific navigation

`apps/km-tui/src/navigation/view-navigation.ts` defines `ViewNavigation` interface. `getViewNavigation(viewMode)` returns the policy for the current mode. Cards view uses grid navigation (left/right = column, up/down = card). List/columns use tree-walk navigation.

### Key files

- `apps/km-tui/src/views/BoardView.tsx` -- pure render, dispatches to view-mode components
- `apps/km-tui/src/views/CardColumn.tsx` -- card column (cards view)
- `apps/km-tui/src/views/ColumnsView.tsx`, `ListView.tsx`, `TabsView.tsx`, `DetailView.tsx`
- `apps/km-tui/src/views/useBoardController.ts` -- lifecycle effects, signal subscriptions, derived state
- `apps/km-tui/src/views/Board.tsx` -- thin connector (controller -> BoardView)
- `apps/km-tui/src/types.ts` -- `ViewMode` re-export

## State Management

### Signal store (alien-signals + Zustand bridge)

The primary store is `BoardAppStore` (defined in `apps/km-tui/src/state/board-app-store.ts`), created via silvery's `createApp()`. It combines:

- **Board navigation state**: `rootId`, `foldDepths`, `collapsedNodes`, `moveState`, `navHistory`
- **UI state**: dialogs, overlays, dimensions, loading, watcher status (in `apps/km-tui/src/state/ui-reducer.ts`)
- **Per-pane UI state**: `viewMode`, `maxContentLines`, `localSearch`, `filterProperties` etc. (routed via `PANE_UI_FIELD_NAMES`)
- **Selection**: via `@silvery/selection` store (separate from Zustand)

### Per-node reactive state (NodeStore)

Each node gets stable alien-signals: `cursor`, `selected`, `editing`, `foldOverride`, `excludedSigils`. Defined in `apps/km-tui/src/state/reactive.ts` via `createNodeStore()`. React components subscribe via `useSignal()` from `hooks/use-signal.ts`.

### Pane signals

`apps/km-tui/src/state/pane-signals.ts` -- per-pane signals for `visibleLens`, tree projection, column IDs.

### Reactive graph

`apps/km-tui/src/state/reactive-graph.ts` -- `reactiveTree()` creates a tree of per-node signal stores with inheritance (e.g., excluded sigils cascade from column to cards).

### OpCtx (action context)

`apps/km-tui/src/tui-context.ts` defines `OpCtx` -- built once per key event from the signal store, passed to all action handlers. Contains: `repo`, `sel`, `cursor`, `rootId`, `foldDepths`, `ui`, `tree` (ViewTreeProjection), `navigator`, `viewNavigation`, `toastQueue`, derived layout (columnId, colIndex, cardIndex).

### TEA state machines (partially implemented)

Target: every subsystem as `(state, op) -> [state, effects]`. Current status:

- **Board reducer** (shipped): `board-reducer.ts` has `applyBoard(state, op)` -- pure function for navigation + edit ops. `board-effect-runner.ts` interprets effects.
- **Text editing**: planned as `PlainText.apply()` (Phase 1) -- currently ref-based imperative
- **UI/Dialogs**: imperative `setUI()` -- target `Dialog.apply()` (Phase 2)
- **Command system**: already correct (key -> command -> op, routes to TEA machines)

TEA middleware shipped in `@silvery/create`: `tea()` Zustand middleware, `createSlice()` for typed handlers, `op()` proxy for interceptable mutations.

### Key files

- `apps/km-tui/src/state/board-app-store.ts` -- main store factory
- `apps/km-tui/src/state/ui-reducer.ts` -- `UIState`, `EditMode`, `PaneUI`
- `apps/km-tui/src/state/reactive.ts` -- per-node signal store
- `apps/km-tui/src/state/signal-store.ts` -- signal store implementation
- `apps/km-tui/src/board/board-reducer.ts` -- pure TEA reducer (`BoardNavState`, `BoardEffect`, `applyBoard`)
- `apps/km-tui/src/board/board-effect-runner.ts` -- effect interpreter
- `docs/design/tea.md` -- design and roadmap

## Input Architecture

**Rule**: discrete keys go through `@km/commands`, NOT component handlers. Only raw text capture (typing in text fields) uses silvery's `useEditContext`/`EditTarget`.

### 5-stage pipeline

```
stdin -> terminal (parse raw bytes to key events)
      -> silvery runtime (term:key event)
      -> board-app.ts handleKey() (event handler)
      -> command-bridge.ts processKeyWithContext()
         -> resolve keybinding (mode + when guards)
         -> execute command -> KmOp
      -> board-actions.ts handleKmOp() (dispatch to handlers)
```

### Dialog/overlay input routing

- `dialog-guard.ts` tracks current input mode (normal, dialog, etc.)
- When a dialog is open (`isDialogOpen()`), keys route to dialog handlers
- `dialogTargetRef` holds the active dialog's input target
- Dialogs use `useInputLayer` for raw text capture (search input, new item name)

### Text input special path

When `sel.text()` is non-null AND `activeEditTargetRef.current` is mounted:
- Command system resolves keys to `TextOp` variants
- `TextOp` is dispatched to the `activeEditTargetRef.current.handleOp()` method
- If `activeEditTargetRef.current` is null but `sel.text()` is set, it's an orphaned state (cleared automatically by command-bridge)

### Reference

- `docs/lessons/input-architecture.md` -- lesson on understanding the architecture before changing it

## Storage Layer

### Packages

- **`@km/storage`** (`packages/km-storage/`): SQLite DB, file I/O, markdown sync, watcher
  - `repo/repo.ts` -- `createRepo()` factory, query + mutation methods
  - `repo/loader.ts` -- DB materialization, schema creation
  - `store/fs.ts` -- filesystem store with watcher integration
  - `watcher.ts` -- `createWatcher()` wrapping `withSync()` for file change detection
  - `watch/` -- FSWatcher implementation, sync logic
  - `markdown/` -- markdown serialization/deserialization
  - `db/` -- SQLite schema, migrations
- **`@km/tree`** (`packages/km-tree/`): tree operations, walk, outliner
  - `walk.ts` -- `KTree.nodes()` with `match`/`into` orthogonal predicates
  - `ops/` -- `insert_node`, `remove_node`, `set_node`, `move_node`, `split_node`, `merge_node`, `set_selection` (7 atomic ops, each invertible)
  - `outliner.ts` -- outliner operations (indent, outdent, split, merge)
  - `selection.ts` -- `Point` (nodeId + offset), `Range` (anchor + focus), `transformPoint`/`transformRange`
  - `body.ts` -- `extractBody()` splits children into body + items
- **`@km/markdown`** (`packages/km-markdown/`): markdown parser (km-ast)
- **`@km/board`** (`packages/km-board/`): board state types, view lens, grid navigator
  - `view-lens.ts` / `visible-lens.ts` -- `ViewLens` computes visible nodes with fold + filter
  - `view-tree-projection.ts` -- `ViewTreeProjection` wraps lens for navigation
  - `grid-navigator.ts` -- `GridNavigator` for spatial navigation in cards view
  - `board-reducer.ts` -- shared board reducer logic

### Bidirectional sync flow

```
TUI edit -> sel.text.edit -> InlineEditField -> onConfirm
         -> repo.updateNode(id, { content })
         -> SQLite write + write queue
         -> markdown serializer -> write .md file
         -> watcher marks in-flight (suppresses re-read)

External .md edit -> FSWatcher detects change
                  -> watcher debounce
                  -> re-parse markdown -> reconcile with DB
                  -> onCommit event -> UI re-renders
```

### Hidden system

`apps/km-tui/src/hidden.ts` -- reads/writes `.km/hidden` file. Nodes are filtered at display time (still exist in SQLite). Supports paths, folder patterns, section slugs, bare slugs.

## Navigation

### Cursor movement

- `j`/`k` -- up/down within column (cards view) or tree-walk (list/columns)
- `h`/`l` -- left/right between columns, or pane switching (board <-> detail)
- `g g` -- jump to first card
- `G` -- jump to last card
- `1`-`9` -- jump to column by number

### Zoom

- `z` -- zoom into cursor node (children become columns). `handleZoomIn()` in `board-actions-zoom.ts`
- `Z` -- zoom out one level. `handleZoomOutwards()`
- `Z Z` -- zoom all the way to board root. `handleZoomToRoot()`
- After zoom, cursor is placed on first card in first column

### Fold/unfold

- `H` -- fold more (reduce visible depth). `reducerApplyFoldLevel()` via board-reducer
- `L` -- unfold more (increase visible depth). `reducerApplyUnfoldLevel()`
- `h` (on card with children) -- fold this node. `reducerApplyFoldNode()`
- `l` (on folded card) -- unfold this node. `reducerApplyUnfoldNode()`
- `zr` -- unfold all recursively. `reducerApplyUnfoldRecursive()`
- Tab -- toggle fold on cursor node. `reducerApplyToggleFold()`
- Sticky folds: per-node pins that survive fold-all/unfold-all (`stickyFolds` Map)

### Boundary behaviors

- Moving past the last card in a column: bell (boundary signal)
- Moving left/right past first/last column: boundary (in cards view), pane switch (if detail pane exists)
- Zoom out at board root: boundary
- All boundary hits produce `OpResult` with `boundary()` type and optional message

### Page navigation

- `Ctrl+d` / `Ctrl+u` -- page down/up
- `applyPageJump()` in board-reducer.ts (pure function)

### Key files

- `apps/km-tui/src/board/board-actions-nav.ts` -- cursor movement handlers
- `apps/km-tui/src/board/board-actions-zoom.ts` -- zoom handlers
- `apps/km-tui/src/navigation/view-navigation.ts` -- per-view-mode navigation policy
- `apps/km-tui/src/navigation/navigate-to-node.ts` -- programmatic navigation
- `apps/km-tui/src/handlers/navigation-handlers.ts` -- tree navigation (prev/next/parent/child)
- `apps/km-tui/src/board/board-reducer.ts` -- pure navigation reducer

## Known UX Issues and Fragile Areas

- **Orphaned text selection**: `sel.text()` non-null but no `activeEditTargetRef.current` mounted (card scrolled off screen). Cleared automatically by command-bridge.
- **Scrollback fragility**: changes must be minimal, /pro-review first, test in real TTY. DECSTBM scroll regions don't work for inline scrollback.
- **colorOverride only handles fg**: decoration attributes (underline, dim, bold, bg) pass through regardless. See `selection-style.ts`.
- **shouldStripColor computed two ways**: `TreeNode` and `NodeView` share no helper for this.
- **`extractBody` edge case**: classifies list items as body when a heading sibling exists; body items get dimmed.
- **`dimColor` doesn't cascade**: must pass `dim` prop explicitly to children (or use `isBody` cascade).
- **`Box theme={{}}` re-resolves all `$tokens`**: don't use for bg-only changes, use `backgroundColor` directly.
- **DB resync**: after materialization/reconciliation changes, users must delete `.km/state.db`.

## Undo System

### Architecture

Two-layer: `UndoStack` (generic entry stack) + `UndoableRepo` (captures repo mutations as ops).

- **`UndoStack`** (`apps/km-tui/src/undo-stack.ts`): array with cursor index, max 100 entries. Each `UndoEntry` has `label`, `undo()`, `redo()`, optional `cursor` and `foldState` snapshots.
- **`UndoableRepo`** (`apps/km-tui/src/undo/undoable-repo.ts`): wraps Repo mutation methods to auto-record `TreeOp` with precomputed inverses. Supports batching (`startBatch`/`endBatch`).
- **`TreeOp`** and `invertTreeOps()` in `apps/km-tui/src/undo/operations.ts`: 7 operation types matching `@km/tree` ops.

### Undo flow

```
User action -> board-actions handler -> undoHandle.startBatch("label")
            -> repo.updateNode() (intercepted by UndoableRepo)
            -> TreeOp recorded with inverse
            -> undoHandle.endBatch()
            -> UndoStack entry created

Ctrl+z -> HISTORY_UNDO -> undoHandle.undo()
       -> apply inverse TreeOps via raw repo
       -> restore cursor + fold state
```

## Test Patterns

### Primary test API: `createTestApp()`

```ts
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

test("buy milk task", async () => {
  using app = createTestApp(item("board", item("Todo", item("Buy milk"))))
  app.press("Enter")
  app.expect("#Buy milk").toExist()
  expect(app.repo.getNode("Buy milk")).toBeDefined()
})
```

### Fixture tiers

1. **Builder**: `item("board", item("col1", item("task1")))` -- stable IDs, precise control
2. **Markdown**: `createTestApp.fromMarkdown("# Todo\n- [ ] Buy milk")` -- readable inline
3. **Vault**: `createTestApp.fromVault("tests/fixtures/kanban-simple")` -- file-based

### Assertion hierarchy (strictest first)

1. **Invariants** -- auto-checked backbone. `SILVERY_STRICT` controlled (0=off, 1=end-of-test, 2=every-action)
2. **Typed assertions** -- `app.card().isCursor`, `app.state`, custom matchers
3. **Snapshots** -- `app.expectSnapshot()` for drift detection

### CSS selector queries (AutoLocator)

`app.expect("#task1").toExist()`, `app.expect("#col1 > #task1")`, `app.expect("[data-cursor]")`, descendant/child/sibling combinators.

### Custom matchers

- **AutoLocator**: `toBeLeftOf`, `toBeAbove`, `toHaveText`, `toContainText`, `toBeVisible`, `toHaveWidth`, `toHaveHeight`, `toBeContainedIn`
- **TestApp**: `toHaveCursorOn`, `toHaveSelection`, `toHaveView`, `toHaveOverlay`, `toHaveBell`, `toHaveNodeCount`

### Typed node handles

`app.card("Buy groceries").isCursor`, `app.column("Todo").visible`, `app.node("task1").exists`

### Declarative state

`app.state` returns `{ cursor, selection, view, overlay, bell, visible }`.

### Termless tests

For visual/terminal bugs, use `createTermless()` -- feeds silvery ANSI through a real terminal emulator:
```ts
using term = createTermless({ cols: 40, rows: 10 })
const handle = await run(<App />, term, { alternateScreen: true })
expect(term.screen).toContainText("BOARD VIEW")
expect(term).toBeInMode("altScreen")
```

### Journey test pattern

3-5 step user stories, one `createTestApp()` per test. Verify BOTH screen output AND persisted data.

### Test organization

Tests in `apps/km-tui/tests/` organized by domain (~112 files, target ~50-60). File suffixes: `.spec.ts` (user journeys), `.test.ts` (internal API), `.slow.test.ts` (>2s), `.bench.ts` (perf), `.fuzz.ts` (chaos).

### Key files

- `apps/km-tui/tests/showcase.spec.ts` -- canonical example of recommended test style
- `apps/km-tui/tests/helpers/test-app.ts` -- `createTestApp()`
- `apps/km-tui/tests/helpers/board-test.ts` -- `item()` builder, `createDriverTest()`
- `apps/km-tui/tests/helpers/board-app.ts` -- `board.app()` DSL for exploration
- `apps/km-tui/tests/helpers/matchers.ts` -- custom vitest matchers
- `apps/km-tui/tests/CLAUDE.md` -- full test reference

## App Source Structure

### `apps/km-tui/src/` directory map

```
board/                       -- Core board logic
  board-app.ts               -- createBoardApp() -- THE public API entry point
  board-actions.ts           -- Main KmOp dispatcher
  board-actions-nav.ts       -- Cursor movement handlers
  board-actions-edit.ts      -- Node CRUD, status, shift operations
  board-actions-zoom.ts      -- Zoom in/out handlers
  board-actions-selection.ts -- Multi-select handlers
  board-actions-find.ts      -- Local find (Ctrl+F)
  board-actions-search-replace.ts -- Search & replace
  board-reducer.ts           -- Pure TEA reducer (BoardNavState, BoardEffect)
  board-effect-runner.ts     -- Effect interpreter
  board-tree-ops.ts          -- boardSplit, boardMergeBackward/Forward
  board-types.ts             -- TUI board types, re-exports @km/board
  board-pills.ts             -- Visual pills (project, tag badges)
  board-selection-helpers.ts -- Selection utilities
  click-to-cursor.ts         -- Mouse click -> cursor position
  command-bridge.ts          -- @km/commands -> TUI bridge
  normalize-plugins.ts       -- Effect normalization + validation
  position-resolver.ts       -- Verb x location resolution

keyboard/                    -- Keyboard operation handlers
  keyboard-card-ops.ts       -- indentNode, outdentNode, moveCardInColumn/ToColumn
  keyboard-helpers.ts        -- saveNavHistory, navigation utilities

handlers/                    -- Event handlers
  mouse-handler.ts           -- Mouse event processing
  navigation-handlers.ts     -- Tree-based navigation (prev/next/parent/child)
  paste-handler.ts           -- Clipboard paste handling

navigation/                  -- Navigation subsystem
  view-navigation.ts         -- ViewNavigation interface + per-mode implementations
  navigate-to-node.ts        -- Programmatic navigation to a specific node
  sibling-index.ts           -- indexOfChild helper
  path.ts                    -- Path-based navigation

state/                       -- State management
  board-app-store.ts         -- Main store factory (BoardAppStore)
  ui-reducer.ts              -- UIState, EditMode, PaneUI, SyncEvent
  ui-context.tsx             -- TreeRenderProvider, deriveTreeConfig
  reactive.ts                -- Per-node signal store (NodeStore)
  reactive-graph.ts          -- reactiveTree() for signal inheritance
  signal-store.ts            -- Signal store implementation
  store-context.tsx          -- React context for store
  pane-signals.ts            -- Per-pane signals (visibleLens, tree projection)
  selection-adapter.ts       -- Bridges @silvery/selection to km tree
  cursor-depth.ts            -- CursorDepth classification
  raw-signals.ts             -- Low-level signal utilities
  capture-tree.ts            -- Tree state capture for undo

views/                       -- View components
  Board.tsx                  -- Thin connector (controller -> BoardView)
  BoardView.tsx              -- Pure render layer (dispatches to view-mode components)
  useBoardController.ts      -- Lifecycle effects, signal subscriptions
  CardColumn.tsx             -- Card column (cards view)
  ColumnsView.tsx            -- Columns view
  ListView.tsx               -- List view
  TabsView.tsx               -- Tabs view
  DetailView.tsx             -- Detail/document view
  NodeView.tsx               -- Individual node rendering
  TreeNode.tsx               -- Tree node component
  InlineEditField.tsx        -- Inline text editor
  BodyEditField.tsx          -- Body block editor
  SearchDialog.tsx           -- Search dialog
  NewItemDialog.tsx          -- New item creation dialog
  ItemPicker.tsx             -- Item picker (project/tag/assignee)
  FilterDialog.tsx           -- Property filter dialog
  FindBar.tsx                -- Local find bar (Ctrl+F)
  HelpOverlay.tsx            -- Help overlay (?)
  CommandBox.tsx             -- Command palette
  Omnibox.tsx                -- Unified search/command input
  ConsoleModal.tsx           -- Console/debug overlay
  TopBar.tsx                 -- Top status bar
  PaneBar.tsx                -- Pane label bar
  ToastStack.tsx             -- Toast notification stack
  WorkspaceView.tsx          -- Workspace (multi-pane) layout
  WorkspaceChrome.tsx        -- Workspace chrome/decoration
  selection-style.ts         -- Selection + inline styling rules and precedence
  board-layout.ts            -- Column width computation
  board-effects.ts           -- Side effect factories
  detail-pane-helpers.ts     -- Detail pane rendering helpers
  detail-pane-items.ts       -- Detail metadata + content items
  symlink-display.ts         -- Symlink resolution for display
  shared-components.tsx      -- MemoizedTreeCard, MemoizedColumnHeader

hooks/                       -- React hooks
  use-signal.ts              -- useSignal(), usePaneSignals(), useChildIdsSignal()
  use-columns.ts             -- buildNodeIndexFromTree, deriveCursorIndices
  use-children.ts            -- useChildren hook
  use-card-interaction.tsx   -- Card mouse interaction
  use-dialog-input.ts        -- Dialog input handling
  use-link-open.ts           -- Open links
  use-repo-effect.ts         -- Repo-level effects
  use-component-timing.ts    -- Component render timing
  use-suspense-loader.ts     -- Suspense loading states
  use-status-animations.ts   -- Status bar animations

text/                        -- Text rendering pipeline
  InlineComponents.tsx       -- Inline rich text components (WikiLink, Code, etc.)
  inline-parser.ts           -- Inline markdown parser
  inline-ast-types.ts        -- Inline AST types
  text-pipeline.ts           -- Text rendering pipeline
  format.ts                  -- Text formatting
  colors.ts                  -- Color utilities
  rich.ts                    -- Rich text helpers
  search-decorations.ts      -- Search match highlighting
  url-metadata.ts            -- URL metadata extraction

undo/                        -- Undo system
  undoable-repo.ts           -- UndoableRepo wrapping Repo
  operations.ts              -- TreeOp types and invertTreeOps()

layout/                      -- Layout system
  factory.tsx                -- Layout factory
  silvery.ts                 -- Silvery layout integration
  path.ts                    -- Path rendering

explore/                     -- AI exploration
  runner.ts                  -- Exploration runner
  invariants.ts              -- Exploration invariants

-- Top-level files
driver.ts                    -- Board driver for tests/AI automation
tui-context.ts               -- OpCtx (action context)
tui.tsx                      -- TUI entry point
action-handlers.ts           -- assertNever for exhaustive KmOp
dialog-guard.ts              -- Dialog input mode tracking
dialog-target.ts             -- dialogTargetRef
hidden.ts                    -- Hidden system (.km/hidden)
invariants.ts                -- Runtime invariant checks
sticky-folds.ts              -- Sticky fold persistence
config-persist.ts            -- Config persistence
workspace-persist.ts         -- Workspace state persistence
layout-context.tsx           -- Layout context
layout-helpers.ts            -- Split layout helpers
pane-context.tsx             -- Pane context
repo-context.tsx             -- Repo React context
services-context.tsx         -- Services (toast, jobs, undo) context
state.ts                     -- getNodeDisplayName, helpers
testing.ts                   -- Test utilities
theme.ts                     -- Theme tokens
types.ts                     -- Shared types (ViewMode re-export)
undo-stack.ts                -- UndoStack (generic)
log.ts                       -- Logger setup
icons.ts                     -- Icon definitions
internal-link.ts             -- Internal link handling
```

### Package dependency graph

```
@km/core          -- KNode, ItemData, Position, TaskStatus (zero deps)
@km/tree          -- Tree ops, walk, outliner, selection (depends on core)
@km/markdown      -- Parser: markdown <-> km-ast (depends on core, tree)
@km/board         -- Board types, view lens, grid navigator (depends on core, tree)
@km/commands      -- Command system, keybindings (depends on core, board)
@km/storage       -- Repo, SQLite, watcher, sync (depends on core, tree, markdown)
@silvery/selection -- Selection store (alien-signals, independent)
km-tui (app)      -- Everything above + silvery + React
```
