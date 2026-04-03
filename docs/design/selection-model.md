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

type SelectionState = {
  scopes: Record<string, SelectionValue>  // scopeId → selection value
  activeScope: string | null              // which scope has keyboard focus
}

// === Selection values (plain data, no methods) ===

type SelectionValue =
  | { kind: "none" }
  | NodeSelection
  | TextSelection
  // Future: | GridSelection | SceneSelection | NestedSelection

type NodeSelection = {
  kind: "node"
  anchor: string                     // shift-extend origin
  focus: string                      // moving end (last navigated to)
  lead: string                       // primary item (inspector, keyboard home)
  toggled: ReadonlySet<string>       // cmd-clicked items (XOR with range)
}

type TextSelection = {
  kind: "text"
  outer: NodeSelection               // host node selected structurally
  anchor: TextPoint                  // fixed end
  focus: TextPoint                   // active end (cursor position)
}
```

**What's NOT stored** (derived on read):
- `members()` — `range(anchor→focus, tree) XOR toggled`
- `roots()` — `removeNesting(members)`
- `includes()` — membership check
- `scopeId` — it's the key in `scopes` map, not duplicated in the value
- `inputMode` — `sel.kind === "text" ? "text" : sel.kind === "none" ? "board" : "node"`
- `cursorNodeId` — `sel.kind === "node" ? sel.lead : sel.focus.nodeId`
- `insertionPoint` — derived from lead/focus

**Why `lead` is stored, not derived**: `lead` = "primary item for inspector/alignment." It's usually `focus`, but diverges on cmd+click (lead moves to toggled node, focus stays). A derivation rule like "last interacted node" would require tracking gesture history — storing it is simpler and explicit.

### Points

```ts
type NodePoint = {
  kind: "node"
  nodeId: string
  edge?: "before" | "on" | "after"
}

type TextPoint = {
  kind: "text"
  nodeId: string
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

  // ── Constructors ──────────────────────────────────────────

  none():                                          SelectionValue
  node(nodeId: string):                            SelectionValue  // anchor=focus=lead=nodeId
  text(nodeId: string, field: string, offset: number): SelectionValue

  // ── Queries (all kinds) ───────────────────────────────────

  isNone(sel):       boolean
  isCollapsed(sel):  boolean                       // single node or collapsed text
  kind(sel):         "none" | "node" | "text"
  lead(sel):         string | null
  
  // ── Derived membership (never stored) ─────────────────────

  members(sel, tree):              ReadonlySet<string>  // range(anchor→focus) XOR toggled
  roots(sel, tree):                string[]             // removeNesting(members)
  includes(sel, nodeId, tree):     boolean
  insertionPoint(sel, tree):       InsertionPoint       // where new content would go

  // ── Mutations (pure: SelectionValue → SelectionValue) ─────

  selectOnly(nodeId):              SelectionValue  // anchor=focus=lead=nodeId, toggled=∅
  add(sel, nodeId):                SelectionValue  // idempotent: add to toggled
  remove(sel, nodeId):             SelectionValue  // idempotent: remove from toggled
  toggle(sel, nodeId):             SelectionValue  // XOR in toggled, nodeId→lead
  extendTo(sel, nodeId, tree):     SelectionValue  // shift: move focus, keep anchor
  collapseToLead(sel):             SelectionValue  // Escape: anchor=focus=lead, toggled=∅
  enterText(sel, nodeId, field, offset): SelectionValue  // → TextSelection
  exitText(sel):                   SelectionValue  // → outer NodeSelection
  moveTextFocus(sel, offset):      SelectionValue
  extendTextTo(sel, offset):       SelectionValue
  areaSelect(sel, nodeIds, mode):  SelectionValue  // mode: "replace" | "xor"

  // ── Pipeline ──────────────────────────────────────────────

  normalize(sel, doc):             SelectionValue  // structural validity
  map(sel, operation, doc):        SelectionValue  // transform through edits
  project(sel, view, policy):      SelectionValue  // adapt to pane's visible tree

  // ── State machine (TEA) ───────────────────────────────────

  createState():                                   SelectionState
  update(action, state, tree):     [SelectionState, SelectionEffect[]]

  // ── km convenience (not core) ─────────────────────────────

  inputMode(sel):      "board" | "node" | "text"
  cursorNodeId(sel):   string | null
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
dispatch({ type: "selectOnly", nodeId: "A" })

Stored:  { kind: "node", anchor: "A", focus: "A", lead: "A", toggled: ∅ }
Derived: members = {A}, roots = [A], inputMode = "node"
```

### 2. Shift+click D (extend range)

```
dispatch({ type: "extendTo", nodeId: "D" })

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "A", toggled: ∅ }
Derived: members = {A,B,C,D}, roots = [A,B,C,D], lead = "A"
```

### 3. Cmd+click B (toggle OFF — B is in range, XOR removes it)

```
dispatch({ type: "toggle", nodeId: "B" })

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "B", toggled: {B} }
Derived: members = range(A→D) XOR {B} = {A,C,D}, lead = "B"
```

Note: `lead` is "B" (last interacted), even though B is now deselected. `normalize` will fix this — `lead` must be in `members()`.

### 4. normalize (enforce invariants)

```
Selection.normalize(sel, doc)

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "D", toggled: {B} }
         lead snapped to "D" (last in range that's still in members)
Derived: members = {A,C,D}, lead = "D" ✓
```

### 5. Cmd+click F (toggle ON — F is outside range, XOR adds it)

```
dispatch({ type: "toggle", nodeId: "F" })

Stored:  { kind: "node", anchor: "A", focus: "D", lead: "F", toggled: {B,F} }
Derived: members = range(A→D) XOR {B,F} = {A,C,D,F}
```

### 6. Enter (edit text in lead)

```
dispatch({ type: "enterText", nodeId: "F", field: "title", offset: 0 })

Stored:  { kind: "text",
           outer: { kind: "node", anchor: "F", focus: "F", lead: "F", toggled: ∅ },
           anchor: { kind: "text", nodeId: "F", field: "title", offset: 0 },
           focus:  { kind: "text", nodeId: "F", field: "title", offset: 0 } }
Derived: inputMode = "text", cursorNodeId = "F"
```

Note: entering text collapses the outer NodeSelection to just the lead node.

### 7. Escape (back to node selection)

```
dispatch({ type: "exitText" })

Stored:  outer NodeSelection is restored → { anchor: "F", focus: "F", lead: "F", toggled: ∅ }
Derived: members = {F}, inputMode = "node"
```

### 8. Cmd+drag area select (Finder-style XOR)

```
// Drag lasso hits {C, D, E}. Mode = "xor" because Cmd is held.
dispatch({ type: "areaSelect", nodeIds: ["C","D","E"], mode: "xor" })

// Current members before area: {F}
// XOR with {C,D,E}: adds C,D,E (not in current), keeps F
Stored:  { kind: "node", anchor: "F", focus: "F", lead: "F", toggled: {C,D,E} }
Derived: members = range(F→F) XOR {C,D,E} = {F,C,D,E} → members = {C,D,E,F}
```

## Actions (complete)

```ts
type SelectionAction =
  // Node
  | { type: "selectOnly"; nodeId: string }
  | { type: "add"; nodeId: string }
  | { type: "remove"; nodeId: string }
  | { type: "toggle"; nodeId: string }
  | { type: "extendTo"; nodeId: string }
  | { type: "collapseToLead" }
  | { type: "clear" }                                // → { kind: "none" }
  // Text
  | { type: "enterText"; nodeId: string; field: string; offset: number }
  | { type: "exitText" }
  | { type: "moveTextFocus"; offset: number }
  | { type: "extendTextTo"; offset: number }
  // Area select
  | { type: "areaSelect"; nodeIds: string[]; mode: "replace" | "xor" }
  // Scope
  | { type: "activateScope"; scopeId: string }
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
- `lead` not in `members()`? → set to focus (or first member)

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
| j | `selectOnly(nextVisible)` |
| Shift+j | `extendTo(nextVisible)` |
| Escape (multi) | `collapseToLead` |
| Escape (single) | `clear` |
| Enter | `enterText(lead, "title", 0)` |

### Keyboard (text mode)

| Key | Action |
|---|---|
| ArrowRight | `moveTextFocus(+1)` |
| Shift+Right | `extendTextTo(+1)` |
| Escape | `exitText` |

### Mouse

| Gesture | Action |
|---|---|
| Click node B | `selectOnly("B")` |
| Shift+click B | `extendTo("B")` |
| Cmd+click B | `toggle("B")` |
| Click text in B | `enterText("B", field, offset)` |
| Click empty | `clear` |
| Drag lasso | `areaSelect(hitIds, "replace")` |
| Cmd+drag lasso | `areaSelect(hitIds, "xor")` |

### Voice / AI / API

| Command | Action |
|---|---|
| "Select card X" | `selectOnly("X")` |
| "Also select Y" | `add("Y")` |
| "Deselect Y" | `remove("Y")` |
| "Select from X to Y" | `selectOnly("X")` then `extendTo("Y")` |
| "Edit card X" | `enterText("X", "title", 0)` |
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

Modeled after silvery's `FocusManager`:

| Concept | Focus (silvery) | Selection (this design) |
|---|---|---|
| State | `createFocusManager()` | `Selection.createState()` |
| Provider | `FocusManagerContext` | `SelectionProvider` |
| Scoping | `enterScope`/`activateScope` | `activateScope` action |
| Memory | `scopeMemory` | `scopes: Record<string, SelectionValue>` |
| Hook | `useFocusable()` | `useSelection()` / `useSelectionDispatch()` |
| Subscribe | `subscribe`/`getSnapshot` | same pattern |

```tsx
<SelectionProvider scopeId="main-board" tree={tree}>
  <BoardView />
</SelectionProvider>

// Inside components
const sel = useSelection()                              // SelectionValue
const dispatch = useSelectionDispatch()                  // (SelectionAction) → void
const members = Selection.members(sel, tree)             // derived
const isSelected = Selection.includes(sel, nodeId, tree) // derived
dispatch({ type: "toggle", nodeId })                     // action
```

## What This Replaces

| Before (scattered) | After (`Selection.*`) |
|---|---|
| `cursorNodeId` in CursorStore | `Selection.lead(sel)` |
| `cursorCardNodeId` | `ancestor(Selection.cursorNodeId(sel), "card")` |
| `cursorColumnNodeId` | `ancestor(Selection.cursorNodeId(sel), "column")` |
| `selectionLevel` | `Selection.inputMode(sel)` |
| `multiSelected: Set<string>` | `Selection.members(sel, tree)` |
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

- **GridSelection**: `{ kind: "grid"; anchor: CellPoint; focus: CellPoint; selectedRanges: CellRect[] }`
- **SceneSelection**: `{ kind: "scene"; anchor: string; focus: string; lead: string; toggled: Set<ObjectId> }`
- **NestedSelection**: `{ kind: "nested"; outer: SceneSelection; inner: HandleSelection | TextSelection }`
- **Multiple cursors**: Array of TextSelections (CodeMirror 6)
- **Collaborative cursors**: Remote selections with user/color metadata
- **CanvasDropTarget**: `{ kind: "canvas"; parentId: string; position: { x, y } }`
