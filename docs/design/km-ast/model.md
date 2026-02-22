# km-ast: Knowledge Tree Model

One unified tree stored in SQLite. All content (markdown files, folders, list items) lives in it. No separate "outline" — just the tree.

## Types

```typescript
// 10 node types, 3 categories
type BlockType = "p" | "code" | "quote" | "table" | "hr" | "html" | "math"  // 7
type ItemType  = "oi" | "li"                                                 // 2
type LinkType  = "link"                                                      // 1
type NodeType  = BlockType | ItemType | LinkType                             // 10
```

## Two Categories

**Items** (oi, li) — containers. Can have children, are zoomable, recursive. Title stored in `.content` field.

**Blocks** (p, code, quote, table, hr, html, math) — leaf content. Not zoomable. No children (except `quote`, which can contain blocks).

**Link** — reference to another node. Lightweight pointer; transclusion resolved at render time.

## Terminology

- **title**: display text for an item. Resolution: `content → name → id`. Every item resolves to something.
- **name**: stored identity string (filename, slug). May or may not match title.
- **marker**: prefix decoration. Both list style (`list_marker`) and task checkbox (`task_marker`) are markers.

## Items: oi and li

Structurally almost identical. Both recursive, both navigable, both use `.content` as title. The differences are serialization and default rendering:

| | **oi** (outline item) | **li** (list item) |
|---|---|---|
| Markdown | Headings (`# Title`, `## Sub`) | List items (`- text`, `- [ ] task`) |
| Default rendering | Card / column | Checklist row |
| Interleaving | Blocks before subitems only (heading parsing limitation) | Blocks and sub-li can interleave freely |
| Heading level | Derived from tree depth (never stored) | N/A |

### OutlineItem (oi)

Creates the document hierarchy: repo → folders → files → sections.

| Field           | Type         | Notes                                          |
|-----------------|--------------|------------------------------------------------|
| `type`          | `"oi"`       | Always "oi"                                    |
| `content`       | `string?`    | Title text. Empty is valid (item has body but no title) |
| `fstype`        | `FsType`     | repo, folder, file, mdfile, mdsection          |
| `name`          | `string?`    | Filesystem identity / heading slug             |
| `task_marker`   | `string?`    | Checkbox: `"[ ]"`, `"[x]"`, `"[/]"`, `"[!]"`, `"[-]"` |
| `children`      | `Node[]`     | Ordered list of any node types                 |

No `.blocks[]` or `.subitems[]` split in the model. Children are flat, ordered. The view decides what becomes columns vs body.

Title is `.content`. Heading level is derived from tree depth.

### ListItem (li)

| Field           | Type         | Notes                                          |
|-----------------|--------------|------------------------------------------------|
| `type`          | `"li"`       | Always "li"                                    |
| `content`       | `string?`    | Title text (rendered as checkbox text)         |
| `list_marker`   | `string`     | `"-"`, `"*"`, `"+"`, `"1."`, `"1)"`, `"[^1]"` |
| `task_marker`   | `string?`    | Checkbox: `"[ ]"`, `"[x]"`, etc. (optional)   |
| `children`      | `Node[]`     | Ordered list of any node types (interleaved)   |

Same structure as oi. The one structural difference: li's children can interleave blocks and sub-li items in any order (markdown indentation disambiguates). For oi, blocks must come before subitems (markdown heading parsing cannot disambiguate trailing blocks).

Headings inside list items are parsed as child `li` nodes, not as a separate `h` block type. There is no `h` node type in km-ast.

### Block

Content leaf. Has a `content` string. No children (except `quote`).

| Type    | Content                          |
|---------|----------------------------------|
| `p`     | Paragraph text (inline markdown) |
| `code`  | Code block (lang in data)        |
| `quote` | Blockquote text (can contain child blocks) |
| `table` | Raw markdown table               |
| `hr`    | Empty (horizontal rule)          |
| `html`  | Raw HTML                         |
| `math`  | Block math (LaTeX)               |

### Link

References another node. Can appear anywhere a block can.

| Field           | Type         | Notes                                          |
|-----------------|--------------|------------------------------------------------|
| `type`          | `"link"`     | Always "link"                                  |
| `link_to`       | `string`     | Target node ID                                 |
| `embed`         | `boolean`    | true = transclude content, false = reference   |
| `children`      | `Node[]`     | Optional: alias content (children[0] = alias p) |

`![[target|alias]]` → link with a `p` child as alias. When absent, display falls back to target's title.

## Children Model

Items have `.children` — a flat, ordered list of any node types. No `.blocks[]` / `.subitems[]` split in the model. Children are just children.

```
oi (content="Project")
  p "Description"              # children[0]
  p "More details"             # children[1]
  oi (content="Phase 1")       # children[2]
  oi (content="Phase 2")       # children[3]

li (content="Buy groceries")
  p "From the store"           # children[0]
  li (content="Milk")          # children[1]
  li (content="Eggs")          # children[2]
  p "Check prices first"       # children[3]
  li (content="Bread")         # children[4]
```

For oi: blocks come before subitems (serialization constraint from markdown heading parsing).
For li: blocks and sub-li can interleave in any order (indentation disambiguates in markdown).

This is a model constraint for oi, not just a convention — the markdown parser cannot round-trip blocks after sub-headings. For li, full interleaving is supported.

## Title Resolution

Every item resolves to a display title:

```
content  →  name  →  id
```

- `content`: the item's text field (primary)
- `name`: filesystem identity / heading slug (fallback)
- `id`: the node's ULID (last resort, shown distinctly in UI)

Heading level is implicit from tree depth (never stored).

### Name ↔ Title by fstype

| fstype     | name source       | content                | Sync               |
|------------|-------------------|------------------------|---------------------|
| repo       | repo name         | from index .md if any  | name → display      |
| folder     | dirname           | from index .md if any  | name → display      |
| file/mdfile| filename sans .md | H1 text                | name ↔ title        |
| mdsection  | slugified heading | heading text           | title → name        |

Folders can have an associated index file (`folder/folder.md`, `README.md`, or `.md`) that provides body content and metadata (frontmatter).

## Rendering (View Concern)

Rendering is context-dependent. A node's type is a serialization identity and default rendering hint. The **position** determines actual rendering.

### Board view (zoomed into an item)

The view splits an item's children for display:

**Zoomed into oi**: same-type (oi) children → columns. Everything else (blocks, li, links) → body pane.

```
┌─── body ────────┬─── Phase 1 ────┬─── Phase 2 ────┐
│ Description      │ Task A         │ Task D         │
│ More details     │ Task B         │ Task E         │
│ ☐ Quick todo    │ Task C         │                │
└──────────────────┴────────────────┴────────────────┘
```

li children in the body render as checklist rows within the body pane.

**Zoomed into li**: renders as a list view. Everything in order — blocks as content, sub-li as checklist rows. Interleaving preserved.

```
┌─────────────────────────────┐
│ Buy groceries               │
│ From the store              │
│ ☐ Milk                      │
│ ☐ Eggs                      │
│ Check prices first          │
│ ☐ Bread                     │
└─────────────────────────────┘
```

**Open question**: li MAY also render as a board with columns (sub-li as columns). Use case: large outlines of li items. Decision deferred.

**Fallback**: item with no same-type children → detail/list view (body content only).

### Embedding rule

When embedded or placed in a different context, a node takes on the rendering style of its position:

- oi at column position → card (native)
- li at column position → card (takes on host style)
- oi in body → body content
- li in body → checklist row (native)

### Navigation

Navigation is **purely spatial** (hjkl = left/down/up/right on screen). Navigation does not know about node types. It only knows about visual positions.

Rendering determines layout. Layout determines what spatial navigation does:
- Board layout: h/l moves between columns, j/k moves within
- List layout: j/k moves between items, h/l may collapse/expand
- Same keys, same spatial behavior — the content type only affects layout

## Lazy Loading (SQL)

```sql
-- Subitems only (board columns — title is .content on each node)
SELECT * FROM nodes WHERE parent_id = ? AND type IN ('oi', 'li')

-- Body blocks only (detail pane, on demand)
SELECT * FROM nodes WHERE parent_id = ? AND type NOT IN ('oi', 'li')

-- Title (already on the item node itself — no query needed)
-- Just use node.content
```

No body container node needed. Type-based SQL filtering provides lazy loading.

## Task Trait

Any Item (oi or li) can be a task via `task_marker`. Task status is **derived** from the marker:

| task_marker | Status    |
|-------------|-----------|
| `"[ ]"`     | todo      |
| `"[x]"` `"[X]"` | done |
| `"[/]"`     | wip       |
| `"[!]"`     | blocked   |
| `"[-]"`     | dropped   |
| absent      | not a task|

`task_marker` is the stored value. `task_status` is a computed getter.

## List Markers

```
Unordered:  "-", "*", "+"
Ordered:    "1.", "1)", "3."   (start number + delimiter)
Footnote:   "[^1]", "[^note]"
```

Ordered vs unordered derived from `list_marker`. Actual numbers computed from sibling position. Consecutive lis with compatible markers serialize to one markdown list.

Footnote definitions (`[^1]: text`) are li nodes with footnote markers. References (`[^1]`) stay inline in content strings.

## Predicates

```typescript
const isItem     = (t: NodeType) => t === "oi" || t === "li"  // primary structural check
const isOutline  = (t: NodeType) => t === "oi"
const isListItem = (t: NodeType) => t === "li"
const isLink     = (t: NodeType) => t === "link"
const isBlock    = (t: NodeType) => !isItem(t) && !isLink(t)
```

`isItem` is the primary structural predicate — items are containers, blocks are leaves.

## Content Model (Parent Constraints)

What can contain what:

```
oi    → any node types as children (blocks, li, link; subitems are oi)
li    → any node types as children (blocks, link; subitems are li; can interleave)
quote → blocks (p, code, math, table, hr, html, link, li)
link  → blocks (p) — alias only
p, code, math, table, hr, html → no children (leaf nodes)
```

Key constraints:
- **oi only inside oi**: A heading inside a list item becomes a child `li`, not an `oi`
- **li anywhere a block can**: Lists can appear inside oi children, li children, or blockquotes
- **link is a leaf**: Never contains subitems — transclusion resolved at render time

## Skipped Heading Levels

On parse: `H1 → H3` (skipping H2) inserts a synthetic oi at the missing level. On serialize: heading level = tree depth. Round-trip normalizes: `H1 → H3` becomes `H1 → H2 → H3`. No serialization hints stored.

## Markdown Coverage

How every CommonMark + GFM + Obsidian construct maps to km-ast:

| Markdown Construct | km-ast Representation |
|---|---|
| **Block-level** | |
| Paragraph | `p` |
| ATX heading (`# text`) | `oi(content:"text")` — title in `.content` |
| Setext heading (`text\n===`) | `oi` (normalized to ATX on round-trip) |
| Fenced code block (` ``` `) | `code` (lang in `data.lang`) |
| Indented code block | `code` |
| Blockquote (`> text`) | `quote` (children are blocks) |
| Nested blockquote (`>> text`) | `quote` containing `quote` |
| Thematic break (`---` / `***`) | `hr` |
| GFM table | `table` (raw markdown in content) |
| HTML block | `html` |
| Block math (`$$...$$`) | `math` (LaTeX in content) |
| **Lists** | |
| Unordered list item (`- text`) | `li(list_marker:"-")` |
| Ordered list item (`1. text`) | `li(list_marker:"1.")` |
| Task list item (`- [ ] text`) | `li(list_marker:"-", task_marker:"[ ]")` |
| Nested list | `li` containing child `li` |
| Multi-paragraph list item | `li` containing multiple `p` children |
| Footnote def (`[^1]: text`) | `li(list_marker:"[^1]")` |
| **Outline structure** | |
| Directory | `oi(fstype:"folder")` |
| Markdown file | `oi(fstype:"mdfile")` |
| Non-markdown file | `oi(fstype:"file")` |
| Section (H2+ heading) | `oi(fstype:"mdsection")` — title in `.content` |
| Repository root | `oi(fstype:"repo")` |
| **Links & embeds** | |
| `![[target]]` (embed) | `link(embed:true)` |
| `![[target\|alias]]` | `link(embed:true)` with `p("alias")` as child |
| `[[target]]` standalone | `link(embed:false)` |
| `[[target]]` inline | Stays in `p.content`, indexed in `links` table |
| `[text](url)` | Stays in `p.content` (inline) |
| `![alt](url)` | Stays in `p.content` (inline image) |
| `![[image.png]]` (vault image) | `link(embed:true)` pointing to image node |
| `[^1]` reference | Stays in `p.content` (inline) |
| **Metadata** | |
| YAML frontmatter (`---`) | `data` JSON field on file's `oi` node |
| **Extensions** | |
| Callout (`> [!NOTE]`) | `quote` with `data.callout_type` |
| Inline math (`$...$`) | Stays in `p.content` |
| Strikethrough (`~~text~~`) | Stays in `p.content` (inline) |
| Autolinks | Stays in `p.content` (inline) |
| Definition lists | Not supported (not CommonMark) |

## Frontmatter

YAML frontmatter (`---` delimited) is not a node type. Parsed into the `data` JSON field on the file's oi node. Round-trip: serialized back from `data` when writing to `.md`.

## Inline Content

Inline formatting (bold, italic, code spans, standard links, images) stays in content strings as markdown. Not broken into child nodes. This is a block-level AST only.

- `**bold**` → stored as-is in `p.content`
- `![alt](url)` → stored as-is in `p.content` (standard MD images)
- `![[vault-image.png]]` → becomes a `link(embed:true)` node (Obsidian-style)
- `[[wiki-link]]` inline → stays in content string, extracted to `links` table
- `[^1]` reference → stays in content string

## Design Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Flat children (no .blocks/.subitems split) | Simpler model, matches Notion/Roam/Logseq. View decides columns vs body. | View must split children by type for board rendering |
| li ≈ oi (structurally identical) | One navigation model, one tree. Differ only in serialization and default rendering. | Code must handle interleaving (li) vs ordered (oi) |
| Title in `.content` (no `h` child) | Eliminates redundancy. Heading level from tree depth. | Parser must store title on oi node, not as child |
| Rendering is context-dependent | Embedded nodes take host's style. Decouples model from view. | View layer more complex |
| Navigation is spatial (hjkl) | Decoupled from content type. Works in any layout. | Rendering must produce navigable spatial layout |
| Lazy loading via SQL type filter | No body container node needed. `WHERE type IN ('oi','li')` for subitems. | Slightly more complex queries than skipping a body subtree |
| Heading level from tree depth | Enforces well-formed outline hierarchy | Normalizes skipped levels on round-trip |
| `task_marker` as full bracket string | Round-trip fidelity for bidirectional MD sync | Slightly more parsing than a boolean `checked` |
| `list_marker` as literal string | Preserves user's bullet style | Requires parsing for ordered list logic |
| Footnotes as `li` with `[^id]` marker | Reuses list structure for multi-paragraph footnotes | Unconventional |
| No list container nodes | Simpler tree, matches Notion's flat approach | Serializer must detect consecutive `li` siblings |
| `link` as third category (not Item) | Keeps transclusion as lightweight pointer | Resolved at render time |
| Block-level AST only | Sufficient for TUI outline/kanban views | No inline node manipulation |
| Callouts as `quote` + data | Syntactically they ARE blockquotes | Requires `data.callout_type` check |
| Frontmatter as `data` field | Metadata, not content | Must serialize back from JSON |

## Migration Notes (v1 → v2)

Changes from the previous model:

1. **`h` node type removed** — oi titles stored in `.content`; headings inside list items become child `li` nodes
2. **`.blocks[]` / `.subitems[]` removed** — replaced by flat `.children`. View-level helpers may exist but model doesn't split.
3. **"Two Hierarchies" removed** — one tree, items vs blocks is the only structural distinction
4. **Ordering constraint relaxed in model** — blocks-before-subitems is a serialization concern for oi, enforced by parser/serializer, not the model
5. **Lazy loading via SQL** — type-based filtering replaces body-node approach
6. **Rendering rules moved to view** — model doesn't prescribe board vs list layout
