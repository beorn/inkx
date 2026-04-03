# Selection Model

Unified selection architecture for km — designed for tree/outliner today, extensible to creative tools tomorrow.

Everything goes through `Selection.*` — one namespace, one state machine, all centralized.

Reviewed by GPT 5.4 Pro (3x, $13.59 total), Gemini 2.5 Pro, plus /big analysis.

## Design Principles

1. **One namespace** — all selection logic lives in `Selection.*`
2. **Concrete stored state** — `nodeIds` is a Set, not derived from range algebra
3. **Node + text coexist** — text editing is an overlay, not a replacement
4. **Invariants enforced by construction** — mutators repair, don't rely on post-hoc normalize
5. **Selection ≠ operation targets** — commands decide what to affect
6. **Per-scope ownership** — selection belongs to a SelectionProvider, not a pane

## Stored State

```ts
type ID = string & { readonly __brand: "ID" }

// Cursor — shared concept for both node and text
// [cursor] = collapsed (just a position), [cursor, anchor] = range
type Cursor<T> = { cursor: T; anchor?: T }

type TextPoint = {
  nodeId: ID
  offset: number
  affinity?: "forward" | "backward"
}

type SelectionState = Map<string, SelectionValue>  // scopeName → value
// Active scope resolved externally via focus system
// Scope lifecycle: set() to create, delete() to dispose

type SelectionValue = {
  node?: Cursor<ID>              // node cursor/range (where you "are" in the tree)
  text?: Cursor<TextPoint>       // text cursor/range (where you "are" in text)
  ids: ReadonlySet<ID>           // currently selected nodes
} | undefined
```

**Three independent pieces:**
- `node` — which node the cursor is on, and the shift-extend anchor. Absent = no node focus.
- `text` — which text position the caret is at, and the text selection anchor. Absent = not editing text.
- `ids` — what's selected. Always a concrete set. O(1) lookup.

**Mode** is derived from presence: `!sel` = board, `node && !text` = node, `text` = text.

**Different SelectionMachines** (gesture policies) can maintain different invariants on the same type. For example:
- km outliner: `node` always present when `sel` exists, `text` clears on node gestures
- creative tool: `node` range survives text editing, `ids` may include nodes from multiple containers
- canvas: `node` without anchor (no linear range), `ids` from lasso only

### Invariants (km outliner defaults)

If `sel !== undefined`:
- `sel.ids.size > 0`
- `sel.node !== undefined`
- `sel.node.cursor ∈ sel.ids`
- if `sel.node.anchor`, then `sel.node.anchor ∈ sel.ids`
- if `sel.text`, then `sel.text.cursor.nodeId === sel.node.cursor`

Mutators enforce these inline — never deferred to normalize.

### Mode rule (km outliner)

Node actions (`select`, `add`, `remove`, `toggle`, `extend`, `collapseToCursor`, `areaSelect`, `clear`) clear `text`. Text actions don't alter `node` or `ids`.

## SelectionSpace

Mutations that need order info (`extend`, cursor repair on `toggle`/`remove`, `areaSelect` cursor choice) take a `SelectionSpace` — not a raw tree.

```ts
interface SelectionSpace {
  has(id: ID): boolean                         // exists in current view?
  compare(a: ID, b: ID): number               // interaction order
  range(a: ID, b: ID): ReadonlySet<ID>        // visible nodes between a and b
  nearest(to: ID, among: Iterable<ID>): ID | null  // nearest in order
}
```

Tree panes supply visible/view order. Canvas panes supply hit/z-order. Non-linear spaces can leave `range()` unsupported.

This means `extend()` uses **view order** — shift-select never silently includes collapsed/hidden nodes.

## Selection.* — The Interface

Consumers ONLY use `Selection.*` — the internal representation is hidden behind this facade. This lets us change internals (e.g., switch from flat Set to IndexSet, or add fields) without breaking consumers.

```ts
const Selection = {
  // ── Constructors ──────────────────────────────────────────
  of(nodeId):                         SelectionValue  // single node selected
  // clear → just use undefined

  // ── Read (how consumers access selection) ─────────────────
  cursor(sel):                        ID | undefined    // which node you're on
  anchor(sel):                        ID | undefined    // shift-extend origin
  ids(sel):                           ReadonlySet<ID>   // selected nodes
  includes(sel, nodeId):              boolean           // is this node selected?
  textCursor(sel):                    TextPoint | undefined
  textAnchor(sel):                    TextPoint | undefined

  hasSingleNode(sel):                 boolean
  isEditing(sel):                     boolean
  isTextCollapsed(sel):               boolean
  inputMode(sel):                     "board" | "node" | "text"
  insertionPoint(sel, space):         InsertionPoint

  // ── Node mutations (clear text, preserve invariants) ──────
  select(nodeId):                     SelectionValue
  add(sel, nodeId):                   SelectionValue
  remove(sel, nodeId, space):         SelectionValue
  toggle(sel, nodeId, space):         SelectionValue
  extend(sel, nodeId, space):         SelectionValue
  collapseToCursor(sel):              SelectionValue
  areaSelect(base, hitIds, mode, space): SelectionValue

  // ── Text mutations (don't touch node/ids) ─────────────────
  edit(sel, offset):                  SelectionValue    // start editing at cursor node
  stopEditing(sel):                   SelectionValue    // clear text
  moveTextCursor(sel, offset):        SelectionValue
  extendTextRange(sel, offset):       SelectionValue

  // ── Pipeline ──────────────────────────────────────────────
  normalize(sel, doc, space):         SelectionValue
  map(sel, mapping):                  SelectionValue    // v1: prefer selectionAfter

  // ── State machine (TEA) ───────────────────────────────────
  createState():                      SelectionState
  update(action, state, space):       [SelectionState, SelectionEffect[]]
}
```

**The interface hides:**
- Whether `node` and `text` are separate fields or nested
- Whether anchor is stored or derived
- The cursor repair strategy
- Internal Set vs IndexSet vs range representation

**Consumers just call:**
```ts
const id = Selection.cursor(sel)           // which node am I on?
const selected = Selection.ids(sel)         // what's selected?
const editing = Selection.isEditing(sel)    // am I editing text?
const yes = Selection.includes(sel, nodeId) // is this node selected?
```

### Cursor repair (internal — hidden behind mutators)

When a mutation removes the cursor from ids:
1. Old cursor still in ids → keep
2. Else `space.nearest(oldCursor, ids)` → nearest in view order
3. Else first in ids
4. Ids empty → `undefined`

Same for anchor.

### Anchor update policy

| Action | anchor becomes |
|---|---|
| `select(id)` | `id` |
| `extend(id)` | unchanged (that's the point) |
| `add(id)` | unchanged |
| `toggle(id)` adding | unchanged |
| `toggle(id)` removing non-anchor | unchanged |
| `toggle(id)` removing the anchor | repaired cursor |
| `remove(id)` removing the anchor | repaired cursor |
| `collapseToCursor` | cursor |
| `areaSelect` replace | cursor |
| `areaSelect` xor, anchor still selected | unchanged |
| `areaSelect` xor, anchor removed | repaired cursor |

### edit() preserves node selection

Core `edit()` does NOT collapse nodeIds. It just sets the text overlay on the cursor node.

If a surface wants Keynote-style collapse, the gesture layer does:
```ts
sel = Selection.select(nodeId)   // collapse to single node
sel = Selection.edit(sel, offset) // then enter text
```

This keeps the state model information-preserving. Collapse is a gesture policy, not a state rule.

## Consumer Taxonomy

| Consumer | What it needs | Code |
|---|---|---|
| Inspector/properties | cursor node | `Selection.cursor(sel)` |
| Keyboard routing | editing text? | `Selection.isEditing(sel)` |
| Delete/move/copy | all selected nodes | `Selection.ids(sel)` |
| Per-node highlight | is this node selected? | `Selection.includes(sel, id)` |
| Paste/Enter | text-first fallback | `Selection.isEditing(sel) ? textOp() : nodeOp()` |
| Insert new content | insertion point | `Selection.insertionPoint(sel, space)` |
| Scroll-to-reveal | cursor node | `Selection.cursor(sel)` |

Hot path: per-node highlight — `Set.has()` is O(1).

## Example Flow

**Setup**: Tree with siblings `A B C D E F` under `root`.

### 1. Click A

```
Selection.select("A")
→ { node: {cursor: "A"}, ids: {A} }
```

### 2. Shift+click D

```
Selection.extend(sel, "D", space)
→ { node: {cursor: "D", anchor: "A"}, ids: {A,B,C,D} }
```

### 3. Cmd+click B (toggle off)

```
Selection.toggle(sel, "B", space)
→ { node: {cursor: "D", anchor: "A"}, ids: {A,C,D} }
// B wasn't cursor → cursor stays at D.
```

### 4. Cmd+click F (toggle on)

```
Selection.toggle(sel, "F", space)
→ { node: {cursor: "F", anchor: "A"}, ids: {A,C,D,F} }
// F added → cursor moves to F.
```

### 5. Enter (edit)

```
Selection.edit(sel, 0)
→ { node: {cursor: "F", anchor: "A"}, ids: {A,C,D,F},
    text: {cursor: {nodeId: "F", offset: 0}} }
```

### 6. Escape

```
Selection.stopEditing(sel)
→ { node: {cursor: "F", anchor: "A"}, ids: {A,C,D,F} }
```

### 7. Area select (replace)

```
Selection.areaSelect(sel, {B,C}, "replace", space)
→ { node: {cursor: "B"}, ids: {B,C} }
```

### 8. Cmd+drag area (XOR)

```
Selection.areaSelect(sel, {C,D,E}, "xor", space)
→ { node: {cursor: "B"}, ids: {B,D,E} }
// C removed, D+E added. cursor stays.
```

## Actions

```ts
type SelectionAction =
  // Node (all clear text)
  | { type: "select"; nodeId }
  | { type: "add"; nodeId }
  | { type: "remove"; nodeId }
  | { type: "toggle"; nodeId }
  | { type: "extend"; nodeId }
  | { type: "collapseToCursor" }
  | { type: "clear" }                          // → undefined
  // Text (don't touch nodeIds)
  | { type: "edit"; offset }                   // edit at cursor node
  | { type: "stopEditing" }
  | { type: "moveTextFocus"; offset }
  | { type: "extendTextRange"; offset }
  // Area (clears text)
  | { type: "areaSelect"; nodeIds; mode: "replace" | "xor" }
  // Scope
  // Scope lifecycle managed directly on Map: state.set(name, sel) / state.delete(name)

type SelectionEffect =
  | { type: "render" }
  | { type: "scrollToCursor" }
```

## map() Contract

v1: Use `selectionAfter` on transactions. Commands that know the intended result provide it directly.

```ts
type TransactionMeta = {
  selectionBefore?: SelectionValue
  selectionAfter?: SelectionValue    // preferred — command knows best
  selectionMapping?: SelectionMapping // generic fallback
}

interface SelectionMapping {
  mapId(id: ID): ID | null
  mapTextPoint(p: TextPoint): TextPoint | null
}
```

Resolution order:
1. `selectionAfter` → use directly
2. `selectionMapping` → map current selection
3. Neither → `normalize(sel, newDoc, space)`

`Selection.map(sel, unknown)` is NOT in v1 API. It becomes `Selection.applyMapping(sel, mapping)` when needed.

## normalize

Only for post-edit repair (stale IDs, clamped offsets). NOT for invariant repair — mutators handle that.

- Remove nodeIds that no longer exist in doc
- Clamp text offsets
- Repair cursor/anchor if their targets were deleted
- If nodeIds becomes empty → `undefined`

## Gesture → Action Mapping

### Keyboard (node mode)

| Key | Action |
|---|---|
| j | `select(nextVisible)` |
| Shift+j | `extend(nextVisible)` |
| Escape (multi) | `collapseToCursor` |
| Escape (single) | `clear` |
| Enter | `edit(0)` |

### Keyboard (text mode)

| Key | Action |
|---|---|
| ArrowRight | `moveTextFocus(+1)` |
| Shift+Right | `extendTextRange(+1)` |
| Escape | `stopEditing` |

### Mouse

| Gesture | Action |
|---|---|
| Click node B | `select("B")` |
| Shift+click B | `extend("B")` |
| Cmd+click B | `toggle("B")` |
| Click text in B | `select("B")` then `edit(offset)` |
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
| "Edit card X" | `select("X")` then `edit(0)` |
| "Deselect all" | `clear` |

## Insertion Points and Drop Targets

```
SelectionValue   "what is selected"       persistent (TEA store)
InsertionPoint   "where content goes"     derived: Selection.insertionPoint(sel, space)
DropTarget       "where drag lands"       transient gesture state
```

### InsertionPoint

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }
```

### DropTarget (transient)

```ts
type NodeDropTarget = {
  kind: "node"
  where: "before" | "after" | "into"
  targetId: ID
}

type DragSession = {
  dragging: ReadonlySet<ID>
  dropTarget: NodeDropTarget | null
  dropEffect: "move" | "copy" | "link"
}

type AreaSelectSession = {
  base: SelectionValue              // snapshot at gesture start
  hitIds: ReadonlySet<ID>
  mode: "replace" | "xor"
}
```

**Resolution** (Decker pattern): enumerate candidates → proximity to pointer → filter cycles → nearest within threshold.

## Gesture Overlays

During gestures (area-select, drag), a **transient overlay** modifies how selection appears without committing to the store. The effective selection during a gesture is derived from `base + overlay`. On gesture end, the result commits to the store.

### Area select / lasso

```ts
type AreaSelectSession = {
  base: SelectionValue              // snapshot at gesture start (frozen)
  hitIds: ReadonlySet<ID>           // nodes inside lasso (updated on pointer move)
  mode: "replace" | "xor"           // plain drag vs cmd+drag
}
```

**Effective selection during lasso** (what renders):
```ts
effective = mode === "replace"
  ? { ...base, ids: hitIds }
  : { ...base, ids: symmetricDifference(base.ids, hitIds) }
```

**On gesture end**: `effective` commits → `Selection.areaSelect(base, hitIds, mode, space)`.

**On gesture cancel** (Escape): restore `base`, discard overlay.

Components render the *effective* selection during the gesture, not the committed store value. This means `Selection.includes(sel, id)` needs to account for active gesture overlays — either by passing the overlay to the query, or by having the provider merge them before exposing to consumers.

### Drag / drop

```ts
type DragSession = {
  dragging: ReadonlySet<ID>
  dropTarget: NodeDropTarget | null
  dropEffect: "move" | "copy" | "link"
}
```

Drag doesn't overlay selection — dragged nodes stay selected. The overlay is visual only (drop indicator). On drop, a document mutation happens (move/copy), and selection may update via `selectionAfter`.

### Architecture

```
TEA Store (committed)           Gesture Overlay (transient)
─────────────────────           ─────────────────────────
SelectionState                  AreaSelectSession?
  Map<scopeName, SelectionValue>  base, hitIds, mode
                                  → effective selection (derived)

                                DragSession?
                                  dragging, dropTarget, dropEffect
                                  → drop indicator (visual only)
```

**The provider merges committed + overlay** before exposing to consumers:
```ts
function useSelection(): SelectionValue {
  const committed = store.get(scopeName)
  const overlay = areaSelectSession
  return overlay ? deriveEffective(overlay) : committed
}
```

Consumers don't know whether they're seeing committed or overlay state — they just call `Selection.cursor(sel)`, `Selection.includes(sel, id)`. The gesture layer is invisible to them.

## SelectionProvider (React)

### Focus / Selection relationship

Focus (silvery) and Selection (km) are **orthogonal**:
- Focus = which pane/widget gets keystrokes
- Selection = which data nodes are chosen within a pane
- Active selection = `scopes[resolveSelectionOwner(focusManager)]`
- Modal dialogs push a focus scope but don't change selection
- `resolveSelectionOwner` maps focus scope → selection scope (not always 1:1)

```tsx
<SelectionProvider scopeName="main-board" space={space}>
  <BoardView />
</SelectionProvider>

// Inside components — everything through Selection.*
const sel = useSelection()                          // SelectionValue
const dispatch = useSelectionDispatch()              // (SelectionAction) → void
const id = Selection.cursor(sel)                     // ID | undefined
const selected = Selection.includes(sel, nodeId)     // boolean
dispatch({ type: "toggle", nodeId: "B" })
```

## What This Replaces

| Before (scattered) | After (`Selection.*`) |
|---|---|
| `cursorNodeId` in CursorStore | `Selection.cursor(sel)` |
| `cursorCardNodeId` | `ancestor(Selection.cursor(sel), "card")` |
| `cursorColumnNodeId` | `ancestor(Selection.cursor(sel), "column")` |
| `selectionLevel` / `editLevel` | `Selection.inputMode(sel)` |
| `multiSelected: Set<string>` | `Selection.ids(sel)` |
| `selectionAnchor` | `Selection.anchor(sel)` |
| `inlineEditBlock` | `Selection.isEditing(sel)` |
| `expandWithDescendants()` | NOT in Selection — operation targeting |

## Undo

- Content edits carry `selectionBefore`/`selectionAfter` as transaction metadata
- Undo restores both document state and selection
- Pure cursor/selection moves do NOT create undo entries

## Prior Art

| Feature | AppKit | SlateJS | ProseMirror | km |
|---|---|---|---|---|
| Storage | IndexSet | {anchor, focus} | abstract | **concrete Set** |
| Anchor/focus | Hidden | Exposed | Exposed | **Exposed** |
| Primary/cursor | No | No | No | **Yes** |
| Text+node | No | Yes | Yes | **Overlay (coexist)** |
| Membership | Stored | Stored | Stored | **Stored Set, hidden by interface** |
| Validated | No | No | Yes | **Invariants by construction** |
| Namespace | N/A | Editor.* | N/A | **Selection.*** |
| TEA | No | No | No | **Yes** |

## Future Extensions

**Don't need new types**: Canvas (same Set+cursor, no range walk), drill-in (scope change), handles (scope into object internals).

**Do need new types**: GridSelection (rectangular ranges, active cell), multiple cursors, collaborative cursors (presence overlay).

**Scope stack**: push/pop for drill-in — builds on FocusManager's existing scope stack.
