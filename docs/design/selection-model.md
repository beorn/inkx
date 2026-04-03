# Selection Model

Unified selection architecture for km — designed for tree/outliner today, extensible to creative tools (Keynote, Numbers, Figma-class) tomorrow.

Everything goes through `Selection.*` — one namespace, one state machine, all centralized.

Reviewed by GPT 5.4 Pro (2x), Gemini 2.5 Pro, then tightened through systematic DRY review.

## Design Principles

1. **One namespace** — all selection logic lives in `Selection.*`
2. **Minimum stored state** — only store interaction data; derive everything else
3. **Discriminated union** — `kind` field, not optional fields
4. **Logical selection separate from visual projection** — `normalize/map/project` pipeline
5. **Selection ≠ operation targets** — commands decide what to affect
6. **Per-scope ownership** — selection belongs to a SelectionProvider, not a pane
7. **Extensible** — grid, canvas, handles via new `kind` variants

## Stored State (minimal)

The system stores only what it can't derive:

```ts
// === Top-level state (in TEA store) ===

// Branded type — makes it clear which strings are node IDs
type ID = string & { readonly __brand: "ID" }

type SelectionState = {
  scopes: Record<string, SelectionValue>  // scopeId → selection value
  // activeScope is NOT stored here — it's FocusManager.activeScopeId
  // Selection and focus share the same scope identity
}

// === Selection values (plain data, no methods) ===

type SelectionValue = NodeSelection | TextSelection | undefined
// undefined = no selection (scope has no entry, or explicitly cleared)
// Future: | GridSelection (genuinely different — rectangular ranges)

type NodeSelection = {
  kind: "node"
  anchor: ID                     // shift-extend origin
  focus: ID                      // moving end (last navigated to)
  lead: ID                       // primary item (inspector, keyboard home)
  toggled: ReadonlySet<ID>       // cmd-clicked items (XOR with range)
}

type TextSelection = {
  kind: "text"
  outer: NodeSelection               // host node selected structurally
  anchor: TextPoint                  // fixed end
  focus: TextPoint                   // active end (cursor position)
}
```

**What's NOT stored** (derived on read):
- `nodeIds()` — `range(anchor→focus, tree) XOR toggled`
- `roots()` — `removeNesting(nodeIds)`
- `includes()` — node ID membership check
- `scopeId` — it's the key in `scopes` map, not duplicated in the value
- `activeScope` — it's `FocusManager.activeScopeId` (focus and selection share scope identity)
- `inputMode` — `!sel ? "board" : sel.kind === "text" ? "text" : "node"`
- `cursorId` — `sel.kind === "node" ? sel.lead : sel.focus.nodeId`
- `insertionPoint` — derived from lead/focus

**Why `lead` is stored, not derived**: `lead` = "primary item for inspector/alignment." It's usually `focus`, but diverges on cmd+click (lead moves to toggled node, focus stays). A derivation rule like "last interacted node" would require tracking gesture history — storing it is simpler and explicit.

### Points

```ts
type NodePoint = {
  kind: "node"
  nodeId: ID
  edge?: "before" | "on" | "after"
}

type TextPoint = {
  kind: "text"
  nodeId: ID
  field?: string                     // which editable field (title, body, etc.)
  offset: number
  affinity?: "forward" | "backward"  // line-wrap disambiguation
}

type Point = NodePoint | TextPoint
// Future: CellPoint, HandlePoint
```

## Selection.* — Complete API

```ts
const Selection = {
  // Constructors
  node(nodeId):                    SelectionValue  // anchor=focus=lead=nodeId
  text(nodeId, field, offset):     SelectionValue
  // clear → just use undefined

  // Queries
  isCollapsed(sel):                boolean         // single node or collapsed text
  leadId(sel):                     ID | null

  // Derived node IDs (never stored)
  nodeIds(sel, tree):              ReadonlySet<ID> // removeNesting(rawNodeIds) — top-level only
  rawNodeIds(sel, tree):           ReadonlySet<ID> // range(anchor→focus) XOR toggled (all)
  includes(sel, nodeId, tree):     boolean
  insertionPoint(sel, tree):       InsertionPoint

  // Mutations (pure: SelectionValue → SelectionValue)
  select(nodeId):                  SelectionValue  // anchor=focus=lead=nodeId, toggled=∅
  add(sel, nodeId):                SelectionValue  // idempotent: add to toggled
  remove(sel, nodeId):             SelectionValue  // idempotent: remove from toggled
  toggle(sel, nodeId):             SelectionValue  // XOR in toggled, nodeId→lead
  extend(sel, nodeId, tree):       SelectionValue  // shift: move focus, keep anchor
  collapse(sel):                   SelectionValue  // Escape: anchor=focus=lead, toggled=∅
  edit(sel, nodeId, field, offset):SelectionValue  // → TextSelection
  stopEditing(sel):                SelectionValue  // → outer NodeSelection
  moveCursor(sel, offset):         SelectionValue  // text: move focus offset
  extendText(sel, offset):         SelectionValue  // text: shift+arrow
  areaSelect(sel, nodeIds, mode):  SelectionValue  // mode: "replace" | "xor"

  // Pipeline
  normalize(sel, doc):             SelectionValue
  map(sel, operation, doc):        SelectionValue
  project(sel, view, policy):      SelectionValue

  // State machine (TEA)
  createState():                   SelectionState
  update(action, state, tree):     [SelectionState, SelectionEffect[]]

  // km convenience (not core)
  inputMode(sel):                  "board" | "node" | "text"
  cursorId(sel):                   ID | null
}
```

**Scope management** is at the `SelectionState` level, not on individual values:
- `update({ type: "activateScope", scopeId }, state, tree)` switches the active scope
- Each scope remembers its last selection (like `FocusManager.scopeMemory`)

## Example Flow

A concrete walkthrough showing stored state and derived values at each step.

**Setup**: Tree with nodes `A B C D E` as siblings under `root`.

### 1. Click A

```
dispatch({ type: "select", nodeId: "A" })

Stored:  { kind: "node", anchor: "A", focus: "A", lead: "A", toggled: ∅ }
Derived: nodeIds = {A}, roots = [A], inputMode = "node"
```

### 2. Shift+click D (extend range)

```
dispatch({ type: "extend", nodeId: "D" })

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "A", toggled: ∅ }
Derived: nodeIds = {A,B,C,D}, roots = [A,B,C,D], lead = "A"
```

### 3. Cmd+click B (toggle OFF — B is in range, XOR removes it)

```
dispatch({ type: "toggle", nodeId: "B" })

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "B", toggled: {B} }
Derived: nodeIds = range(A→D) XOR {B} = {A,C,D}, lead = "B"
```

Note: `lead` is "B" (last interacted), even though B is now deselected. `normalize` will fix this — `lead` must be in `nodeIds()`.

### 4. normalize (enforce invariants)

```
Selection.normalize(sel, doc)

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "D", toggled: {B} }
         lead snapped to "D" (last in range that's still in nodeIds)
Derived: nodeIds = {A,C,D}, lead = "D" ✓
```

### 5. Cmd+click F (toggle ON — F is outside range, XOR adds it)

```
dispatch({ type: "toggle", nodeId: "F" })

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "F", toggled: {B,F} }
Derived: nodeIds = range(A→D) XOR {B,F} = {A,C,D,F}
```

### 6. Enter (edit text in lead)

```
dispatch({ type: "edit", nodeId: "F", field: "title", offset: 0 })

Stored:  { kind: "text",
           outer: { kind: "node", anchor: "F", focus: "F", lead: "F", toggled: ∅ },
           anchor: { kind: "text", nodeId: "F", field: "title", offset: 0 },
           focus:  { kind: "text", nodeId: "F", field: "title", offset: 0 } }
Derived: inputMode = "text", cursorId = "F"
```

Note: entering text collapses the outer NodeSelection to just the lead node.

### 7. Escape (back to node selection)

```
dispatch({ type: "stopEditing" })

Stored:  outer NodeSelection is restored → { anchor: "F", focus: "F", lead: "F", toggled: ∅ }
Derived: nodeIds = {F}, inputMode = "node"
```

### 8. Cmd+drag area select (Finder-style XOR)

```
// Drag lasso hits {C, D, E}. Mode = "xor" because Cmd is held.
dispatch({ type: "areaSelect", nodeIds: ["C","D","E"], mode: "xor" })

// Current members before area: {F}
// XOR with {C,D,E}: adds C,D,E (not in current), keeps F
Stored:  { kind: "node", anchor: "F", focus: "F", lead: "F", toggled: {C,D,E} }
Derived: nodeIds = range(F→F) XOR {C,D,E} = {F,C,D,E} → nodeIds = {C,D,E,F}
```

## Actions (complete)

```ts
type SelectionAction =
  | { type: "select"; nodeId }
  | { type: "add"; nodeId }
  | { type: "remove"; nodeId }
  | { type: "toggle"; nodeId }
  | { type: "extend"; nodeId }
  | { type: "collapse" }
  | { type: "clear" }                          // → undefined
  | { type: "edit"; nodeId; field; offset }
  | { type: "stopEditing" }
  | { type: "moveCursor"; offset }
  | { type: "extendText"; offset }
  | { type: "areaSelect"; nodeIds; mode: "replace" | "xor" }
  | { type: "activateScope"; scopeId }
  // Pipeline (dispatched by the system, not by gestures)
  | { type: "normalize"; doc: unknown }
  | { type: "map"; operation: unknown; doc: unknown }

type SelectionEffect =
  | { type: "render" }
  | { type: "scrollToLead" }
```

## normalize / map / project Pipeline

### Selection.normalize(sel, doc)
Structural validity against the document:
- Node doesn't exist? → snap anchor/focus to nearest sibling or parent
- Offset beyond content length? → clamp
- `lead` not in `nodeIds()`? → set to focus (or first member)

### Selection.map(sel, operation, doc)
Transform through document edits:
- Node deleted → remove from toggled, adjust anchor/focus
- Node moved → update if in range or toggled
- Node split → follow the half containing the original position
- Text inserted before offset → shift offset

Undo/redo carries selection before/after as transaction metadata.

### Selection.project(sel, view, policy)
Adapt to a pane's visible tree (never mutates logical selection):
- `"preserve"` — keep logical selection, render what's visible (default)
- `"proxy"` — snap hidden items to nearest visible ancestor
- `"strict"` — remove non-visible items

## Gesture → Action Mapping

### Keyboard (node mode)

| Key | Action |
|---|---|
| j | `select(nextVisible)` |
| Shift+j | `extend(nextVisible)` |
| Escape (multi) | `collapse` |
| Escape (single) | `clear` |
| Enter | `edit(lead, "title", 0)` |

### Keyboard (text mode)

| Key | Action |
|---|---|
| ArrowRight | `moveCursor(+1)` |
| Shift+Right | `extendText(+1)` |
| Escape | `stopEditing` |

### Mouse

| Gesture | Action |
|---|---|
| Click node B | `select("B")` |
| Shift+click B | `extend("B")` |
| Cmd+click B | `toggle("B")` |
| Click text in B | `edit("B", field, offset)` |
| Click empty | `clear` |
| Drag lasso | `areaSelect(hitIds, "replace")` |
| Cmd+drag lasso | `areaSelect(hitIds, "xor")` |

### Voice / AI / API

| Command | Action |
|---|---|
| "Select card X" | `select("X")` |
| "Also select Y" | `add("Y")` |
| "Deselect Y" | `remove("Y")` |
| "Select from X to Y" | `select("X")` then `extend("Y")` |
| "Edit card X" | `edit("X", "title", 0)` |
| "Deselect all" | `clear` |

## Insertion Points and Drop Targets

Selection answers "what is selected." Two sibling concepts share the Point vocabulary:

```
SelectionValue   "what is selected"         persistent (TEA store)
InsertionPoint   "where content goes"       derived: Selection.insertionPoint(sel, tree)
DropTarget       "where drag lands"         transient gesture state
```

### InsertionPoint

```ts
type InsertionPoint =
  | { kind: "node"; parentId: string; edge: "before" | "after"; referenceId: string }
  | { kind: "text"; nodeId: string; field: string; offset: number }
```

**`Selection.insertionPoint(sel, tree)`** derives it:
- NodeSelection → after `lead`
- TextSelection → at `focus` offset
- none → append to scope root

### DropTarget (transient)

```ts
type NodeDropTarget = {
  kind: "node"
  where: "before" | "after" | "into"
  targetId: string
}

type DragSession = {
  dragging: ReadonlySet<string>
  dropTarget: NodeDropTarget | null
  dropEffect: "move" | "copy" | "link"  // default=move, Alt=copy, Cmd=link
}
```

**Resolution** (Decker pattern): enumerate candidate positions for all visible nodes → compute proximity to pointer → filter cycles → select nearest within threshold.

**Visual**: thin line for before/after, border highlight for "into", gap-aware positioning.

**On drop**: `DropTarget` converts to `InsertionPoint` → feeds into a move/copy command.

### Architecture

```
TEA Store (persistent)          Gesture State (transient)
─────────────────────           ─────────────────────────
SelectionState                  DragSession
  scopes: { id → SelectionValue } dragging, dropTarget, dropEffect
  activeScope: string
                                AreaSelectSession
                                  anchor, focus, hitIds
                                  mode: "replace" | "xor"
```

Transient sessions produce `SelectionAction`s on completion:
- Area select end → `{ type: "areaSelect", nodeIds, mode }`
- Drop end → `moveNodes(dragging, insertionPoint)`

## SelectionProvider (React integration)

### Relationship to FocusManager

Selection is built ON TOP of Focus, not instead of it:

```
silvery (any TUI app)           km (app with selection)
─────────────────────           ─────────────────────────
FocusManager                    SelectionProvider
  "which widget gets keys"        "which data is selected"
  activeElement: AgNode           anchor/focus/lead/toggled
  activeScopeId  ←──────────→   active scope (shared)
  tab order, spatial nav          j/k nav, shift-extend, cmd-click
  scope stack (modals)            scope stack (panes, drill-in)
```

FocusManager stays in silvery — it's the low-level primitive for any TUI app (forms, dialogs don't need selection). SelectionProvider composes it: selection changes update focus, focus changes can update selection. They share scope identity.

### API

```tsx
<SelectionProvider scopeId="main-board" tree={tree}>
  <BoardView />
</SelectionProvider>

// Inside components — everything through Selection.*
const sel = useSelection()                              // SelectionValue
const dispatch = useSelectionDispatch()                  // (SelectionAction) → void
const nodeIds = Selection.nodeIds(sel, tree)             // derived
const isSelected = Selection.includes(sel, nodeId, tree) // derived
dispatch({ type: "toggle", nodeId })                     // action
```

## What This Replaces

| Before (scattered) | After (`Selection.*`) |
|---|---|
| `cursorId` in CursorStore | `Selection.leadId(sel)` |
| `cursorCardID` | `ancestor(Selection.cursorId(sel), "card")` |
| `cursorColumnID` | `ancestor(Selection.cursorId(sel), "column")` |
| `selectionLevel` | `Selection.inputMode(sel)` |
| `multiSelected: Set<string>` | `Selection.nodeIds(sel, tree)` |
| `selectionAnchor` | `sel.anchor` |
| `inlineEditBlock` | `sel.kind === "text"` |
| `expandWithDescendants()` | NOT in Selection — that's operation targeting |

### `expandWithDescendants` is NOT selection

Selection is `{card}`, not `{card, child1, child2}`. Visual highlighting of descendants is a rendering concern. Commands decide what to affect independently.

## Undo Integration

- Content edits carry selection before/after as transaction metadata
- Undo restores both document state and selection
- Pure cursor moves do NOT create undo entries

## Prior Art

| Feature | AppKit | SlateJS | ProseMirror | km |
|---|---|---|---|---|
| Selection type | IndexSet | {anchor, focus} | abstract | discriminated union |
| Anchor/focus | Hidden | Exposed | Exposed | **Exposed** |
| Lead/primary | No | No | No | **Yes** |
| Text+node | No | Yes | Yes | **Yes (nested)** |
| Membership | Stored | Stored | Stored | **Derived** |
| Validated | No | No | Yes | **normalize/map/project** |
| Single namespace | N/A | Editor.* | N/A | **Selection.*** |
| TEA state machine | No | No | No | **Yes** |

## Future Extensions

### What DOESN'T need new kinds

**Canvas/scene selection** — NodeSelection already works. Canvas objects are nodes in a scene graph. The difference is `nodeIds()` behavior: no range walk (no linear order), just `{anchor} ∪ toggled`. Anchor/focus/lead/toggled all apply. z-order hit cycling is a gesture concern, not a selection type.

**Nested/drill-in selection** — Entering a group (Figma double-click) is a scope change, not a selection kind. Push a new scope with `rootId = group`, selection within is still NodeSelection. TextSelection already handles the innermost case (text editing inside a selected node via `outer`).

**Handle/sub-object selection** — Selecting a Bezier control point or resize handle is a scope change to the object's internals, with NodeSelection over handle IDs. Or extend `toggled` to reference sub-object paths.

### What DOES need new kinds

- **GridSelection**: genuinely different — rectangular ranges, row/column headers, active cell separate from selection range, formula bar editing. `{ kind: "grid"; selectedRanges: CellRect[]; activeCell: CellPoint; anchor: CellPoint }`
- **Multiple cursors**: Array of TextSelections (CodeMirror 6 model)
- **Collaborative cursors**: Remote selections with user/color metadata (presence overlay, not local selection)

### Other extensions

- **CanvasDropTarget**: `{ kind: "canvas"; parentId: string; position: { x, y } }` — 2D drop targets
- **Scope stack**: push/pop for drill-in (entering groups, tables, text boxes) — builds on FocusManager's existing scope stack
