# km-ast: Knowledge Tree Model

The node model for km's knowledge tree. All content (markdown files, folders, list items) lives in one unified tree stored in SQLite.

## Types

```typescript
// 10 node types, 3 categories
type BlockType = "p" | "h" | "code" | "quote" | "table" | "hr" | "html"  // 7
type ItemType  = "oi" | "li"                                              // 2
type LinkType  = "link"                                                   // 1
type NodeType  = BlockType | ItemType | LinkType                          // 10
```

## Terminology

- **title**: computed display text for navigation/outline. Resolution: `blocks[0].content` → `name` → `id`. Every item has a title (it always resolves to something).
- **heading**: a block type (`h`) representing a markdown heading (`## text`). Styled prominently in document view. Only used for oi's blocks[0] from section headings.
- **name**: stored identity string (filename, slug). May or may not match title.
- **marker**: prefix decoration on a line item. Both list style and task checkbox are "markers."

## Node Kinds

### Block

Content leaf. Has a `content` string.

| Type    | Content                          |
|---------|----------------------------------|
| `p`     | Paragraph text (inline markdown) |
| `h`     | Heading text                     |
| `code`  | Code block (lang in data)        |
| `quote` | Blockquote text                  |
| `table` | Raw markdown table               |
| `hr`    | Empty (horizontal rule)          |
| `html`  | Raw HTML                         |

### OutlineItem (oi)

Structural node. Creates the document hierarchy: repo → folders → files → sections.

| Field           | Type         | Notes                                          |
|-----------------|--------------|------------------------------------------------|
| `type`          | `"oi"`       | Always "oi"                                    |
| `fstype`        | `FsType`     | repo, folder, file, mdfile, mdsection          |
| `name`          | `string?`    | Filesystem identity / heading slug             |
| `task_marker`   | `string?`    | Checkbox: `"[ ]"`, `"[x]"`, `"[/]"`, `"[!]"`, `"[-]"` |
| `.blocks[]`     | derived      | `children.filter(c => c.type !== "oi")`        |
| `.subitems[]`   | derived      | `children.filter(c => c.type === "oi")`        |

`blocks[0]` is the title when present (usually type `h` for sections, or a `link` node for embed-titled items).

### ListItem (li)

Item that lives in body content. Can nest (li inside li). Has the same `.blocks[]` structure as oi.

| Field           | Type         | Notes                                          |
|-----------------|--------------|------------------------------------------------|
| `type`          | `"li"`       | Always "li"                                    |
| `list_marker`   | `string`     | `"-"`, `"*"`, `"+"`, `"1."`, `"1)"`, `"[^1]"` |
| `task_marker`   | `string?`    | Checkbox: `"[ ]"`, `"[x]"`, etc. (optional)   |
| `.blocks[]`     | derived      | `children.filter(c => c.type !== "li")`        |
| `.subitems[]`   | derived      | `children.filter(c => c.type === "li")`        |

`blocks[0]` is the item text (rendered inline, not as a heading).

### Link

References another node. Can appear anywhere a block can. Optionally has blocks (alias content).

| Field           | Type         | Notes                                          |
|-----------------|--------------|------------------------------------------------|
| `type`          | `"link"`     | Always "link"                                  |
| `link_to`       | `string`     | Target node ID                                 |
| `embed`         | `boolean`    | true = transclude content, false = reference   |
| `.blocks[]`     | optional     | Alias/override content (blocks[0] = alias)     |

When blocks exist, blocks[0] provides the display text (alias). When absent, display falls back to the target's title. `![[target|alias]]` → link with a `p` block as blocks[0].

## Two Hierarchies

```
Outline: oi → oi → oi         (folders, files, sections)
List:    li → li → li          (nested lists within body)
Inline:  bold, links, code     (within content string, not nodes)
```

oi can only contain oi as subitems. li can appear anywhere a block can (inside oi body or li body).

## Children Split

Uniform rule for both oi and li:

```typescript
item.blocks   = children.filter(c => c.type !== item.type)
item.subitems = children.filter(c => c.type === item.type)
```

Link nodes fall into `.blocks[]` — they're body content that references another node.

## Ordering

Blocks always sort before subitems in `parent_idx`. No interleaving.

## Title Resolution

Every item resolves to a display title:

```
blocks[0].content  →  name  →  id
```

- `blocks[0]`: first block's content (h, p, or link's alias)
- `name`: filesystem identity / heading slug
- `id`: the node's ULID (last resort, shown distinctly in UI)

Heading level is implicit from tree depth (never stored).

### Name ↔ Title by fstype

| fstype     | name source       | blocks[0]              | Sync               |
|------------|-------------------|------------------------|---------------------|
| repo       | repo name         | from index .md if any  | name → display      |
| folder     | dirname           | from index .md if any  | name → display      |
| file/mdfile| filename sans .md | H1 content (required)  | name ↔ title        |
| mdsection  | slugified heading | heading text           | title → name        |

Files require exactly one H1 (blocks[0] of type `h`).

Folders can have an associated index file (`folder/folder.md`, `README.md`, or `.md`) that provides the folder's blocks (body content) and metadata (frontmatter). The collapsing mechanism merges folder + index file in display.

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

## Skipped Heading Levels

On parse: `H1 → H3` (skipping H2) inserts a synthetic oi at the missing level. On serialize: heading level = tree depth. Round-trip normalizes: `H1 → H3` becomes `H1 → H2 → H3`. No serialization hints stored.

## Predicates

```typescript
const isOutline  = (t: NodeType) => t === "oi"
const isListItem = (t: NodeType) => t === "li"
const isItem     = (t: NodeType) => t === "oi" || t === "li"
const isLink     = (t: NodeType) => t === "link"
const isBlock    = (t: NodeType) => !isItem(t) && !isLink(t)
```

`isOutline` replaces all 12+ extractBody/NON_COLUMN_TYPES/BODY_TYPES/STRUCTURAL_TYPES call sites.

## Lazy Loading (SQL)

```sql
-- Outline children only
SELECT * FROM nodes WHERE parent_id = ? AND type = 'oi'

-- Body (blocks + links, not subitems)
SELECT * FROM nodes WHERE parent_id = ? AND type != 'oi'

-- Title
SELECT content FROM nodes WHERE parent_id = ? AND type != 'oi'
  ORDER BY parent_idx LIMIT 1
```

## Content Model (Parent Constraints)

What can contain what:

```
oi  → blocks (p, h, code, quote, table, hr, html, link, li) + subitems (oi)
li  → blocks (p, h, code, quote, table, hr, html, link)      + subitems (li)
quote → blocks (p, h, code, table, hr, html, link, li)
link → blocks (p) — alias only
p, h, code, table, hr, html → no children (leaf nodes)
```

Key constraints:
- **oi only inside oi**: A heading inside a blockquote or list item stays as an `h` block, not a new `oi`
- **li anywhere a block can**: Lists can appear inside oi body, li body, or blockquotes
- **link is a leaf**: Never contains subitems — transclusion is resolved at render time, not by duplicating the target's subtree

## Frontmatter

YAML frontmatter (`---` delimited) is not a node type. It's parsed into the `data` JSON field on the file's oi node. Round-trip: frontmatter is serialized back from `data` when writing to `.md`.

## Inline Content

Inline formatting (bold, italic, code spans, standard links, images) stays in content strings as markdown. Not broken into child nodes. This is a block-level AST only.

- `**bold**` → stored as-is in `p.content`
- `![alt](url)` → stored as-is in `p.content` (standard MD images)
- `![[vault-image.png]]` → becomes a `link(embed:true)` node (Obsidian-style)
- `[[wiki-link]]` inline → stays in content string, extracted to `links` table
- `[^1]` reference → stays in content string

## Inline Links / Backlinks

Inline links (`[[wiki-links]]`, URLs, `#tags`) stay in content strings. Extracted on parse into a queryable `links` table. Not stored as child nodes.

## Design Decisions

Choices made deliberately, with trade-offs acknowledged:

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Heading level from tree depth | Enforces well-formed outline hierarchy | Normalizes skipped levels on round-trip (H1→H3 becomes H1→H2→H3) |
| `task_marker` as full bracket string | Round-trip fidelity for bidirectional MD sync | Slightly more parsing than a boolean `checked` |
| `list_marker` as literal string | Preserves user's bullet style (`-` vs `*` vs `+`) | Requires parsing for ordered list logic |
| Footnotes as `li` with `[^id]` marker | Reuses list structure for multi-paragraph footnotes | Unconventional — mdast uses dedicated `footnoteDefinition` type |
| No list container nodes | Simpler tree, matches Notion's flat approach | Serializer must detect consecutive `li` siblings to wrap in `<ul>`/`<ol>` |
| `link` as third category (not Item) | Keeps transclusion as lightweight pointer | Can't directly hold target's subtree — resolved at render time |
| Block-level AST only | Sufficient for TUI outline/kanban views | No inline node manipulation (bold spans, etc.) |

## Changes from Current (14 → 10 types)

| Current                | km-ast                              |
|------------------------|-------------------------------------|
| folder, file, section  | oi + fstype                         |
| paragraph              | p                                   |
| ul, ol, task           | li + list_marker + task_marker      |
| embed                  | link (type, with embed flag)        |
| *(new)*                | h (heading block)                   |
| code, quote, table, hr, html | unchanged                      |
| agent, board           | removed (data-layer concern)        |
