# Selection Landscape — ARCHIVED 2026-04-17

> **Research artifact**, not active design. Comparison with tldraw, ProseMirror, Excalidraw, Figma, VS Code, DOM API. Pull back from archive if a future selection redesign needs the comparative input.

# Selection Landscape

Industry reference for selection and manipulation systems. Covers what exists across tree UIs, canvas/drawing tools, text editors, and diagramming tools. Used to validate that `@silvery/selection` is extensible to these use cases.

See [selection-model.md](selection-model.md) for the implementation design.

## Slug naming convention

`category-domain-action`. Category = the table. Domain = `node`, `text`, `cell`, `path`, `edge` (omitted when general). Action = what it does.

## Selection state (`select-*`)

| Slug | Description | State shape |
|---|---|---|
| `select-set` | One or more nodes/shapes | `cursor + anchor + selected: OrderedSet<ID>` |
| `select-cell-rect` | Rectangular cell region | `anchorCell + cursorCell → rect` |
| `select-gap` | Gap cursor between blocks | `position between nodes` |

Cardinality helpers (not separate modes): empty = none, size 1 = single, size > 1 = multi, set = scope = all.

## Sub-selection (`sub-*`)

| Slug | Description | State shape |
|---|---|---|
| `sub-text` | Text caret or range | `nodeId + cursor + anchor?` (absent = caret) |
| `sub-text-multi` | Multiple text cursors | `(nodeId + cursor + anchor?)[]` |
| `sub-text-rect` | Rectangular text selection | `nodeId + rect` |
| `sub-path` | Vector path points/segments | `shapeId + pointIds: Set` |
| `sub-edge` | Edge endpoint or bend | `edgeId + end? + bendIds?` |
| `sub-crop` | Image/frame crop region | `objectId + cropRect` |

## Pointer states (`ptr-*`)

| Slug | Trigger | Resolves to | Modifiers |
|---|---|---|---|
| `ptr-idle` | — | — | |
| `ptr-pointing-empty` | Pointer-down on empty | `ptr-node-rect` (drag) or deselect (click) | |
| `ptr-pointing-node` | Pointer-down on unselected | `ptr-node-translate` (drag) or select (click) | Cmd = toggle, Shift = extend |
| `ptr-pointing-selection` | Pointer-down on selected | `ptr-node-translate` (drag) or reselect (click) | |
| `ptr-pointing-handle` | Pointer-down on handle | `ptr-node-resize` or `ptr-node-rotate` (drag) | |
| `ptr-node-rect` | Drag from empty | Rectangle + hit set | Cmd = toggle (XOR) |
| `ptr-node-translate` | Drag selected | Offset delta | Opt = copy, Cmd+Opt = link |
| `ptr-node-resize` | Drag resize handle | Scale transform | Shift = aspect, Opt = center |
| `ptr-node-rotate` | Drag rotation handle | Angle from center | Shift = snap 15° |
| `ptr-node-extend` | Shift+click | Range preview | |
| `ptr-text-select` | Drag in text | Text range preview | |
| `ptr-text-drag` | Drag selected text | Moving text range | |
| `ptr-edge-route` | Drag edge endpoint | Snap to ports | |

## Hit targets (`hit-*`)

| Slug | Resolves to | Detail |
|---|---|---|
| `hit-empty` | Empty space | |
| `hit-node` | Node/shape body | |
| `hit-text` | Text region | Carries `nodeId + blockId + offset` |
| `hit-handle` | Resize handle | Carries `corner` |
| `hit-rotate` | Rotation handle | |
| `hit-path` | Path point or segment | Carries `pointId` or `segmentId` |
| `hit-edge` | Edge endpoint or bend | Carries `end` or `bendId` |
| `hit-port` | Connection port | Carries `nodeId + portId` |
| `hit-bounds` | Selection bounding box | |
| `hit-locked` | Locked node | Hittable but not selectable |
| `hit-hidden` | Hidden node | Not hittable |

## Commands (`cmd-*`)

Selection commands:

| Slug | Default binding | Effect |
|---|---|---|
| `cmd-node-cursor` | j / k / Arrow / Tab | Move node cursor |
| `cmd-node-extend` | Shift+cursor keys | Extend range from anchor |
| `cmd-node-toggle` | Cmd+click | Add/remove from selection |
| `cmd-node-select-all` | Cmd+A | Select all in scope |
| `cmd-node-expand` | A / Shift+Alt+Right | Progressive expand |
| `cmd-text-select` | Arrow / Shift+Arrow (in text mode) | Move caret or extend range |
| `cmd-enter` | Enter / double-click | Enter edit / scope |
| `cmd-exit-sub` | Escape (in edit mode) | Exit sub-selection |
| `cmd-root-up` | Escape (in scope) | Exit current scope |
| `cmd-cancel` | Escape (during drag) | Cancel active drag |
| `cmd-deselect` | Escape (no scope, no sub) | Clear selection |
| `cmd-select-behind` | Alt+click / repeated click | Cycle stacked hits |

Selection-adjacent (use selection, don't change it): `cmd-delete`, `cmd-clipboard`, `cmd-duplicate`, `cmd-undo`, `cmd-node-group`, `cmd-node-lock`, `cmd-node-reorder`, `cmd-context-menu`.

## Modifier effects

| Modifier | Selection effect | Manipulation effect |
|---|---|---|
| **Shift** | Extend range | Constrain axis, preserve aspect, snap angle |
| **Ctrl** | — | Fine-grained, disable snap |
| **Cmd/Meta** | Toggle (XOR) | Link-drag (with Opt) |
| **Opt/Alt** | — | Duplicate on drag, resize from center |

Platform: Cmd = Meta on macOS, Ctrl on Windows/Linux.

## Cross-cutting (`xc-*`)

| Slug | What it means |
|---|---|
| `xc-undo` | Selection state captured in transactions |
| `xc-clipboard` | Copy/cut reads selection, paste targets it |
| `xc-a11y` | Selection announced, focus ring visible |
| `xc-ime` | Input method composition during text editing |
| `xc-collab` | Remote cursors/selections from other users |
| `xc-snap` | Snap to grid/edges/centers during manipulation |
| `xc-constraints` | Aspect ratio, position constraints during resize |
| `xc-virtualization` | Offscreen items selected but not rendered |
| `xc-locked` | Locked items: selectable via panel, not directly transformable |
| `xc-hidden` | Hidden items: not hittable, not rendered |
| `xc-order` | Z-order, chronological, tree order |
| `xc-autopan` | Auto-scroll/pan during drag, area, or text selection |

## Design notes for future extensions

### No core design impact (additive)

- **`xc-autopan`** — view concern. Store doesn't know about viewport.
- **`xc-snap`** / **`xc-constraints`** — manipulation concern. Not selection.
- **`xc-collab`** — remote cursors are separate data (decorations/overlays), not the local store.
- **`xc-ime`** — text engine handles composition. Selection just sees cursor/anchor updates.
- **`cmd-select-behind`** — app hit-test logic. Calls `sel.node.select` with a different target.
- **`cmd-context-menu`** — app policy. Calls existing store ops.
- **Canvas** — spatial indexing, z-order, selectedRoots normalization. App code over the same store.
- **Bookmarks for undo** — ProseMirror pattern for mapping selection through doc changes.

### Design-noted (minor type changes when needed)

- **`xc-virtualization`** — offscreen items stay selected when unmounted. Reconciliation prunes deleted nodes, not virtualized ones. Accounted for in reconciliation.
- **`select-gap`** — gap cursor between nodes. Widens `sel.node.cursor` from `ID | null` to `ID | GapPosition | null`. Only needed for ProseMirror-style doc editors.
- **`sub-text-multi`** — multiple text cursors. Changes TextEdit from `{ cursor, anchor? }` to `{ cursors: [...] }`. VS Code-level feature.
- **`sub-text-rect`** — rectangular/column text selection. Different state shape. Very niche.

## Systems studied

### tldraw (canvas drawing — the gold standard)

Source: github.com/tldraw/tldraw v4.5

**Selection state** — `TLInstancePageState` (per-page, per-tab):
- `selectedShapeIds: TLShapeId[]` — the core selection (array, not set)
- `hoveredShapeId: TLShapeId | null` — throttled at 32ms
- `editingShapeId: TLShapeId | null` — shape in edit mode
- `croppingShapeId: TLShapeId | null`
- `focusedGroupId: TLShapeId | null` — group drill-in scope

**Pointer state machine** — hierarchical `StateNode` classes. SelectTool has 18 child states:
- Pointing: `pointing_canvas`, `pointing_shape`, `pointing_selection`, `pointing_resize_handle`, `pointing_rotate_handle`, `pointing_handle`, `pointing_arrow_label`
- Active: `brushing`, `scribble_brushing`, `translating`, `resizing`, `rotating`, `editing_shape`
- Sub-state machine: `crop` with `crop.idle`, `crop.pointing_crop`, `crop.pointing_crop_handle`, `crop.cropping`, `crop.translating_crop`
- Transitions via `transition(id)`. Each state has `onPointerDown/Move/Up`, `onKeyDown/Up`, `onCancel`, `onComplete`, `onEnter`, `onExit`.

**Signals** — custom `@tldraw/state` (atom/computed/react). Used for reactive reads (`@computed` on Editor methods like `getSelectedShapeIds()`). State machine uses classes for decisions, signals for reactivity.

**Hit testing** — `SpatialIndexManager` + z-order traversal. Tests labels, filled shapes, hollow shapes, edge proximity. `getOutermostSelectableShape()` respects `focusedGroupId`.

**Area-select** — `Brushing` state. `getShapeIdsInsideBounds()` via spatial index. Wrap mode (ctrl) vs intersect mode. Shift = additive.

**Group drill-in** — `focusedGroupId`. Click selects outermost group. Double-click or click-when-group-selected drills in. `popFocusedGroupId()` exits.

**No cursor/anchor** — canvas has no linear order. Selection is purely set-based.

**Shapes don't have isSelected** — selection indicators rendered as a global overlay layer (`DefaultShapeIndicators`, `SelectionForeground`), not per-shape.

**SelectTool state machine** (complete, annotated for our mapping):

```
select (root)
│
├── idle                          ← default resting state
│   on pointer_down:
│     hit empty        → pointing_canvas
│     hit shape        → pointing_shape
│     hit selection    → pointing_selection
│     hit resize       → pointing_resize_handle
│     hit rotate       → pointing_rotate_handle
│     hit handle       → pointing_handle
│     hit arrow label  → pointing_arrow_label
│   on double_click:
│     hit empty        → create text shape, enter editing_shape
│     hit editable     → editing_shape
│     hit croppable    → crop.idle
│     hit group        → set focused group (drill in)
│   on cancel:
│     has focus group  → pop focused group
│     else             → select none
│
├── pointing_canvas               ← pointer down on empty, waiting for threshold
│   on pointer_move (dragging):
│     default          → brushing
│     alt held         → scribble_brushing (lasso)
│   on pointer_up:     → idle (click on empty = deselect)
│
├── pointing_shape                ← pointer down on shape, waiting for threshold
│   on pointer_move (dragging):
│     ctrl held        → brushing (area-select override)
│     default          → translating
│   on pointer_up:     → idle (click = select shape, respecting modifiers)
│
├── pointing_selection            ← pointer down on selection bounds
│   on pointer_move:   → translating
│   on pointer_up:     → idle
│
├── pointing_resize_handle        ← pointer down on resize corner/edge
│   on pointer_move:   → resizing
│   on pointer_up:     → idle
│
├── pointing_rotate_handle        ← pointer down on rotation handle
│   on pointer_move:   → rotating
│   on pointer_up:     → idle
│
├── pointing_handle               ← pointer down on shape-specific handle
│   on pointer_move:   → (handle-specific drag)
│   on pointer_up:     → idle
│
├── pointing_arrow_label          ← pointer down on arrow text label
│   on pointer_move:   → translating
│   on pointer_up:     → editing_shape (enter label edit)
│
├── brushing                      ← rectangle area-select (drag from empty)
│   on pointer_move:   update brush rect, recompute hit shapes
│   on pointer_up:     → idle (commit selection)
│   on cancel:         → idle (revert)
│   shift:             additive selection
│   ctrl:              wrap mode (must fully enclose)
│
├── scribble_brushing             ← freeform lasso (alt+drag from empty)
│   on pointer_move:   extend scribble path, test shape intersections
│   on pointer_up:     → idle (commit)
│   on cancel:         → idle (revert)
│
├── translating                   ← dragging shapes to move
│   on pointer_move:   update position delta, snap to guides
│   on pointer_up:     → idle (commit move)
│   on cancel:         → idle (revert to original positions)
│   alt:               clone-drag (duplicate on drop)
│
├── resizing                      ← dragging resize handle
│   on pointer_move:   update scale, compute new bounds
│   on pointer_up:     → idle (commit resize)
│   on cancel:         → idle (revert)
│   shift:             preserve aspect ratio
│   alt:               resize from center
│
├── rotating                      ← dragging rotation handle
│   on pointer_move:   compute angle from center
│   on pointer_up:     → idle (commit rotation)
│   on cancel:         → idle (revert)
│   shift:             snap to 15° increments
│
├── editing_shape                 ← shape in edit mode (text, etc.)
│   on pointer_down:
│     hit other shape  → idle (exit edit, select other)
│     hit empty        → idle (exit edit, deselect)
│   on cancel:         → idle (exit edit)
│   on complete:       → idle (confirm edit)
│
└── crop (sub-state machine)      ← image crop mode
    ├── crop.idle
    │   on pointer_down:
    │     hit crop handle  → crop.pointing_crop_handle
    │     hit crop area    → crop.pointing_crop
    │     hit outside      → idle (exit crop)
    ├── crop.pointing_crop
    │   on pointer_move:   → crop.translating_crop
    │   on pointer_up:     → crop.idle
    ├── crop.pointing_crop_handle
    │   on pointer_move:   → crop.cropping
    │   on pointer_up:     → crop.idle
    ├── crop.translating_crop
    │   on pointer_move:   update crop offset
    │   on pointer_up:     → crop.idle (commit)
    │   on cancel:         → crop.idle (revert)
    └── crop.cropping
        on pointer_move:   update crop rect from handle
        on pointer_up:     → crop.idle (commit)
        on cancel:         → crop.idle (revert)
```

**Our mapping** (what we implement now vs later):

| tldraw state | Our equivalent | Phase |
|---|---|---|
| `idle` | `ptr-idle` | Now |
| `pointing_canvas` | `ptr-pointing-empty` | Now |
| `pointing_shape` | `ptr-pointing-node` | Now |
| `pointing_selection` | `ptr-pointing-selection` | Now |
| `pointing_resize_handle` | `ptr-pointing-handle` | Later |
| `pointing_rotate_handle` | `ptr-pointing-handle` | Later |
| `pointing_handle` | `ptr-pointing-handle` | Later |
| `pointing_arrow_label` | — | Later (edge labels) |
| `brushing` | `ptr-node-rect` | Now |
| `scribble_brushing` | — | Later (lasso) |
| `translating` | `ptr-node-translate` | Later (manipulation) |
| `resizing` | `ptr-node-resize` | Later (manipulation) |
| `rotating` | `ptr-node-rotate` | Later (manipulation) |
| `editing_shape` | `sel.text()` / sub-selection | Now |
| `crop.*` | `sel.crop()` sub-selection | Later |

### Decker (collaborative board — our codebase)

Source: ~/Code/DZ/decker, decker-cardboard package.

**Selection state** — Zustand store:
- `selectedIds: string[]`, `selectingIds: string[]` (preview during area-select)
- `editMode: "node" | "text"`, `dragMode: DragMode`, `areaSelection: { anchor, focus }`
- `dropEffect: "move" | "copy" | "link" | null`

**Pointer state machine** — `DragMode` enum: `null | "itemdrag" | "textdrag" | "textselect" | "areaselect"`. Transitions in imperative event handlers (areaselect.ts ~500 lines).

**Problems** — state in three places (DOM attributes, Zustand, closure variables). Browser-inconsistent HTML5 drag events. DOM as mutable state. Imperative handlers hard to debug/test.

**Hit testing** — `document.elementsFromPoint(x, y)` + DOM traversal to `[data-selected]`.

**Morphing** — `selectionchange` event monitors DOM selection. Text spanning items → force area-select.

**Collaboration** — selection NOT in Yjs (local Zustand). Remote cursors via awareness protocol.

### ProseMirror (rich text editor)

**Selection** — abstract `Selection` class with subclasses: `TextSelection`, `NodeSelection`, `AllSelection`. Plugins add `GapCursor`, `CellSelection`.

**Key concepts** — `$anchor`/`$head` (resolved positions), `ranges[]`, `Selection.map()` through document changes, `getBookmark()` for undo. Transaction carries selection lazily.

**Extensibility** — `Selection.jsonID(id, class)` registers new selection types. `createSelectionBetween` plugin hook intercepts DOM-to-PM selection conversion.

### Excalidraw (simple canvas)

**Selection** — `selectedElementIds: Record<ID, true>`. Simpler than tldraw — flat structure, no group hierarchy. `editingElement` for text edit mode.

### Figma (design tool)

**Selection** — per-page, deep selection with component isolation. Vector point editing. Multiple edit modes (object, text, vector, crop). Frame constraints.

### DOM Selection API

**Selection** — `anchorNode/Offset` + `focusNode/Offset`. Position-based, not ID-based. Single document scope. No gesture lifecycle. `:hover`/`:active`/`:focus` as browser-managed pseudo-classes.

### VS Code

**Selection** — `anchor/active` (Position pairs). Multi-cursor (`selections[]`). Expand Selection (Shift+Alt+Right). Tree view uses `selectedItems` array.

### AppKit / UIKit

**AppKit** — `NSTableView.selectedRowIndexes`. `NSResponder` chain for keyboard routing.
**UIKit** — `UIGestureRecognizer` states: possible → began → changed → ended/cancelled/failed. `SelectionTracker` for RecyclerView.

## Terminology alignment

| Our term | tldraw | ProseMirror | DOM API | VS Code |
|---|---|---|---|---|
| `cursor` | — (no linear order) | `head` | `focusNode` | `active` |
| `anchor` | — | `anchor` | `anchorNode` | `anchor` |
| `sel.node.ids` | `selectedShapeIds` | `ranges` | — | `selections` |
| `sel.text()` | `editingShapeId` | `TextSelection` | `Selection` | `Selection` |
| `sel.root.id` | `focusedGroupId` | — | — | — |
| `sel.drag` | `pointing_*` → `brushing/translating` | — | — | — |
| `sel.kind` | implicit from state machine path | `Selection` subclass | `type` | — |
| pointer state machine | `StateNode` hierarchy (18 states) | — | — | — |
| pure transitions | — (side effects in StateNode) | `Transaction` | — | — |

We use `cursor` (natural for TUI) where the industry uses `head`/`focus`/`active`. Canvas tools (tldraw, Figma) don't have cursor/anchor — they're set-based. We bridge both worlds: ordered set with cursor/anchor for tree UIs, extensible to pure set for canvas.

### SlateJS architectural alignment

km's tree layer descends from SlateJS. The selection system aligns with the same `Editor.apply(op)` pattern — tree ops transform selection inline via `transformSelection(sel, op, prevTree, nextTree)`. Each history batch stores `selectionBefore` for atomic undo. Sub-selection preserved on move if block identity survives. All tree changes through `apply()`. See [selection-model.md](selection-model.md) § SlateJS alignment.
