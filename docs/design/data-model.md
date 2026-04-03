# Data Model — Tree & Board

Canonical reference for the node tree and board display. Read this before making data model changes.

## The Node (KNode)

Every piece of content is a **KNode** — a flat record with parent-child relationships:

```
┌─────────────────────────────────────────────────┐
│ KNode                                           │
│                                                 │
│ id: string (ULID)                               │
│ type: "p"|"h"|"code"|"quote"|"table"|"hr"|...   │
│ item?: ItemData   ← present = structural item   │
│ parent_id: string ← parent reference            │
│ parent_idx: number ← sibling order              │
│                                                 │
│ content: string   ← text content                │
│ name: string      ← slug/identifier             │
│ title: string     ← display title (materialized)│
│                                                 │
│ ItemData: { list?: string, task?: {marker,status} }
│                                                 │
│ Traits (orthogonal to type):                    │
│   embed_source: string|null                     │
│   fstype: "repo"|"folder"|"file"|"mdsection"    │
│   rules: { collapse, limit, color, ... }        │
└─────────────────────────────────────────────────┘
```

## Items and Blocks

The single most important distinction:

- **Item** (`item: { ... }`) — structural node that can have children. The cursor can land on it. Participates in outliner operations (indent, outdent, split, merge).
- **Block** (no `item` field) — leaf content. Not directly selectable. Part of a parent item's body.

`item` is a **presence trait** using an `ItemData` object. Items have `item: { ... }` — the object holds list marker and task data. Blocks simply don't have the field. All structural metadata lives inside `item`, keeping the item/block boundary clean.

```typescript
interface ItemData {
  list?: string                  // "-", "*", "+", "1.", etc.
  task?: { marker: TaskMarker; status: TaskStatus }
}
```

| | **Item** (`item: { ... }`) | **Block** (no `item`) |
|---|---|---|
| Children | Yes — forms tree hierarchy | No — leaf content |
| Navigation | Cursor target | Not selectable |
| Outliner ops | Indent, outdent, split, merge | Part of parent's body |
| Markdown | `## Heading` or `- list item` | Paragraph, code fence, quote |

**Type guards** (SlateJS namespace pattern):
```typescript
KNode.isItem(node)      // node.item != null
KNode.isBlock(node)     // node.item == null
KNode.isOutline(node)   // type === "h" && item != null
KNode.isListItem(node)  // type !== "h" && item != null
KNode.isTask(node)      // node.item?.task != null
KNode.isEmbed(node)     // has embed_source
```

## Visual Roles (View-Level Only)

An item's **visual role** is determined by its position in the tree relative to the board root — NOT by its type. The same KNode renders differently at each depth:

| Depth | Role | Selected appearance |
|---|---|---|
| 0 | Board root | Fullscreen — no chrome |
| 1 | **Column** | Header bar highlight |
| 2 | **Card** | Bordered box (title + sub-items + body) |
| 3+ | **Sub-item** | Indented line; expands to card-like frame when selected |

**This is a rendering rule, not data.** The "card-like container" that appears around a selected node is view-level decoration determined by:
1. **View type** — cards view, columns view, list view each have different chrome
2. **Tree depth** — depth 2 = card borders, depth 3+ = inline until selected
3. **Selection state** — sub-items expand to show their children when the cursor is on them

A sub-item "looks like a card" when selected because the view expands it — but it's still just an item at depth 3+. The data model doesn't know about cards or columns.

## km-ast vs KNode

Two representations of the same thing:

| km-ast (parser) | KNode (storage) | What it is |
|---|---|---|
| `oi` (outline item) | `type: "h", item: {}` | Section heading — creates hierarchy |
| `li` (list item) | `type: "p", item: { list?, task? }` | Bullet/task — content with children |
| `p` (paragraph) | `type: "p"` (no item) | Body text — leaf content |
| `h` (heading) | `type: "h"` (no item) | Heading block — leaf (rare, usually item) |
| `code` | `type: "code"` (no item) | Code block |
| `quote` | `type: "quote"` (no item) | Blockquote |

**`oi` and `li` don't exist in KNode** — they're km-ast parse types. Storage uses `type` + `item` object (`ItemData`).

## Board Hierarchy

```
Board Root ─────────── fstype: "repo" or "folder"
│
├── Column ──────────── type: "h", item: {} (direct child of root)
│   │
│   ├── Card ────────── item: { ... } (child of column, renders as bordered box)
│   │   ├── Sub-item ── item: { ... } (child of card, renders as indented line)
│   │   ├── Sub-item ── item: { ... }
│   │   └── Body ────── no item (block content BEFORE first sub-item)
│   │
│   ├── Card ────────── item: { ... }
│   └── Body Card ───── no item (block between cards, dimmed border)
│
└── Column ──────────── type: "h", item: {}
    └── ...
```

### What determines each role?

| Role | How determined | Not a separate type |
|---|---|---|
| **Column** | Direct child of board root + `item != null` | Same KNode, different position |
| **Card** | Direct child of column + `item != null` | Same KNode, different position |
| **Sub-item** | Child of card + `item != null` | Same KNode, different depth |
| **Body block** | Child with no `item` | Different: no hierarchy |
| **Body card** | Block child of column (between cards) | Rendered as dimmed card |

**Role is positional, not typed.** The same KNode type can be a column, card, or sub-item depending on where it sits in the tree.

## Operations Layer

Tree mutations are expressed as **atomic Operations** — 7 types inspired by SlateJS but using stable IDs (not paths):

```
insert_node, remove_node, set_node, move_node, split_node, merge_node, set_selection
```

Every operation is invertible: `inverse(op)` produces the op that undoes it. High-level mutations (split, mergeBackward) emit operations via an `onOp` callback, enabling undo without reimplementing business logic.

**Modules** (all in `packages/km-tree/src/`):

| Module | What |
|---|---|
| `operations.ts` | 7 Operation types, `inverse()`, `applyOperation()` |
| `selection.ts` | `Point` (nodeId + offset), `Range` (anchor + focus), `transformPoint`/`transformRange` for auto-adjusting selection after ops |
| `history.ts` | `withHistory` decorator — captures ops for undo/redo, groups into batches |
| `operation-log.ts` | `OperationLog` — append-only in-memory log with sequence-based filtering for replay/sync |
| `normalize.ts` | `withNormalization` decorator — enforces schema constraints after every mutation |

**Composition**: decorators compose — `withHistory(withNormalization(tree))` gives a TreeMutator with both undo and auto-normalization.

## Cursor Model

Three levels of cursor tracking for efficient re-rendering:

| Field | What | When set |
|---|---|---|
| `cursorNodeId` | The actual selected node (any level) | Always — the truth |
| `cursorCardNodeId` | The card containing the cursor | When cursor is at card or sub-item level |
| `cursorColumnNodeId` | The column containing the cursor | When cursor is in a column |

`cursorNodeId` is the source of truth. The others are derived for render optimization (only re-render affected cards/columns on cursor move).

**After spatial J/K navigation**, `cursorNodeId` can be any visible block — card title, sub-item, or column header.

## Selection

The cursor is a single node. **Selection** is a set of nodes — the cursor plus any shift-selected additional nodes.

| Concept | What | How stored |
|---|---|---|
| **Cursor** | Single node — the "active" node | `cursorNodeId` |
| **Selection** | Set of nodes including the cursor | `selectedNodeIds: Set<string>` |
| **Anchor** | The node where shift-selection started | `selectionAnchorId` |

**Editing operations work with selection, not just cursor.** When multiple nodes are selected:
- **Indent/outdent**: All-or-nothing — if any node fails the guard, none move
- **Delete**: Batch delete all selected nodes (single undo entry)
- **Move**: All selected nodes move together
- **Split/merge**: Only operates on cursor node (selection is cleared)

**Selection constraints**:
- All selected nodes must be siblings (same parent) — no cross-branch selection
- Selection is always contiguous (shift+J/K extends range)
- Selection lives within one column — no cross-column selection

**CursorContext (future)** should include the full selection, not just the cursor node. This way operations don't need to separately query the selection.

### Text-Level Selection (Point & Range)

In addition to the node-level cursor, the operations layer defines **text-level selection** for within-node editing:

- **Point** — `{ nodeId, offset }` identifies a position within a node's text content
- **Range** — `{ anchor, focus }` spans from one point to another; when collapsed, represents a text cursor

Points use stable node IDs (not paths), so `transformPoint`/`transformRange` after tree operations is simpler than in SlateJS — most ops only affect the referenced node.

## Body Content

"Body" = block content that appears **before the first sub-item** in a parent:

```
Card: "Project Alpha"
  ├── [body] "Description of the project..."    ← body (block, before items)
  ├── [body] "Key stakeholders: ..."            ← body
  ├── [item] "- [ ] Design mockups"             ← first sub-item (items start here)
  └── [item] "- [ ] Review with team"
```

Body is extracted by `extractBody(children)` — splits children into `{ body, items }`.

## View Models

The TUI wraps KNode in view models for rendering:

| View model | Wraps | Adds |
|---|---|---|
| `CardView` | KNode | `isBody`, `resolvedNode` (embed), `isBrokenEmbed`, `hasBodyChildren` |
| `ColumnView` | KNode + CardView[] | `wipLimit`, `isVirtual`, `totalCardCount`, `hiddenDescendantCount` |

## Comparison with Decker

| Aspect | km | Decker |
|---|---|---|
| Storage | Flat KNode + parent_id (SQLite) | Nested Slate tree (Yjs CRDT) |
| Type system | `type` + `item` boolean + traits | Unified `ItemElement` |
| Content | `content` string field | First child `ItemContentElement` |
| Body | Blocks before first item child | Content element (always first) |
| Rich text | Markdown in content string | Slate inline nodes |
| Collaboration | File sync (bidirectional) | Yjs real-time CRDT |

**Shared structure**: Both use Board → Column → Card → Sub-item hierarchy. Both have body content and transclusion. The outliner spec (`docs/design/outliner-spec.md`) defines shared editing behavior.

## Tree Traversal (`KTree.nodes`)

`KTree.nodes(tree, rootId, opts?)` is the single composable primitive for tree iteration. DFS pre-order, yields `[node, depth]` entries. Exported from `@km/tree`.

### Options

| Option | Type | Default | What it controls |
|---|---|---|---|
| `match` | `(node) => boolean` | all | Which nodes are **yielded** — never affects descent |
| `into` | `(node) => boolean` | always true | Whether to **descend** into children — never affects yielding |
| `reverse` | `boolean` | false | DFS in reverse order (last child first) |
| `at` | `string` | — | Skip all nodes before this ID in DFS order |
| `mode` | `"all" \| "highest" \| "lowest"` | `"all"` | Match mode: every match, shallowest per branch, or deepest per branch |

`match` and `into` are **orthogonal** — match never affects descent, into never affects yielding. This replaces the old `walkTree` which conflated filtering (what to yield) with pruning (what subtrees to skip).

### Three-Layer Predicate Taxonomy

Predicates used with `KTree.nodes` fall into three layers:

**Tree layer (match predicates)** — data model type, independent of view state:
- `KNode.isOutline`, `KNode.isItem`, `KNode.isBlock`, `KNode.isListItem`
- `KNode.isTask`, `KNode.isEmbed`

**View layer (into predicates)** — whether to descend into subtrees, depends on UI state:
- `isCollapsedChild` — node is hidden by parent's collapsed state
- `isHidden` — node is filtered out (e.g., done tasks hidden)
- `foldDepths` — fold level controlling which depths are expanded

**Render layer (neither)** — display-only concerns, not part of tree walking:
- `maxContentLines` — truncation for long content
- Task status filter — which statuses to show (done/todo/all)

### Examples

```typescript
// All outline items (headings with item data)
KTree.nodes(tree, rootId, { match: KNode.isOutline })

// Visible navigable nodes (skip collapsed subtrees)
KTree.nodes(tree, rootId, { match: isNavigable, into: n => !isCollapsed(n) })

// Last node in subtree
const [last] = [...KTree.nodes(tree, rootId, { reverse: true })].slice(0, 1)

// Shallowest tasks only (skip nested tasks)
KTree.nodes(tree, rootId, { match: KNode.isTask, mode: "highest" })
```

Source: `packages/km-tree/src/walk.ts`

## Invariants

1. **Items can have children, blocks cannot** — `item != null` is the only prerequisite for `getChildren()`
2. **View/board role is positional** — a KNode's board role (column/card/sub-item) depends on its depth, not its type
3. **parent_id "." means root** — the board root uses "." as parent_id (not null)
4. **parent_idx determines order** — siblings sorted by parent_idx (fractional indexing)
5. **Cursor must point to existing node** — invariant check: `cursor-exists`
6. **Cursor must be under board root** — invariant check: `cursor-under-root`

## Validation

Post-mutation invariant checking. Check-only (no auto-fix). Gated by `KM_STRICT=1`. Inspired by Slate + Decker.

```typescript
// The entire API:
tree.validate()        // plugin override chain — throws on bad state
tree.withBatch(fn)     // defer validate until batch ends
// KM_STRICT=1 enables it, zero overhead otherwise
```

Each `with*` plugin overrides `validate()`. Standard plugin pattern:

```typescript
function withOutliner(tree) {
  const { validate } = tree
  tree.validate = () => {
    validate()  // previous checks first
    // your checks — throw on violation
  }
  return tree
}
```

### Example

```typescript
function withTree(tree) {
  const { validate } = tree
  tree.validate = () => {
    validate()
    for (const node of tree.allNodes()) {
      if (!node.item && tree.getChildren(node.id).length > 0)
        throw new Error(`block-has-children: ${node.id}`)
    }
  }
  return tree
}
```

### What to add when needed (not now)

- **Dirty tracking** — when `allNodes()` iteration is too slow for large trees, track which nodes ops touched and only validate those
- **Scope object** — pass dirty set to `validate(scope)` so plugins can focus their checks
- **Pre/post snapshots** — capture node state before/after ops for diagnostics
- **Lazy diagnostics** — build expensive error context only when a validator throws

Start simple. Add complexity when profiling or debugging demands it.
