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
│   task_marker: "[ ]"|"[x]"|"[/]"|"[!]"|"[-]"   │
│   task_status: derived from task_marker          │
│   embed_source: string|null                      │
│   list_marker: string                            │
│   fstype: "repo"|"folder"|"file"|"mdsection"    │
│   rules: { collapse, limit, color, ... }        │
└─────────────────────────────────────────────────┘
```

## The Two Kinds of Node

The single most important distinction:

| | **Item** (`item: true`) | **Block** (`item: false`) |
|---|---|---|
| Children | Yes — forms tree hierarchy | No — leaf content |
| Navigation | Selectable, cursor can land on it | Not directly selectable |
| Board display | Card, sub-item, or column header | Body text, code block, HR |
| Outliner ops | Indent, outdent, split, merge | Part of parent item's body |
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
