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
│ item: boolean     ← true = structural, has kids │
│ parent_id: string ← parent reference            │
│ parent_idx: number ← sibling order              │
│                                                 │
│ content: string   ← text content                │
│ name: string      ← slug/identifier             │
│ title: string     ← display title (materialized)│
│                                                 │
│ Traits (orthogonal to type):                    │
│   task_marker: "[ ]"|"[x]"|"[/]"|"[!]"|"[-]"    │
│   task_status: derived from task_marker         │
│   embed_source: string|null                     │
│   list_marker: string                           │
│   fstype: "repo"|"folder"|"file"|"mdsection"    │
│   rules: { collapse, limit, color, ... }        │
└─────────────────────────────────────────────────┘
```

## Items and Blocks

The single most important distinction:

- **Item** (`item: true`) — structural node that can have children. The cursor can land on it. Participates in outliner operations (indent, outdent, split, merge).
- **Block** (no `item` field) — leaf content. Not directly selectable. Part of a parent item's body.

`item` is a **presence trait**, not a boolean. Items have `item: true`. Blocks simply don't have the field. (Same pattern as `task_marker` — present means task, absent means not.)

**Future consideration**: `item` could be an object containing item-specific properties (`{ list: "-", task: "[ ]" }`), grouping `list_marker`, `task_marker`, `task_status` under the item trait instead of scattering them at the top level. This would make the item/block boundary even cleaner — all structural metadata lives inside `item`, blocks have no `item` field at all.

| | **Item** (`item: true`) | **Block** (no `item`) |
|---|---|---|
| Children | Yes — forms tree hierarchy | No — leaf content |
| Navigation | Cursor target | Not selectable |
| Outliner ops | Indent, outdent, split, merge | Part of parent's body |
| Markdown | `## Heading` or `- list item` | Paragraph, code fence, quote |

**Type guards** (SlateJS namespace pattern):
```typescript
KNode.isItem(node)      // node.item === true
KNode.isBlock(node)     // !node.item
KNode.isOutline(node)   // type === "h" && item === true
KNode.isListItem(node)  // type !== "h" && item === true
KNode.isTask(node)      // has task_marker or task_status
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
| `oi` (outline item) | `type: "h", item: true` | Section heading — creates hierarchy |
| `li` (list item) | `type: "p", item: true` | Bullet/task — content with children |
| `p` (paragraph) | `type: "p", item: false` | Body text — leaf content |
| `h` (heading) | `type: "h", item: false` | Heading block — leaf (rare, usually item) |
| `code` | `type: "code", item: false` | Code block |
| `quote` | `type: "quote", item: false` | Blockquote |

**`oi` and `li` don't exist in KNode** — they're km-ast parse types. Storage uses `type` + `item` boolean.

## Board Hierarchy

```
Board Root ─────────── fstype: "repo" or "folder"
│
├── Column ──────────── type: "h", item: true (direct child of root)
│   │
│   ├── Card ────────── item: true (child of column, renders as bordered box)
│   │   ├── Sub-item ── item: true (child of card, renders as indented line)
│   │   ├── Sub-item ── item: true
│   │   └── Body ────── item: false (block content BEFORE first sub-item)
│   │
│   ├── Card ────────── item: true
│   └── Body Card ───── item: false (block between cards, dimmed border)
│
└── Column ──────────── type: "h", item: true
    └── ...
```

### What determines each role?

| Role | How determined | Not a separate type |
|---|---|---|
| **Column** | Direct child of board root + `item: true` | Same KNode, different position |
| **Card** | Direct child of column + `item: true` | Same KNode, different position |
| **Sub-item** | Child of card + `item: true` | Same KNode, different depth |
| **Body block** | Child with `item: false` | Different: no hierarchy |
| **Body card** | Block child of column (between cards) | Rendered as dimmed card |

**Role is positional, not typed.** The same KNode type can be a column, card, or sub-item depending on where it sits in the tree.

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

## Invariants

1. **Items can have children, blocks cannot** — `item: true` is the only prerequisite for `getChildren()`
2. **Role is positional** — a KNode's board role (column/card/sub-item) depends on its depth, not its type
3. **parent_id "." means root** — the board root uses "." as parent_id (not null)
4. **parent_idx determines order** — siblings sorted by parent_idx (fractional indexing)
5. **Cursor must point to existing node** — invariant check: `cursor-exists`
6. **Cursor must be under board root** — invariant check: `cursor-under-root`
