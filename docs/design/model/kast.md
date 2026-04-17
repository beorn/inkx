# kast — km markdown AST (parser tree)

kast is the parser-side AST — mdast plus km extensions. Produced by `@km/markdown`, lowered to `KNode[]` for storage. See also [knode.md](knode.md) for the storage tree and [kast-fixtures.md](kast-fixtures.md) for the reference fixtures used by parser tests.

**kast = mdast + km extensions**. The AST is self-describing: all km semantics live in AST structure and data fields, not in downstream regex extraction.

## Architecture

```
markdown string
  │
  ▼
micromark tokenizer  ──── km() combines GFM sub-extensions + km tokenizers
  │                         ├── gfmAutolinkLiteral, gfmFootnote, gfmStrikethrough, gfmTable
  │                         ├── kmTaskMark()     ← replaces gfmTaskListItem
  │                         └── kmWikilink()     ← new: [[target|alias]], ![[embed]]
  ▼
mdast tree
  │
  ▼
kmFromMarkdown()     ──── fromMarkdown handlers + tree transforms
  │                         ├── GFM handlers (autolink, footnote, strikethrough, table)
  │                         ├── kmTaskMarkFromMarkdown()   ← sets listItem.data.taskMark
  │                         ├── kmWikilinkFromMarkdown()   ← creates KmWikilink nodes
  │                         └── transforms (run in order):
  │                              1. kmBlockIdTransform          ← strips ` ^id`, sets data.blockId
  │                              2. kmHeadingTaskMarkTransform  ← strips `[x] ` prefix, sets heading.data.taskMark
  │                              3. kmInlinePropTransform       ← extracts key:: value, sets data.props/propsRaw/cleanText
  │                              4. kmRefsTransform             ← extracts #tag @mention +project
  ▼
kast tree (enriched mdast)
  │
  ▼
astToNodes()         ──── reads kast data fields instead of regex
  │
  ▼
KNode[]
```

## Core model: block + trait

Every node IS a block (has a content type). Orthogonal traits add capabilities:

```typescript
type BlockType = "p" | "h" | "code" | "quote" | "table" | "hr" | "html" | "math"  // 8

interface KNode {
  id: string
  type: BlockType               // Content type — always present
  content: string | null         // Text content
  name?: string                  // Display identifier (slug, alias, filename)

  // Trait: item (navigable, can have children)
  item?: ItemData               // present = item, undefined = leaf block

  // Embed trait (orthogonal to type — any node type can be an embed)
  // Cache: set when content is exactly one Link with rel='embed'.
  // See [klink.md](klink.md) for the full link model.
  embed_of?: string | null   // Target node ID (null = unresolved)

  // Tree
  parent_id: string | null
  parent_idx: number

  // Filesystem (orthogonal)
  fstype?: FsType                // "repo" | "folder" | "mdfile" | "mdsection" | "file" | "txtfile"
  fs_path?: string

  // Metadata
  data?: Record<string, unknown>
  created_at: number
  updated_at: number
}
```

### Derivation rules

The old categorical types (oi, li, link) are derived from block type + traits:

| Combination | Derived Category | Markdown Serialization |
|---|---|---|
| `type:"h", item:{}` | Outline item (was `oi`) | `## Title` |
| `type:"p", item:{list:"-"}` | List item (was `li`) | `- content` |
| `type:"quote", item:{list:"-"}` | Quote list item | `- > content` |
| `type:"code", item:{list:"-"}` | Code list item | `- \`\`\`code\`\`\`` |
| any type + `embed_of` | Embed (was `link`) | `![[target]]` |
| `type:"p"` (no item) | Paragraph block | `content` |
| `type:"code"` (no item) | Code block | ` ```code``` ` |
| etc. | Leaf block | Various |

### Type predicates

```typescript
import { KNode } from "@km/core"

KNode.isOutline(node) // node.type === "h" && node.item != null
KNode.isListItem(node) // node.type !== "h" && node.item != null
KNode.isItem(node)     // node.item != null
KNode.isEmbed(node)    // node.embed_of != null (orthogonal to type)
KNode.isBlock(node)    // node.item == null (leaf node)
```

`KNode.isItem` is the primary structural predicate — items are containers, blocks are leaves.

### Constraints

| Constraint | Rule |
|---|---|
| h requires item | `type === "h"` implies `item != null` |
| task requires item | `item.task` can only exist when `item` is present (always true by structure) |
| embed is orthogonal | `embed_of != null` marks a node as an embed — any type can be an embed |
| embed children from source | Embed nodes' children come from the target node (resolved at render time) |
| item-allowed types | h, p, quote, code can be items; table, hr, html, math cannot |
| h-children ordering | `body*, h*` — body content first, sub-sections last, no interleaving |
| li-children ordering | `(body|li)*` — free interleaving |

Validated by `validateNode()` in `@km/core`.

## Block types

Content leaf. Has a `content` string. No children (except `quote`).

| Type | Content |
|---|---|
| `p` | Paragraph text (inline markdown) |
| `h` | Heading (always has item — bare h is invalid) |
| `code` | Code block (lang in data) |
| `quote` | Blockquote text (can contain child blocks) |
| `table` | Raw markdown table |
| `hr` | Empty (horizontal rule) |
| `html` | Raw HTML |
| `math` | Block math (LaTeX) |

## Item trait (outline and list)

Structurally almost identical. Both recursive, navigable, use `.content` as title. Differences are serialization and default rendering:

| | **Outline** (`type:"h", item:{}`) | **List** (`type:"p", item:{list?, task?}`) |
|---|---|---|
| Markdown | Headings (`# Title`, `## Sub`) | List items (`- text`, `- [ ] task`) |
| Default rendering | Card / column | Checklist row |
| Interleaving | Blocks before subitems only (heading parsing limitation) | Blocks and sub-items can interleave freely |
| Heading level | Derived from tree depth (never stored) | N/A |
| fstype | repo, folder, mdfile, mdsection | N/A |

### Outline item (type:"h", item:{})

Creates the document hierarchy: repo → folders → files → sections.

| Field | Type | Notes |
|---|---|---|
| `type` | `"h"` | Heading block type |
| `item` | `ItemData` | Always present for outline items (at minimum `{}`) |
| `content` | `string?` | Title text. Empty is valid (item has body but no title) |
| `fstype` | `FsType` | repo, folder, file, mdfile, txtfile, mdsection |
| `name` | `string?` | Filesystem identity / heading slug |
| `item.task` | `{marker, status}?` | Task: `{ marker: "[x]", status: "done" }` |

Title is `.content`. Heading level is derived from tree depth.

### List item (type:"p", item:{list?, task?})

| Field | Type | Notes |
|---|---|---|
| `type` | `"p"` | Paragraph block type (or `"quote"`, `"code"` for first-block items) |
| `item` | `ItemData` | Always present; holds list marker and optional task |
| `content` | `string?` | Title text (rendered as checkbox text) |
| `item.list` | `string` | `"-"`, `"*"`, `"+"`, `"1."`, `"1)"`, `"[^1]"` |
| `item.task` | `{marker, status}?` | Task: `{ marker: "[ ]", status: "todo" }` (optional) |

Same structure as outline items. One structural difference: list item children can interleave blocks and sub-items in any order (markdown indentation disambiguates). For outline items, blocks must come before sub-items (markdown heading parsing cannot disambiguate trailing blocks).

Headings inside list items are parsed as child list items (`type:"p", item:{...}`), not as outline items. Outline items only exist at the document structure level.

## Embed trait

A node is an "embed" iff `embed_of != null`. This is **runtime-materialized at load time** from the cache row `SELECT host_id, href FROM links WHERE rel='embed'`, then resolved through the name index. The canonical source of truth lives inside `KNode.content` as a parsed AST `KLink`; see [klink.md](klink.md).

Embeds created by different paths:

- **Markdown parser**: `![[target]]` as sole content of a li/heading/paragraph → KLink `{ href: 'km:target', rel: 'embed', md: { form: 'wiki' } }`; loader populates `embed_of` from the resolved target
- **Board rules** (`km.add::`): creates `type:"h", item:{}` with content set to a single embed KLink
- **CLI add**: creates `type:"p", item:{list:"-"}` with content set to a single embed KLink

| Field | Type | Notes |
|---|---|---|
| `embed_of` | `string?` | Target node ID, runtime-materialized from the `links` cache (`rel='embed'`) and resolved via the name index |
| `content` | `string?` | Source markdown — parses to AST containing the KLink |

**Links vs embeds (in the canonical model)**:
- Both are `KLink` nodes inside `KNode.content` AST: `{ href, rel, alias?, md? }`
- `[[wikilink]]` → `KLink { href: 'km:wikilink', rel: 'link', md: { form: 'wiki' } }`
- `![[embed]]` → `KLink { href: 'km:embed', rel: 'embed', md: { form: 'wiki' } }`
- A KNode is an **embed node** iff its content is exactly one KLink with `rel='embed'` and nothing else
- The `embed_of` field is a runtime-materialized convenience for the embed-only case; the `links` table is the durable cache
- All KLink occurrences flow into the `links` cache table (3 columns: `host_id`, `href`, `rel`) for indexed queries

See [klink.md](klink.md) for the full link model, URI scheme, `rel` taxonomy, and recovery semantics.

## Task trait

Any item can be a task via `item.task`. Both marker and status are stored together:

| item.task.marker | item.task.status |
|---|---|
| `"[ ]"` | `"todo"` |
| `"[x]"` `"[X]"` | `"done"` |
| `"[/]"` | `"wip"` |
| `"[!]"` | `"blocked"` |
| `"[-]"` | `"dropped"` |
| absent (no `item.task`) | not a task |

Both `marker` and `status` live inside `item.task`. A node is a task when `item?.task != null`.

### List markers

```
Unordered:  "-", "*", "+"
Ordered:    "1.", "1)", "3."   (start number + delimiter)
Footnote:   "[^1]", "[^note]"
```

Ordered vs unordered derived from `item.list`. Actual numbers computed from sibling position. Consecutive list items with compatible markers serialize to one markdown list.

Footnote definitions (`[^1]: text`) are list items with footnote markers. References (`[^1]`) stay inline in content strings.

## Children model

Items have children — a flat, ordered list of any node types. No `.blocks[]` / `.subitems[]` split in the model. Children are just children.

```
h item (content="Project")
  p "Description"                   # children[0]
  p "More details"                  # children[1]
  h item (content="Phase 1")       # children[2]
  h item (content="Phase 2")       # children[3]

p item (content="Buy groceries")
  p "From the store"                # children[0]
  p item (content="Milk")          # children[1]
  p item (content="Eggs")          # children[2]
  p "Check prices first"            # children[3]
  p item (content="Bread")         # children[4]
```

For outline items: blocks come before sub-items (serialization constraint from markdown heading parsing).
For list items: blocks and sub-items can interleave in any order (indentation disambiguates in markdown).

This is a model constraint for outline items, not just a convention — the markdown parser cannot round-trip blocks after sub-headings. For list items, full interleaving is supported.

## Content model (parent constraints)

What can contain what:

```
h item   → any node types as children (blocks, list items; sub-items are h items)
p item   → any node types as children (blocks; sub-items are p items; can interleave)
quote    → blocks (p, code, math, table, hr, html, list items)
p, code, math, table, hr, html → no children (leaf nodes)
(embed nodes with embed_of: children resolved from target at render time)
```

Key constraints:
- **h items only under h items**: A heading inside a list item becomes a child list item, not an h item
- **list items anywhere a block can**: Lists can appear inside h item children, list item children, or blockquotes
- **embeds transclude from source**: Embed nodes' displayed children come from the target node (resolved at render time)

### Full example tree

```
h item  name:"vault"           fstype:"repo"
  h item  name:"projects"     fstype:"folder"
    h item  name:"doc-title"  fstype:"mdfile"
      h item  name:"section"  fstype:"mdsection"
        p "paragraph"
        code "let x = 1"
        p item(list:"-")  "Buy milk"
          p item(list:"-", task:{marker:"[ ]",status:"todo"})  "Eggs"
          quote "note"
        quote item(list:"-")  "quote list item"
        p  embed_of:"<id>"          # embed (any type + embed_of)
        h item  name:"sub"   fstype:"mdsection"
```

### Skipped heading levels

On parse: `H1 → H3` (skipping H2) inserts a synthetic h item at the missing level. On serialize: heading level = tree depth. Round-trip normalizes: `H1 → H3` becomes `H1 → H2 → H3`. No serialization hints stored.

### Markdown coverage

How every CommonMark + GFM + Obsidian construct maps to kast:

| Markdown Construct | kast Representation |
|---|---|
| **Block-level** | |
| Paragraph | `p` |
| ATX heading (`# text`) | `h item (content:"text")` — title in `.content` |
| Setext heading (`text\n===`) | `h item` (normalized to ATX on round-trip) |
| Fenced code block (` ``` `) | `code` (lang in `data.lang`) |
| Indented code block | `code` |
| Blockquote (`> text`) | `quote` (children are blocks) |
| Nested blockquote (`>> text`) | `quote` containing `quote` |
| Thematic break (`---` / `***`) | `hr` |
| GFM table | `table` (raw markdown in content) |
| HTML block | `html` |
| Block math (`$$...$$`) | `math` (LaTeX in content) |
| **Lists** | |
| Unordered list item (`- text`) | `p item (list:"-")` |
| Ordered list item (`1. text`) | `p item (list:"1.")` |
| Task list item (`- [ ] text`) | `p item (list:"-", task:{marker:"[ ]", status:"todo"})` |
| Nested list | `p item` containing child `p item` |
| Multi-paragraph list item | `p item` containing multiple `p` children |
| Footnote def (`[^1]: text`) | `p item (list:"[^1]")` |
| **Outline structure** | |
| Directory | `h item (fstype:"folder")` |
| Markdown file | `h item (fstype:"mdfile")` |
| Non-markdown file | `h item (fstype:"file")` |
| Section (H2+ heading) | `h item (fstype:"mdsection")` — title in `.content` |
| Repository root | `h item (fstype:"repo")` |
| **Links & embeds** (see [klink.md](klink.md)) | |
| `![[target]]` (embed) | node whose content is a single `KLink { href:"km:target", rel:"embed", md:{form:"wiki"} }`; `embed_of` resolved at load |
| `![[target\|alias]]` | same as above with `alias:"alias"` on the KLink |
| `[[target]]` inline | KLink `{ href:"km:target", rel:"link", md:{form:"wiki"} }` in `p.content`; cached in `links` table |
| `[text](url)` | KLink `{ href:"url", rel:"link", alias:"text", md:{form:"mdlink"} }` in content |
| `![alt](url)` | KLink `{ href:"url", rel:"embed", alias:"alt", md:{form:"mdlink"} }` in content |
| `![[image.png]]` (vault image) | embed node with KLink `{ href:"km:image.png", rel:"embed", md:{form:"wiki"} }` |
| `[^1]` reference | Stays in `p.content` (inline) |
| **Metadata** | |
| YAML frontmatter (`---`) | `data` JSON field on file's h item node |
| **Extensions** | |
| Callout (`> [!NOTE]`) | `quote` with `data.callout_type` |
| Inline math (`$...$`) | Stays in `p.content` |
| Strikethrough (`~~text~~`) | Stays in `p.content` (inline) |
| Autolinks | Stays in `p.content` (inline) |
| Definition lists | Not supported (not CommonMark) |

### Frontmatter

YAML frontmatter (`---` delimited) is not a node type. Parsed into the `data` JSON field on the file's h item node. Round-trip: serialized back from `data` when writing to `.md`.

### Design decisions

| Decision | Rationale | Trade-off |
|---|---|---|
| Block + trait (not categories) | Extensible — new traits added orthogonally. No type explosion. | Slightly more complex predicates |
| Flat children (no .blocks/.subitems split) | Simpler model, matches Notion/Roam/Logseq. View decides columns vs body. | View must split children by type for board rendering |
| li ≈ oi (structurally identical) | One navigation model, one tree. Differ only in serialization and default rendering. | Code must handle interleaving (li) vs ordered (oi) |
| Title in `.content` (no separate h child) | Eliminates redundancy. Heading level from tree depth. | Parser must store title on item node, not as child |
| Rendering is context-dependent | Embedded nodes take host's style. Decouples model from view. | View layer more complex |
| Navigation is spatial (hjkl) | Decoupled from content type. Works in any layout. | Rendering must produce navigable spatial layout |
| Lazy loading via SQL type filter | No body container node needed. `WHERE type = 'h' AND item IS NOT NULL` for items. | Slightly more complex queries than skipping a body subtree |
| Heading level from tree depth | Enforces well-formed outline hierarchy | Normalizes skipped levels on round-trip |
| `item.task.marker` as full bracket string | Round-trip fidelity for bidirectional MD sync | Slightly more parsing than a boolean `checked` |
| `item.list` as literal string | Preserves user's bullet style | Requires parsing for ordered list logic |
| Footnotes as list items with `[^id]` marker | Reuses list structure for multi-paragraph footnotes | Unconventional |
| No list container nodes | Simpler tree, matches Notion's flat approach | Serializer must detect consecutive item siblings |
| Embeds as orthogonal trait (not a type) | Any node type can be an embed via `embed_of`. Consistent with block+trait model. | Must check `embed_of != null` instead of type |
| Block-level AST only | Sufficient for TUI outline/kanban views | No inline node manipulation |
| Callouts as `quote` + data | Syntactically they ARE blockquotes | Requires `data.callout_type` check |
| Frontmatter as `data` field | Metadata, not content | Must serialize back from JSON |

### Migration notes (v1 → v2)

| v1 | v2 |
|---|---|
| `type: "oi"` | `type: "h", item: {}` |
| `type: "li"` | `type: "p", item: { list?, task? }` (or actual block type) |
| `type: "link"` | any type + `embed_of` |
| `link_to` field | `embed_of` field |
| `link_alias` field | `name` field |
| `embed` boolean | Derived from `embed_of != null` |
| `data.depth` | Derived from tree nesting |

Existing databases are auto-migrated by `migrateSchema()` in `schema.ts` — it converts `oi`→`h`+item, `li`→`p`+item, `link`→`p`+embed_of.

The old types (`"oi"`, `"li"`, `"link"`) and fields (`link_to`, `link_alias`, `embed` boolean) have been fully removed from the codebase.

## Title resolution

Every item resolves to a display title:

```
content  →  name  →  id
```

- `content`: the item's text field (primary)
- `name`: filesystem identity / heading slug (fallback)
- `id`: the node's ULID (last resort, shown distinctly in UI)

Heading level is implicit from tree depth (never stored).

### Name ↔ title by fstype

| fstype | name source | content | Sync |
|---|---|---|---|
| repo | repo name | from index .md if any | name → display |
| folder | dirname | from index .md if any | name → display |
| file/mdfile | filename sans .md | H1 text | name ↔ title |
| mdsection | slugified heading | heading text | title → name |

Folders can have an associated index file (`folder/folder.md`, `README.md`, or `.md`) that provides body content and metadata (frontmatter).

## Rendering (view concern)

Rendering is context-dependent. A node's type is a serialization identity and default rendering hint. The **position** determines actual rendering.

### Board view (zoomed into an item)

The view splits an item's children for display:

**Zoomed into outline item**: same-type (outline) children → columns. Everything else (blocks, list items, embeds) → body pane.

```
┌─── body ────────┬─── Phase 1 ────┬─── Phase 2 ────┐
│ Description      │ Task A         │ Task D        │
│ More details     │ Task B         │ Task E        │
│ ☐ Quick todo    │ Task C         │                │
└─────────────────┴────────────────┴────────────────┘┘
```

List item children in the body render as checklist rows within the body pane.

**Zoomed into list item**: renders as a list view. Everything in order — blocks as content, sub-items as checklist rows. Interleaving preserved.

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

**Fallback**: item with no same-type children → detail/list view (body content only).

### Embedding rule

When embedded or placed in a different context, a node takes on the rendering style of its position:

- Outline item at column position → card (native)
- List item at column position → card (takes on host style)
- Outline item in body → body content
- List item in body → checklist row (native)

### Navigation

Navigation is **purely spatial** (hjkl = left/down/up/right on screen). Navigation does not know about node types. It only knows about visual positions.

## Lazy loading (SQL)

```sql
-- Items only (board columns — title is .content on each node)
SELECT * FROM nodes WHERE parent_id = ?
  AND ((type = 'h' AND item IS NOT NULL) OR type = 'oi')

-- Body blocks only (detail pane, on demand)
SELECT * FROM nodes WHERE parent_id = ?
  AND NOT ((type = 'h' AND item IS NOT NULL) OR type = 'oi')

-- Dual-match pattern: supports both v2 and legacy data during migration
-- (type = 'oi' OR (type = 'h' AND item IS NOT NULL))
```

## Inline content

Inline formatting (bold, italic, code spans, standard links, images) stays in content strings as markdown. Not broken into child nodes at the block level. The inline AST is a separate typed tree produced on demand from the content string.

The inline AST represents the parsed structure of inline markdown content. It provides a typed tree of nodes that can be rendered to JSX via `<InlineText>` or to plain text via `parseToPlainText()`.

### Inline node types

#### PlainText

Raw text content with no formatting.

- **Syntax**: Any text not matched by other patterns
- **Properties**: `text: string`
- **Rendering**: Rendered as-is

#### Bold

Strong emphasis.

- **Syntax**: `**text**`
- **Properties**: `children: InlineNode[]`
- **Rendering**: `<Text bold>` in rich mode, stripped markers in plain mode

#### Italic

Emphasis, supporting both asterisk and underscore delimiters.

- **Syntax**: `*text*` or `_text_`
- **Properties**: `children: InlineNode[]`
- **Rendering**: `<Text italic>` in rich mode, stripped markers in plain mode

#### Strikethrough

Struck-through text.

- **Syntax**: `~~text~~`
- **Properties**: `children: InlineNode[]`
- **Rendering**: `<Text dim strikethrough>` in rich mode, stripped markers in plain mode

#### Code

Inline code span.

- **Syntax**: `` `code` ``
- **Properties**: `code: string`
- **Rendering**: `<Text color="cyan">` in rich mode, stripped backticks in plain mode. Content is not parsed for nested inline formatting.

#### Link

Standard markdown link.

- **Syntax**: `[text](url)`
- **Properties**: `text: string`, `url: string`
- **Rendering**: `<Text color="cyan" underline>` with OSC 8 hyperlink wrapping in rich mode, text only in plain mode

#### WikiLink

Internal wiki-style link, optionally with embed prefix.

- **Syntax**: `[[target]]`, `[[target|alias]]`, `![[embed]]`
- **Properties**: `target: string`, `alias: string | undefined`, `isEmbed: boolean`
- **Rendering**: `<Text color="green" underline>` showing alias or resolved title in rich mode, display text in plain mode. Resolved via `resolveWikiLink` callback.

#### Mention

Person reference using `@` sigil.

- **Syntax**: `@person-name` (Unicode letters, digits, underscore, hyphen)
- **Properties**: `name: string` (without `@` prefix)
- **Rendering**: Colored by sigil color map when resolved, plain text when unresolved. Can be shortened via `personShortNames` or stripped via options.

#### Tag

Tag reference using `#` sigil.

- **Syntax**: `#tag-name` (Unicode letters, digits, underscore, hyphen)
- **Properties**: `name: string` (without `#` prefix)
- **Rendering**: Colored by sigil color map when resolved, plain text when unresolved. Can be stripped via `stripTagsAndProjects`.

#### Project

Project reference using `+` sigil.

- **Syntax**: `+project-name` (Unicode letters, digits, underscore, hyphen, slash, dot)
- **Properties**: `name: string` (without `+` prefix)
- **Rendering**: Colored by sigil color map when resolved, plain text when unresolved. Can be stripped via `stripTagsAndProjects`.

#### InlineField

Key-value metadata field in bracket syntax.

- **Syntax**: `[key:: value]`
- **Properties**: `key: string`, `value: string`
- **Rendering**: In rich mode: dim cyan key, dim `::`, value colored by type (green for dates, yellow for numbers, white otherwise). Stripped entirely in plain mode.

#### BlockRef

Block reference identifier, used for Asana-style cross-references.

- **Syntax**: `^1234567890` (10+ digit numeric ID), `[[^id]]`, or `-> ^id`
- **Properties**: `id: string`
- **Rendering**: Stripped in display (metadata only).

#### AutoLink

CommonMark autolink using angle brackets.

- **Syntax**: `<https://example.com>`
- **Properties**: `url: string`
- **Rendering**: Same as BareURL after angle bracket stripping.

#### BareURL

Unlinked URL appearing in text.

- **Syntax**: `https://example.com/path` or `http://...`
- **Properties**: `url: string`
- **Rendering**: Protocol/www stripped for display, `<Text color="cyan" dim underline>` with OSC 8 hyperlink in rich mode.

### Parse order

The parser processes inline content in precedence order to avoid ambiguity:

1. **InlineField** `[key:: value]` - must be matched before Link syntax
2. **Code** `` `code` `` - content inside backticks is opaque (no nested parsing)
3. **WikiLink** `[[target]]` - must be matched before Link
4. **Link** `[text](url)` - standard markdown link
5. **AutoLink** `<url>` - CommonMark autolink (converted to BareURL)
6. **BareURL** `https://...` - unlinked URLs
7. **Bold** `**text**` - must be matched before Italic `*`
8. **Strikethrough** `~~text~~`
9. **Italic** `*text*` or `_text_`
10. **Sigils** `@mention`, `#tag`, `+project`
11. **BlockRef** `^id` patterns
12. **PlainText** - everything else

### Pipeline options

The AST rendering phase accepts the same options as `TextPipelineOptions`:

| Option | Effect |
|---|---|
| `mode` | `"rich"` (JSX with styling), `"plain"` (text only), `"stripped"` (text, no metadata) |
| `excludeSigils` | Remove specific sigils from output (e.g., `["@issue"]`) |
| `sigilColors` | Map of sigil string to color name |
| `resolveSigilColor` | Dynamic color resolver for sigils |
| `shortenMentions` | Replace @mentions with short names |
| `personShortNames` | Map of person name to abbreviation |
| `stripRefs` | Remove all @mentions, #tags, +projects |
| `stripTagsAndProjects` | Remove #tags and +projects, keep @mentions |
| `stripKnownMentions` | Remove known person @mentions |
| `resolveWikiLink` | Resolve wiki link targets to display titles |

### Inline constructs in block content

At the block level, inline formatting is stored as raw markdown in content strings:

- `**bold**` → stored as-is in `p.content`
- `![alt](url)` → standard Markdown image; parsed as KLink with `rel:'embed'` in content
- `![[vault-image.png]]` → becomes an embed node (empty content + embed KLink)
- `[[wiki-link]]` inline → stays in content as KLink; extracted to `links` cache table
- `[^1]` reference → stays in content string

## Extension types (parser internals)

### Micromark tokenizers (new syntax → new AST structure)

| Extension | Trigger | What it does |
|-----------|---------|--------------|
| `kmTaskMark()` | `[` at list item start | Tokenizes `[/]`, `[-]`, `[!]` in addition to GFM `[ ]`, `[x]`, `[X]` |
| `kmWikilink()` | `[` for `[[`, `!` for `![[` | Tokenizes Obsidian wikilinks into `KmWikilink` AST nodes |

### mdast transforms (enrich existing text nodes with metadata)

| Transform | Applies to | What it does | Data fields set |
|-----------|------------|--------------|-----------------|
| `kmBlockIdTransform` | paragraphs, headings, listItems | Strips ` ^blockId` suffix from text | `node.data.blockId` |
| `kmHeadingTaskMarkTransform` | headings | Strips `[x] ` prefix from heading text | `heading.data.taskMark` |
| `kmInlinePropTransform` | paragraphs, headings | Extracts `key:: value` pairs; duplicate keys comma-concatenated | `node.data.props`, `.propsRaw`, `.cleanText` |
| `kmRefsTransform` | paragraphs, headings, listItems | Extracts `#tag`, `@mention`, `+project` | `node.data.tags`, `.mentions`, `.projects` |

Transform order matters: block-id strips suffix first, heading-task-mark strips prefix, inline-prop extracts and strips properties, refs reads remaining text.

## Type extensions (module augmentation)

All types are in `packages/km-markdown/src/kast/types.ts`. Uses mdast's module augmentation pattern:

```typescript
// Extended Data fields (on existing mdast nodes)
declare module 'mdast' {
  interface Data {
    blockId?: string                         // km-block-id transform
    taskMark?: string                        // km-task-mark (listItem) or km-heading-task-mark (heading)
    props?: Record<string, PropertyValue>    // km-inline-prop: typed property values
    propsRaw?: Record<string, string>        // km-inline-prop: raw strings (including km.*)
    cleanText?: string                       // km-inline-prop: text with all key:: value stripped
    tags?: string[]                          // km-refs: #tag references
    mentions?: string[]                      // km-refs: @mention references
    projects?: string[]                      // km-refs: +project references
  }
  interface PhrasingContentMap { kmWikilink: KmWikilink }
}

// New node type
interface KmWikilink extends Node {
  type: 'kmWikilink'
  target: string       // path before # or |
  section?: string     // after #
  blockRef?: string    // after ^
  alias?: string       // after |
  embedded: boolean    // ![[...]] vs [[...]]
}
```

### kast → KLink

The parser-layer `KmWikilink` (above), plus mdast's native `Link` and autolink/bare-URL nodes, are lowered by `astToNodes()` into the canonical [`KLink`](klink.md) that lives inside `KNode.content`:

```typescript
type KLink = {
  href: string                                    // parsed target (km:Note, #Section, https://…)
  rel: 'link' | 'embed'                           // closed enum for v1
  alias?: string                                  // |alias or [text](…) text
  md?: { form?: 'wiki' | 'mdlink' | 'autolink' | 'bare' }
}
```

`md.form` captures the notation for roundtrip fidelity. `#tag`, `@mention`, `+project` sigils are recognized as `rel: 'link'` with `md.form: 'bare'` — sigils are part of the node name, not a separate namespace. See [klink.md](klink.md) for the full link model, including the complete Markdown → KLink table.

## Usage and file layout

```typescript
import { parseMarkdown } from '@km/markdown'

// parseMarkdown() already uses km() + kmFromMarkdown() internally
const tree = parseMarkdown('- [/] Task #urgent blocked-by:: [[other]] ^abc')

// tree is a kast tree with all extensions applied:
// listItem.data.taskMark = '/'
// listItem.data.blockId = 'abc'
// listItem.data.tags = ['urgent']
// listItem.data.props = { 'blocked-by': { type: 'link', target: 'other' } }
```

### File layout

```
packages/km-markdown/src/
  kmast/
    types.ts              ← TypeScript types (module augmentation + KmWikilink)
    index.ts              ← Re-exports
  extensions/
    km-task-mark.ts       ← Micromark tokenizer + fromMarkdown handler
    km-wikilink.ts        ← Micromark tokenizer + fromMarkdown handler
    km-block-id.ts            ← mdast tree transform
    km-heading-task-mark.ts   ← mdast tree transform
    km-inline-prop.ts         ← mdast tree transform
    km-refs.ts                ← mdast tree transform
    index.ts              ← Combined: km() + kmFromMarkdown()
```

## kast vs KNode

kast is the parser tree (rich, parse-time, lowering-source). KNode is the storage tree (flat, normalized, persistence-ready). See [knode.md](knode.md) for full KNode details.

Two representations of the same thing:

| kast (parser) | KNode (storage) | What it is |
|---|---|---|
| `oi` (outline item) | `type: "h", item: {}` | Section heading — creates hierarchy |
| `li` (list item) | `type: "p", item: { list?, task? }` | Bullet/task — content with children |
| `p` (paragraph) | `type: "p"` (no item) | Body text — leaf content |
| `h` (heading) | `type: "h"` (no item) | Heading block — leaf (rare, usually item) |
| `code` | `type: "code"` (no item) | Code block |
| `quote` | `type: "quote"` (no item) | Blockquote |

**`oi` and `li` don't exist in KNode** — they're kast parse types. Storage uses `type` + `item` object (`ItemData`).
