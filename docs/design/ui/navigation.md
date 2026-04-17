# Navigation Architecture

How km handles cursor movement across 8 distinct navigation paths, spread across 4 files.

## Overview

All navigation starts from a keypress that maps to a command, which dispatches a `CURSOR_MOVE` (or similar) action. The `handleCursorMove` dispatcher in `board-actions-nav.ts` examines the direction string and routes to the appropriate handler. Five of the eight paths use the ViewTree as their source of truth; the remaining three use direct Repo walks (legacy).

Key files:

- `board-actions-nav.ts` — top-level dispatcher + outline/block/tree/history/sibling handlers
- `view-navigation.ts` — ViewNavigation interface + Cards/Detail view implementations (vnNavigateVertical, vnNavigateHorizontal)
- `board-actions.ts` — edit-mode block navigation (handleEditBlockNavigate, findAdjacentEditNode)
- `navigation-handlers.ts` — pure tree navigation (handleTreeNavigation)

## Shared Concepts

### NavState

State passed to ViewNavigation for resolving movement. Defined in `view-navigation.ts`:

- `cursor` (`sel.node.cursor()`) — current cursor position
- `rootId` — zoom root (navigation boundary)
- `foldDepths` — Map of node ID to fold depth budget
- `collapsedNodes` — Set of collapsed column IDs
- `cursorCardNodeId` — embed-aware card boundary hint
- `viewTree` / `viewIndex` — the ViewNode tree and O(1) lookup index

### ViewNode Tree

The single source of truth for visual structure. Built by `buildViewTree()` in `packages/km-board/src/view-tree.ts`. Each node has a `role` (board, column, body-column, card, subitem) determined by tree position. Hidden/collapsed nodes are pruned at construction time, so navigation over this tree exactly matches what renders on screen. See `docs/design/ui/visibility.md`.

### GridNavigator

Tracks screen-space positions of rendered items. Provides:

- `stickyY` / `stickyX` — remembered cursor coordinates for cross-axis navigation (like vim's curswant)
- `findItemAtY(section, y)` — Y-position-to-card-index lookup for cross-column targeting
- `setDeferredNavigation()` / `setDeferredResolve()` — deferred resolution when target column is off-screen

### CursorClassification

Derived from ViewNode tree: `{ cursorCardNodeId, cursorColumnNodeId }` + `sel.kind` (selection level). Tells the system whether the cursor is at board, column, or card level. See [selection-model.md](selection-model.md).

### Board Reducer (TEA)

Pure navigation functions in `board-reducer.ts` follow the TEA shape: `(BoardNavState, op) -> { state, effects }`. Three thin wrappers delegate to a unified `applyListNav`:

- `applyBlockNav` — spatial block navigation
- `applyOutlineNav` — outline sub-item navigation
- `applyPageJump` — page-sized jumps

## The 8 Navigation Paths

### Path 1: Vertical Navigation (j/k, arrows)

- **Keys**: `j` / `k`, `ArrowDown` / `ArrowUp`
- **Command**: `cursor_down` / `cursor_up` -> `CURSOR_MOVE` dir=`"down"` / `"up"`
- **Entry**: `handleCursorMove` -> `handleVerticalNav`
- **Implementation**: Calls `viewNavigation.navigate(dir, navState, repo, navigator)`, which dispatches to `vnNavigateVertical` for Cards view
- **Source of truth**: ViewTree
- **Data flow**:
  1. Look up current node in ViewNode index
  2. Branch on `vn.role`: board -> first column/body card; column -> first card or board; card -> sibling card or column header; subitem -> DFS walk within card then next card
  3. For column-to-board transitions, saves `stickyX` (structural column index)
  4. For board-to-column transitions, restores `stickyX`
  5. Returns target nodeId; caller dispatches `SELECT`
- **Output**: Clears `stickyY` after move

### Path 2: Horizontal Navigation (h/l, arrows)

- **Keys**: `h` / `l`, `ArrowLeft` / `ArrowRight`
- **Command**: `cursor_left` / `cursor_right` -> `CURSOR_MOVE` dir=`"left"` / `"right"`
- **Entry**: `handleCursorMove` -> `handleHorizontalNav`
- **Implementation**: Multi-phase:
  1. Detail pane boundary: `h` from detail pane exits to parent board pane
  2. Column header boundary: `h` at leftmost card selects column header
  3. Lazy-captures `stickyY` from current card's mid-Y position
  4. Calls `viewNavigation.navigate()` -> `vnNavigateHorizontal` for cross-column movement
  5. Right boundary: enters detail pane if one exists
- **Source of truth**: ViewTree (via `vnNavigateHorizontal`)
- **Data flow**:
  1. `vnNavigateHorizontal` resolves containing column via `vnFindColumn`
  2. Finds target column in structural columns list (body column is special — always leftmost)
  3. `vnNavigateToColumn` uses `stickyY` + `GridNavigator.findItemAtY` to land on the vertically-closest card in the target column
  4. When target column is off-screen, uses deferred navigation (resolved during silvery Phase 2.7)
- **Output**: Clears `stickyX`; preserves `stickyY` across columns

### Path 3: Block Navigation (J/K, Ctrl+N/P)

- **Keys**: `Shift+J` / `Shift+K`, `Ctrl+N` / `Ctrl+P` (in normal mode)
- **Command**: `block_nav_down` / `block_nav_up` -> `CURSOR_MOVE` dir=`"in"` / `"out"`
- **Entry**: `handleCursorMove` -> `handleBlockNav`
- **Implementation**: Flat spatial navigation through all visible blocks in the current column
- **Source of truth**: ViewTree (via `getVisibleColumnBlocks`)
- **Data flow**:
  1. `getVisibleColumnBlocks` walks the ViewNode subtree for the current column in DFS order, collecting all node IDs: column header, cards, sub-items
  2. Extracts `BoardNavState` and calls `applyBlockNav` (pure reducer)
  3. `applyBlockNav` delegates to `applyListNav` — simple index arithmetic on the flat ID list
  4. `runBoardEffects` applies the resulting SELECT effect
- **Output**: Clears `stickyY`

### Path 4: Outline Navigation (prev/next inside a card)

- **Keys**: Same as vertical nav (j/k) but intercepted when cursor is inside a card's descendants
- **Command**: `CURSOR_MOVE` dir=`"prev"` / `"next"` (dispatched contextually)
- **Entry**: `handleCursorMove` -> `handleOutlineNav` (when `inOutlineMode` is true: cursor is on a card descendant)
- **Implementation**: Flat navigation through visible descendants of the current card
- **Source of truth**: ViewTree (via `getVisibleCardDescendants`)
- **Data flow**:
  1. `getVisibleCardDescendants` walks the ViewNode subtree for the containing card in DFS order
  2. Extracts `BoardNavState` and calls `applyOutlineNav` (pure reducer)
  3. `applyOutlineNav` delegates to `applyListNav`
  4. `runBoardEffects` applies the resulting SELECT effect
- **Output**: No sticky changes

### Path 5: Tree Navigation (first/last/child/parent)

- **Keys**: `g` / `g g` (first), `Shift+G` / `g Shift+G` (last)
- **Command**: `cursor_first` / `cursor_last` -> `CURSOR_MOVE` dir=`"first"` / `"last"`
- **Entry**: `handleCursorMove` -> `handleTreeNav`
- **Implementation**: Delegates to `handleTreeNavigation` in `navigation-handlers.ts`
- **Source of truth**: Repo (direct `repo.getChildren` calls) -- LEGACY
- **Data flow**:
  1. `handleTreeNavigation` switches on direction: next/prev (sibling), first/last (boundary sibling), child (first child), parent (parent node)
  2. Uses `repo.getChildren(parentId)` for sibling lookup, `repo.getNode(id)` for parent traversal
  3. Respects `foldDepths` for child direction (folded nodes block descent)
  4. Respects `rootId` for parent direction (zoom root is navigation boundary)
  5. Returns target nodeId; caller dispatches `SELECT`
- **Output**: Clears `stickyY`
- **Note**: This is the only normal-mode path that walks Repo instead of ViewTree. See planned cleanup below.

### Path 6: Edit Block Navigation (Ctrl+N/P in edit mode)

- **Keys**: `Ctrl+N` / `Ctrl+P` (when inline editing)
- **Command**: `edit_block.navigate_down` / `edit_block.navigate_up` -> `EDIT_BLOCK_NAVIGATE`
- **Entry**: `handleEditAction` -> `handleEditBlockNavigate` in `board-actions.ts`
- **Implementation**: Navigates between editable blocks (title + body paragraphs) within and across nodes
- **Source of truth**: Repo (direct `repo.getChildren` + `extractBody` calls) -- LEGACY
- **Data flow**:
  1. Resolves body block nodes to their parent heading (body blocks are traversed via `blockIndex` on the parent)
  2. Computes block count: 1 (title) + body.length
  3. If next block is within same node: saves current block, changes `blockIndex` on `sel.text()` (inline edit block)
  4. If past node boundary going down: descends into first child's items (via `extractBody().items`)
  5. If past node boundary going up: enters previous sibling's deepest last descendant (via `findDeepestLast`)
  6. If no adjacent node found and `exitAtBoundary` is true (arrow key overflow): exits edit mode and falls through to `handleCursorMove`
  7. `findAdjacentEditNode` does the cross-node walk: checks `col.cardNodes` for card-level siblings, then `extractBody().items` for structural siblings, then recurses up to parent
- **Output**: Preserves `stickyX` (cursor column position) across block transitions

### Path 7: Page Jump (Ctrl+D/U, PageDown/Up)

- **Keys**: `Ctrl+D` / `Ctrl+U`, `PageDown` / `PageUp`
- **Command**: `page_down` / `page_up` -> `PAGE_JUMP`
- **Entry**: `handleNavAction` -> `handlePageJump` in `board-actions-nav.ts`
- **Implementation**: Jumps cursor by half a page worth of cards in the current column
- **Source of truth**: Column's `cardNodes` array (from `ColumnSnapshot`) -- MIXED
- **Data flow**:
  1. Computes `pageSize` from terminal dimensions: `max(5, floor((rows - 4) / 2))`
  2. Gets card IDs from `col.cardNodes` (derived from Repo but only top-level cards, not subitems)
  3. Calls `applyPageJump` (pure reducer -> `applyListNav` with `step=pageSize`, `clearScrollAnchor=true`)
  4. `runBoardEffects` applies SELECT + SCROLL_ANCHOR_CLEAR effects
- **Output**: No sticky changes

### Path 8: History and Sibling Board Navigation

- **Keys**: `{` / `}` (Shift+[/]), `Cmd+[` / `Cmd+]` (history); `Ctrl+J` / `Ctrl+K` (sibling boards)
- **Commands**: `nav_back` / `nav_forward`, `sibling_board_next` / `sibling_board_prev`
- **Entry**: `handleNavAction` -> `handleNavBack` / `handleNavForward` / `handleNavSiblingBoard`
- **Implementation**:
  - History: walks `ui.navHistory` array by delta (-1 for back, +1 for forward), dispatches `ZOOM_IN` with saved rootId/cursorNodeId, restores sel.node.ids (multi-selection) and foldDepths
  - Sibling board: finds siblings of current root via `repo.getChildren(parent)`, wraps around at boundaries, saves history before navigating, dispatches `ZOOM_IN` to sibling
- **Source of truth**: `navHistory` array (history); Repo parent/sibling lookup (sibling boards)
- **Output**: History restores full state; sibling board clears selection

## ViewTree vs Repo: Status by Path

Paths that use ViewTree navigate exactly what the user sees. Repo-based paths can diverge when nodes are hidden by visibility rules.

- ViewTree (correct): Vertical, Horizontal, Block, Outline
- Repo (legacy): Tree, Edit Block
- Mixed: Page Jump (uses `col.cardNodes` which is derived from Repo)
- N/A: History/Sibling (these change roots, not cursor-within-board)

## Keypress to Cursor Update Flow

    keypress (j / k / h / l / J / K / etc.)
        |
        v
    keybinding resolver (km-commands/keybindings.ts)
        |  maps key + when-guard -> commandId
        v
    command definition (km-commands/commands/navigation.ts)
        |  produces BoardReducerOp: { type: "CURSOR_MOVE", dir: "..." }
        v
    handleNavAction (board-actions.ts)
        |  dispatches on action.type
        v
    handleCursorMove (board-actions-nav.ts)
        |  dispatches on dir string
        |
        +-- "up"/"down" -----------> handleVerticalNav
        |                               |-> viewNavigation.navigate()
        |                               |-> vnNavigateVertical (ViewTree)
        |
        +-- "left"/"right" --------> handleHorizontalNav
        |                               |-> detail pane boundary checks
        |                               |-> viewNavigation.navigate()
        |                               |-> vnNavigateHorizontal (ViewTree)
        |                               |-> GridNavigator stickyY targeting
        |
        +-- "in"/"out" ------------> handleBlockNav
        |                               |-> getVisibleColumnBlocks (ViewTree DFS)
        |                               |-> applyBlockNav (pure reducer)
        |
        +-- "prev"/"next" ---------> handleOutlineNav (if inOutlineMode)
        |   (inside card)               |-> getVisibleCardDescendants (ViewTree DFS)
        |                               |-> applyOutlineNav (pure reducer)
        |
        +-- "first"/"last"/etc. ---> handleTreeNav
                                        |-> handleTreeNavigation (Repo walks)

    (separate from CURSOR_MOVE)

    EDIT_BLOCK_NAVIGATE ---------> handleEditBlockNavigate
        |                               |-> block index within node
        |                               |-> findAdjacentEditNode (Repo walks)
        |                               |-> findDeepestLast (Repo DFS)
        v
    PAGE_JUMP -------------------> handlePageJump
        |                               |-> col.cardNodes
        |                               |-> applyPageJump (pure reducer)
        v
    NAV_BACK / NAV_FORWARD ------> navigateHistory
        |                               |-> navHistory array + ZOOM_IN
        v
    NAV_SIBLING_BOARD -----------> handleNavSiblingBoard
                                        |-> repo.getChildren(parent) + ZOOM_IN

## Detail View Navigation

The Detail view (right pane) has its own `ViewNavigation` implementation in `createDetailViewNavigation`. It uses a flat navigation model:

- j/k navigates: H1 root -> metadata rows -> direct children -> nested children (DFS)
- h exits to the parent board pane (handled by `handleHorizontalNav` boundary logic)
- l is a boundary (no rightward movement within detail)

This is implemented via direct Repo walks (`repo.getChildren`, `repo.getNode`), not ViewTree. It navigates metadata virtual rows (`DETAIL_META_PREFIX` + key) that have no ViewNode representation.

## Known Redundancies and Planned Cleanup

Epic: `km-tui.nav-clarity` (P2)

1. **Edit navigation uses Repo walks** (bead: `km-tui.edit-nav-viewtree`). `findAdjacentEditNode` and `findDeepestLast` walk the Repo directly, which can diverge from what's rendered. Should migrate to ViewTree traversal like block/outline nav already do.

2. **Three list-nav wrappers are near-identical** (bead: `km-tui.unify-list-nav`). `applyBlockNav`, `applyOutlineNav`, and `applyPageJump` all delegate to `applyListNav` with slightly different parameters. The dispatch layer could call `applyListNav` directly, but the wrappers provide call-site readability and map to the `BoardNavOp` discriminated union.

3. **Tree navigation ignores ViewTree**. `handleTreeNavigation` in `navigation-handlers.ts` uses `repo.getChildren` for sibling/parent/child lookups. This works correctly today because tree nav directions (first/last/child/parent) don't need visibility filtering in the same way spatial nav does, but unifying on ViewTree would reduce the number of traversal strategies.

4. **Page jump uses col.cardNodes**. This is a ColumnSnapshot-derived list, not a ViewTree walk. It only includes top-level cards (not subitems), which is intentional for page-sized jumps, but the data source is inconsistent with block/outline nav.

5. **Detail view navigates via Repo**. The detail pane's vertical navigation walks `repo.getChildren` directly. Since detail has virtual metadata rows with no ViewNode representation, migrating to ViewTree would require extending ViewNode to support virtual items.

---

## Design Principles (merged from design/ui/navigation.md)

Design document for km's navigation and rendering model. Informed by SlateJS (Path arithmetic) and Decker (DOM-based visual navigation, store only IDs).

## Core concepts

### Path

A `Path` is a `number[]` describing a node's position in the tree by sibling indices at each level. Aligned with SlateJS terminology.

```
[]        = board level (no selection)
[2]       = 3rd child of root
[2, 5]    = 6th child of that node
[2, 5, 0] = 1st child of that node
```

Path is the **structural** coordinate system — it describes tree position, not visual role. What a given depth means visually (column, card, block, etc.) depends entirely on the view mode. Path doesn't know or care about visual types.

Derived lazily from `sel.node.cursor` (was `cursorNodeId`) via cache lookups (no SQL after first access).

Path helpers (pure arithmetic, no repo):
- `Path.parent(path)` — `[2, 5, 0]` -> `[2, 5]`
- `Path.next(path)` — `[2, 5]` -> `[2, 6]`
- `Path.previous(path)` — `[2, 5]` -> `[2, 4]`
- `Path.ancestors(path)` — all prefixes
- `Path.compare(a, b)` — lexicographic ordering
- `Path.isAncestor(a, b)` — prefix check
- `Path.depth(path)` — `path.length`

Repo-aware resolution:
- `NodePath.pathOf(repo, rootId, nodeId)` — cursor -> path
- `NodePath.nodeAt(repo, rootId, path)` — path -> node
- `NodePath.siblings(repo, rootId, path)` — siblings at path level

### Per-node children cache

The repo caches `getChildren(parentId)` results per parent node. Populated lazily on first access. Surgical invalidation:

| Mutation | Invalidate |
|----------|-----------|
| `addNode(parentId)` | parentId |
| `deleteNode(id)` | node's parent |
| `moveNode(id, newParent)` | old parent + new parent |
| `updateNode(id, changes)` | nothing |

All consumers benefit: rendering, navigation, path derivation. After first render, all `getChildren` calls are cache hits. Path derivation becomes pure map lookups.

### All navigation is visual

hjkl always means "move to the visually adjacent node":

| Key | Meaning |
|-----|---------|
| j   | Visually below |
| k   | Visually above |
| h   | Visually left |
| l   | Visually right |

It happens that j/k matches structural sibling order in current views. But the model doesn't assume this — the view resolves direction to target.

### Views own navigation policy

Each view implements:

```ts
interface ViewNavigation {
  navigate(dir: "up" | "down" | "left" | "right", cursor: string, curswantY: number): string | null
}
```

The navigation layer asks "where should I go?", the view answers with a nodeId.

### curswantY

Sticky vertical position (same concept as vim's curswant). Set by j/k movement, preserved across h/l movement. Used for ALL cross-group lateral navigation.

## Visual model

Every node is rendered as a visual box. The key distinction is whether a node's box **wraps its children**:

- **Card**: box contains title + body + sub-items. Children rendered inside the card boundary.
- **Everything else** (board, column, block): box is just the node itself (title, maybe body). Children are rendered as independent items outside the box.

Cards are the only visual container. "Inside a card" is a real visual state — blocks are spatially within the card boundary. "Inside a column" isn't — you're just among its children, which are independent items.

The one consequence: **h/l from inside a card hits the card boundary and selects the card.** That's the only special behavior cards create — lateral movement can't pass through the card's visual box without selecting the card first. j/k is unaffected.

## The navigation rule

One rule for all directions, all views:

**Move to the next selectable node in that direction.**

The selectable set isn't static — a modifier or mode change can make deeper nodes selectable. The rule doesn't change, just the set of selectable nodes.

## Flows

### Key input

```
keypress
  → view.navigate(dir, sel.node.cursor, curswantY)
    → repo.getChildren (cache hits) to find next selectable node
  → store.set({ sel.node.cursor: newId })
```

### Render

```
sel.node.cursor changed → Zustand notifies
  → Board re-renders
    → useChildren(repo, rootId)    — cache hit
    → Column: useChildren(repo, colId)  — cache hit
    → Card: useChildren(repo, cardId)   — cache hit
    → isSelected via store selector (per component)
    → React.memo: only old + new cursor nodes re-render
  → silvery: reconcile → yoga → paint → diff → output
```

### Mutation

```
action → repo.mutate(...)
  → cache: surgical invalidation (affected parents only)
  → store.set({ sel.node.cursor: targetId })
  → re-render
    → useChildren: cache miss for affected parents, hits for rest
```

### What's gone

No `recomputeLayout()`. No `deriveCursorPosition()`. No `updateLayout()` effect. No `useColumns`. No `ColumnsLayout`/`ColumnState`/`CardState` types. No `colIndex`/`cardIndex`/`sel.kind` (was `selectionLevel`). No store→React→store feedback loop.

## Store

Minimal — only primary state, no derived fields:

```ts
cursor: string  // sel.node.cursor()
rootId: string | null
foldDepths: Map<string, number>
viewMode: ViewMode
```

UI state (isSelected, isFolded, etc.) consumed via store selectors in each component.

## Future: selection

Current `sel.node.cursor` (was `cursorNodeId`) is a degenerate case of:

```ts
interface Selection {
  anchor: Path   // where selection started
  focus: Path    // where cursor is now
}
```

Single cursor: anchor === focus. Range select: anchor stays, focus moves. Visual mode: anchor fixed, focus follows navigation. Path.compare gives ordering for "all nodes between anchor and focus."

## References

- **SlateJS**: Path type, Node helpers, lazy derivation. No pre-computed layout cache.
- **Decker**: DOM bounding-box navigation, `getInVisualDirection()`, store only IDs.
- **Vim**: curswant (sticky column during vertical movement — we use sticky Y for lateral movement).

