# Selection Model

Unified selection architecture for km — designed for tree/outliner today, extensible to creative tools (Keynote, Numbers, Figma-class) tomorrow.

Reviewed by GPT 5.4 Pro (2x, $8.69 total). Key feedback incorporated.

## Design Principles

1. **One authoritative selection value** — no scattered state
2. **Explicit anchor, focus, and lead** — nothing hidden or overloaded
3. **Discriminated union** — `kind` field, not optional fields
4. **Logical selection separate from visual projection** — `normalize/map/project` pipeline
5. **Selection describes what the user selected, not what commands affect** — operation targeting is a separate layer
6. **Per-scope ownership** — selection belongs to a selection scope (surface), not a pane
7. **Extensible to new domains** — grid, canvas, handles via new `kind` variants

## Core Types

```ts
// === Points (positions in different spaces) ===

type NodePoint = {
  kind: "node"
  nodeId: string
  edge?: "before" | "on" | "after"  // insertion/gap positions
}

type TextPoint = {
  kind: "text"
  nodeId: string
  field?: string                     // which editable field (title, body block, etc.)
  offset: number                     // character position
  affinity?: "forward" | "backward"  // line-wrap/bidi disambiguation
}

// Future extensions (not implemented yet):
// type CellPoint = { kind: "cell"; sheetId: string; row: number; col: number }
// type HandlePoint = { kind: "handle"; objectId: string; handleId: string }

type Point = NodePoint | TextPoint

// === Selection (discriminated union) ===

type Selection =
  | { kind: "none" }
  | NodeSelection
  | TextSelection
  // Future: | GridSelection | SceneSelection | NestedSelection

type NodeSelection = {
  kind: "node"
  scopeId: string                    // which selection surface owns this
  selected: ReadonlySet<string>      // explicit membership (stable, not derived from range)
  lead: string                       // primary item (inspector target, keyboard home)
  anchor: string | null              // shift-extend origin (null = no range active)
}

type TextSelection = {
  kind: "text"
  scopeId: string
  outer: NodeSelection               // the host node is selected structurally
  anchor: TextPoint                  // fixed end
  focus: TextPoint                   // active end (cursor position)
}
```

### Why explicit `selected: Set` instead of `range(anchor, focus)`

The Pro review identified that `range XOR toggled` is unstable:
- Extending a range can flip toggled items from "added" to "removed"
- Shrinking a range can flip them from "removed" to "added"
- API/voice commands need idempotent `add/remove`, not `toggle`

Explicit membership is stable. The `anchor` field enables shift-extend: `extendTo(target)` computes a range walk and replaces `selected` with the result. Clean, predictable.

### Why `lead` separate from `focus`

`focus` in a range is the "moving end." `lead` is the "primary selected item" — inspector target, keyboard home, alignment reference. They diverge on Cmd+click:
- Cmd+click F: adds F to selection. F becomes `lead`. But `focus` (range end) doesn't change.
- Invariant: `lead` must be in `selected`.

### Why `TextSelection` has `outer: NodeSelection`

Creative tools need nested selection — the card/object is structurally selected (border highlight, handles), AND you're editing text inside it. `outer` gives you both at once.

## Namespace Interface

```ts
const Selection = {
  // Constructors
  none(): Selection
  node(scopeId: string, nodeId: string): Selection
  text(scopeId: string, nodeId: string, field: string, offset: number): Selection

  // Common queries (work on all kinds)
  isNone(sel): boolean
  isCollapsed(sel): boolean
  kind(sel): "none" | "node" | "text" | ...
  lead(sel): string | null
  scopeId(sel): string | null

  // Lifecycle (the core pipeline)
  normalize(sel, doc): Selection           // structural validity (targets exist, offsets valid)
  map(sel, operation, doc): Selection      // transform through document edits
  project(sel, view, policy): Selection    // adapt to a specific view/pane
}

const NodeSelection = {
  // Queries
  members(sel): ReadonlySet<string>        // exact selected set
  roots(sel, tree): string[]               // top-level selected (excludes selected descendants)
  includes(sel, nodeId): boolean
  lead(sel): string

  // Mutations (all return new Selection)
  selectOnly(scopeId, nodeId): Selection
  add(sel, nodeId): Selection              // idempotent
  remove(sel, nodeId): Selection           // idempotent
  toggle(sel, nodeId): Selection           // for mouse gesture convenience
  extendTo(sel, nodeId, tree): Selection   // shift-click: range walk, replaces selected
  collapseToLead(sel): Selection           // Escape: keep only lead
}

const TextSelection = {
  range(sel): { anchor: TextPoint; focus: TextPoint }
  isCollapsed(sel): boolean
  outerNode(sel): NodeSelection
}
```

## Derived State (never stored)

```
inputMode(sel)         = sel.kind === "text" ? "text" : sel.kind === "none" ? "board" : "node"
cursorNodeId(sel)      = sel.kind === "node" ? sel.lead : sel.kind === "text" ? sel.focus.nodeId : null
cursorCardId(sel, tree) = ancestor(cursorNodeId, "card")
cursorColId(sel, tree)  = ancestor(cursorNodeId, "column")
```

Note: `inputMode` is a convenience for km. Creative tools keep tool/mode state separately from selection.

## normalize / map / project Pipeline

### normalize(sel, doc)
Structural validity against the document (not a view):
- Does the target node still exist? → snap to nearest sibling or parent
- Is the offset within content length? → clamp
- Is `lead` in `selected`? → set lead to first selected

### map(sel, operation, doc)
Transform selection through document edits:
- Node deleted → remove from selected, update lead
- Node moved → update if in selected
- Node split → selection follows the half containing the original position
- Content inserted before offset → shift offset

This is how undo/redo preserves selection — the transaction carries before/after selection.

### project(sel, view, policy)
Adapt to a specific pane's visible tree:
- Hidden nodes → policy decides: preserve invisibly, proxy to ancestor, or remove
- Filtered nodes → same policy
- Out-of-scope nodes → remove from this pane's projection

Policies:
- `"preserve"` — keep logical selection, render what's visible (default)
- `"proxy"` — snap hidden items to nearest visible ancestor
- `"strict"` — remove non-visible items from selection

Logical selection is NEVER mutated by projection. The pane gets a derived view.

## Gesture → Selection Transitions

### Keyboard (node mode)

| Current | Key | Action |
|---|---|---|
| none | j | `selectOnly(first visible node)` |
| node | j | `selectOnly(next visible)` |
| node | Shift+j | `extendTo(next, tree)` |
| node | Escape (has selection) | `collapseToLead()` |
| node | Escape (lead only) | `none` |
| node | Enter | → TextSelection (caret at field start) |

### Keyboard (text mode)

| Current | Key | Action |
|---|---|---|
| text | ArrowRight | move focus offset +1 |
| text | Shift+Right | extend text range |
| text | Escape | → outer NodeSelection |

### Mouse

| Gesture | Action |
|---|---|
| Click node B | `selectOnly(B)` |
| Shift+click B | `extendTo(B, tree)` — replaces selected with range walk |
| Cmd+click B | `toggle(B)` — B becomes lead |
| Click text in B | → TextSelection at position |
| Click empty | `none` |
| Drag across nodes | area select → `selectOnly(hit-test results)` |

### Voice / AI / API

| Command | Action |
|---|---|
| "Select card X" | `selectOnly(X)` |
| "Also select Y" | `add(Y)` — idempotent |
| "Deselect Y" | `remove(Y)` — idempotent |
| "Select from X to Y" | `extendTo(Y)` with anchor at X |
| "Edit card X" | → TextSelection |
| "Deselect all" | `none` |

## What This Replaces

| Current (scattered) | New (unified) |
|---|---|
| `cursorNodeId` in CursorStore | `Selection.lead(sel)` or `sel.focus.nodeId` |
| `cursorCardNodeId` | `ancestor(lead, "card")` |
| `cursorColumnNodeId` | `ancestor(lead, "column")` |
| `selectionLevel` | `inputMode(sel)` |
| `multiSelected: Set<string>` | `NodeSelection.members(sel)` |
| `selectionAnchor` | `sel.anchor` |
| `inlineEditBlock` | `sel.kind === "text"` |
| `ReactiveNodeStore.multiSelected` | `NodeSelection.members(sel)` |
| `expandWithDescendants()` | NOT in selection — that's operation targeting |

### Important: `expandWithDescendants` is NOT selection

When a card is selected, its descendants are visually highlighted. But the selection is `{card}`, not `{card, child1, child2, ...}`. Visual highlighting of descendants is a **rendering concern**, not selection state. Commands decide independently what to affect:
- Delete card → affects whole subtree
- Rename → affects card title only
- Move → moves card as one unit

## Selection Scope

Selection belongs to a scope (surface), not a pane. A pane may:
- Own a scope (most common)
- Mirror another scope (e.g., layers panel mirrors canvas selection)
- Host multiple scopes (e.g., sidebar tree + main content)

```ts
type SelectionScope = {
  id: string
  selection: Selection
}

type PaneState = {
  scopeId: string           // which scope this pane reads/writes
  rootId: string
  viewMode: "cards" | "detail" | ...
}
```

## Undo Integration

- Content edits carry selection before/after as transaction metadata
- Undo restores both document state and associated selection
- Pure cursor moves do NOT create undo entries
- Selection is part of the state machine: `(action, state) → [state, effects]`

## Prior Art

| Feature | Apple AppKit | SwiftUI | SlateJS | ProseMirror | km (this design) |
|---|---|---|---|---|---|
| Type | IndexSet | Set\<ID\> | {anchor, focus} | abstract Selection | discriminated union |
| Anchor | Hidden | Hidden | Exposed | Exposed | Exposed |
| Lead/primary | No | No | No | No | **Yes** |
| Text+node unified | No | No | Yes | Yes | **Yes (nested)** |
| Discrete+range | Implicit | Set only | N/A | N/A | **Explicit set + extendTo** |
| Validated | No | No | No | Yes | **Yes (normalize/map/project)** |
| Nested selection | No | No | No | No | **Yes (outer+inner)** |
| Multi-pane | Responder | Binding | Single | Single | **Scope-based** |

## Future Extensions

- **GridSelection**: `{ kind: "grid"; scopeId; anchor: CellPoint; focus: CellPoint; selected: Set<CellRef> }`
- **SceneSelection**: `{ kind: "scene"; scopeId; selected: Set<ObjectId>; lead: ObjectId }`
- **NestedSelection**: `{ kind: "nested"; outer: SceneSelection; inner: HandleSelection | TextSelection }`
- **Multiple cursors**: Array of TextSelections (like CodeMirror 6)
- **Collaborative cursors**: Remote selections with user/color metadata
