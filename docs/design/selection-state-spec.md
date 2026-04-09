# Selection State Spec

Defines the 5 state concepts that govern cursor, selection, editing, focus scoping, and visual treatment in km-tui. Implementation reference for `km-tui.focus` epic and `km-tui.hierarchical-node-state`.

## The 5 Concepts

These are SEPARATE even when the UX feels unified.

| # | Concept | Source of truth | Nullable? | What it answers |
|---|---------|----------------|-----------|-----------------|
| 1 | **Logical focus (cursor)** | `sel.node.cursor()` | Yes (deselected) | "Which node do commands target?" |
| 2 | **Selection set** | `sel.node.ids()` | Empty set | "Which nodes are batch-operated on?" |
| 3 | **Editing owner** | `sel.text()?.nodeId` | Yes (not editing) | "Which node owns the text cursor?" |
| 4 | **Active scope** | `focusManager.activeScopeId` | Yes (root scope) | "Which pane/container captures keyboard?" |
| 5 | **Muted scope** | Derived (ancestor of cursor/selection) | N/A | "Which subtrees are visually de-emphasized?" |

### Relationships

- **Cursor ⊂ Selection**: cursor is always the first element of the selection set (or null when deselected). Single-select = selection set of one = cursor.
- **Editing implies cursor**: `sel.text()` is non-null only when cursor is on the same node. Editing without cursor is an invariant violation.
- **Active scope is orthogonal**: scope tracks which PANE has keyboard capture (board vs detail). Cursor/selection live within the active scope's pane.
- **Muted scope is derived**: a node is in muted scope when an ancestor is selected/editing. Not stored — computed from cursor + selection + editing via tree walk (or signals).

## The Card as Bridge

A card is a container node at column depth. It bridges node selection and text selection:

| User action | Node selection | Text selection | Card's role |
|---|---|---|---|
| Click card | cursor = cardId | — | Selected container |
| j/k into card's child | cursor = subItemId | — | Breadcrumb parent (yellow border) |
| Enter on card title | cursor = cardId | {nodeId: cardId, offset} | Editing scope (bold focusborder) |
| Enter on sub-item | cursor = subItemId | {nodeId: subItemId, offset} | Editing scope (bold focusborder) |
| Arrow up/down in edit | cursor = adjacentId | {nodeId: adjacentId, offset: 0} | Editing scope unchanged |
| Escape from edit | cursor = nodeId | — (cleared) | Returns to node selection |

The card is the **editing scope**: the `editingDescendant` reduced signal on each node tracks whether any descendant is being edited. The bold focusborder wraps the scope (the card), not the individual node being edited. Analogous to VS Code's editor pane having focus border, not the individual line.

**Dual role**: cards are focusable containers normally (click, j/k to select). Promoted to editing scopes when any descendant enters text mode (captures keyboard, suppresses selection highlights, shows bold focusborder).

## Mode Ladder

Each level is a distinct state. Escape peels one layer up. Enter/click descends.

```
deselected ←Esc── board ←Esc── column ←Esc── card ←Esc── sub-item ←Esc── text-edit
(null)            (rootId)      (colId)       (cardId)    (subItemId)      (sel.text)
   │                 │             │              │            │               │
   j→ first card     h/l→         j/k→           j/k→         Enter→          ArrowUp/Down→
                                                                              (adjacent node,
                                                                               stays in edit)
```

### Transitions

| From | Trigger | To | State change |
|---|---|---|---|
| Deselected | j/k/h/l | Card focused | cursor = first card in first column |
| Deselected | Click card | Card focused | cursor = clicked card |
| Deselected | Click top-bar | Board level | cursor = rootId |
| Board level | j/k | Card focused | cursor = first card |
| Board level | Escape | Deselected | cursor = null |
| Column focused | j/k | Card focused | cursor = first/last card in column |
| Column focused | Escape | Deselected | cursor = null |
| Card focused | Enter/i | Text editing | sel.text.edit(cardId, 0) |
| Card focused | j (outline) | Sub-item focused | cursor = first child |
| Card focused | Escape | Deselected | cursor = null |
| Sub-item focused | Enter/i | Text editing | sel.text.edit(subItemId, 0) |
| Sub-item focused | Escape | Card focused | cursor = parent card |
| Text editing | Escape | Node focused (same node) | sel.text cleared |
| Text editing | ArrowUp/Down | Text editing (adjacent) | cursor + sel.text move together |
| Text editing | Click outside card | Card focused (clicked) | sel.text cleared, cursor = clicked |

## Interaction Matrix

What each element looks like in each state:

| Element | Deselected | Board level | Column focused | Card focused | Sub-item focused | Text editing |
|---|---|---|---|---|---|---|
| **Board bg** | none | $selection-bg tint | none | none | none | none |
| **Column title** | normal | tinted | inverse | normal (or breadcrumb if cursor in col) | breadcrumb yellow | breadcrumb yellow |
| **Card border** | invisible ($surface-bg) | invisible | invisible | $selection-bg yellow | $selection-bg yellow (breadcrumb) | bold $focusborder |
| **Card bg** | none | none | none | selectedBg tint | none | none |
| **Card title** | normal fg | normal fg | normal fg | inverse ($selection-bg/$selection) | normal fg + yellow border | normal fg (no inverse) |
| **Sub-item title** | normal | normal | normal | normal | inverse ($selection-bg/$selection) | normal (no highlights) |
| **Body text** | muted, not bold | muted, not bold | muted, not bold | muted, not bold | muted, not bold | muted, not bold |
| **+N more** | matches border | matches border | matches border | matches border | matches border | matches border |
| **Hover any card** | border → $muted | — | — | — | — | — |

## Node Capabilities

Not every node participates in every state concept. Three capabilities:

| Capability | Meaning | Examples | Determines |
|---|---|---|---|
| **Selectable** | Can receive cursor; can be in selection set | Cards, sub-items, column headers, body blocks | What j/k/click/shift-select can land on |
| **Editable** | Can enter text mode (has content to edit) | Cards with title, sub-items with content, body paragraphs | What Enter/i activates |
| **Scoped** | Creates a keyboard capture boundary when active | Cards in edit mode, detail pane, dialogs | What traps keys and shows focusborder |

### Spatial selection

Navigation (j/k, arrows, mouse click) IS selection — moving the cursor selects the target node. "Spatial selection" means: given a direction, find the nearest SELECTABLE node and select it. Non-selectable nodes (decorative separators, overflow indicators, virtual grouping nodes) are skipped.

Silvery's `focusDirection("up"/"down"/"left"/"right")` provides the spatial lookup. The `focusable` prop on a Box marks it as a valid target. In km, `focusable` = selectable.

### Capability matrix

| Node type | Selectable | Editable | Scoped (when editing) |
|---|---|---|---|
| Board root | Yes (cursor=rootId) | No | No |
| Column header | Yes | Yes | No |
| Card (structural item) | Yes | Yes | Yes (bold focusborder) |
| Sub-item inside card | Yes | Yes | No (card is the scope) |
| Body block (paragraph/li) | Yes | Yes | Yes (same as card) |
| Body card at column top | Yes | Yes | Yes |
| Code block | Yes | Yes (code editing) | No (card is the scope) |
| Table block | Yes | No (read-only) | No |
| HR separator | Yes (navigable) | No | No |
| +N more overflow | No | No | No |
| Virtual __body__ column | Yes (cursor can land) | No | No |
| Virtual __meta__ field | Yes (detail pane) | Yes (some) | No |
| Dialog content | No (own focus system) | — | Yes (modal scope) |

## Command Target Precedence

When a command fires, which node(s) does it act on?

| Command type | Target | Example |
|---|---|---|
| **Cursor movement** (j/k/h/l) | Cursor node → move | cursor_down |
| **Edit entry** (Enter/i) | Cursor node → enter text mode | enter_inline_edit |
| **Batch mutation** (delete, move, cut) | Selection set if >1, else cursor | delete_node |
| **Single mutation** (fold, zoom) | Cursor node only | fold_node, zoom_in |
| **Board-level** (fold all, filter, view mode) | Board root (no cursor needed) | fold_all_more, filter |
| **Text ops** (type, delete char) | Editing owner (sel.text target) | TEXT_INSERT |

## Visible Order vs Structural Order

Two different orderings exist:

| | Structural order | Visible order |
|---|---|---|
| **Source** | Tree DFS (parent → children) | Tree DFS minus collapsed/filtered/hidden nodes |
| **Used by** | Path.compare, ancestor/descendant tests | Range selection, j/k navigation, shift-select |
| **Includes collapsed** | Yes | No |
| **Includes filtered** | Yes | No |
| **Includes virtual (__body__, __meta__)** | No (not in tree) | Yes (in view lens) |

Range selection (shift+j/k) uses visible order. Path.compare uses structural order. These diverge when nodes are collapsed or filtered.

## Selection Representation (current → target)

### Current
```ts
cursor: string | null           // sel.node.cursor()
selectedIds: Set<string>        // sel.node.ids() — includes cursor
editTarget: { nodeId, offset }  // sel.text()
```
Plus derived: cursorCardNodeId, cursorColumnNodeId, cursorDepth — computed in Board.tsx and synced to ReactiveNodeStore. Editing scope detected via `editingDescendant` reduced signal (per-node, not store-level).

### Target (Phase F of km-tui.focus)
```ts
cursor: { nodeId: string, path: Path } | null
selection: { anchor: { nodeId, path }, focus: { nodeId, path } }
editTarget: { nodeId: string, offset: number } | null
```
Hybrid identity: nodeId for stability across mutations, path for ordering/range math. Remap strategy: after tree mutations, re-derive path from nodeId; if nodeId deleted, clear selection.

## Invariants (impossible combinations)

These should be dev-mode assertions:

- [ ] Editing without cursor: `sel.text() !== null && sel.node.cursor() === null`
- [ ] Editing node ≠ cursor node: `sel.text()?.nodeId !== sel.node.cursor()`
- [ ] Selection anchor without focus (or vice versa)
- [ ] Cursor on node not visible in current view (not in ViewTree)
- [ ] Active scope pointing to non-existent pane
- [ ] Multi-select across panes (each pane has independent selection)
- [ ] editingDescendant true but sel.text() is null (editing signal without active text selection)

## Multi-Select

Any selectable node can be multi-selected — cards, sub-items, body blocks, column headers. The selection set is a flat set of node IDs (not limited to one tree level). Text editing and multi-select are mutually exclusive (entering edit clears multi-select).

| Action | Effect on selection set |
|---|---|
| Click node | Set = {clicked node} |
| Ctrl-click node | Toggle node in set |
| Shift+j/k | Extend set in direction (visible order) |
| j/k (no shift) | Collapse set to cursor |
| Enter (edit) | Clear multi-select, enter edit on cursor |
| Escape | If multi-selected: collapse to cursor. If single: deselect. |

Batch commands (delete, move, cut, task status) operate on the full selection set. Single commands (fold, zoom, edit) operate on cursor only.

## See Also

- `apps/km-tui/src/views/selection-style.ts` — implementation rules (to be rewritten around this spec)
- `km-tui.focus` — epic tracking the unification
- `km-tui.hierarchical-node-state` — signals implementation
- `docs/design/selection-model.md` — @silvery/selection API design
