# Markdown

Parsing markdown files into km nodes.

---

## Overview

km parses markdown files into an AST, then converts AST nodes into km nodes. This enables:

- Full-text search across content
- Task extraction from any markdown file
- Section-level linking and references
- Bidirectional sync (nodes ↔ markdown)

---

## Markdown AST

Based on [mdast](https://github.com/syntax-tree/mdast) with extensions.

### Block Nodes

````typescript
type BlockNode =
  | Heading // # ## ### etc
  | Paragraph // Plain text block
  | Blockquote // > quoted text
  | Code // ```code``` or indented
  | List // ul, ol, or task list
  | ListItem // - item, 1. item, - [ ] task
  | Table // | col | col |
  | ThematicBreak // ---
  | Html // Raw HTML block

interface Heading {
  type: "heading"
  depth: 1 | 2 | 3 | 4 | 5 | 6
  children: PhrasingContent[]
}

interface List {
  type: "list"
  ordered: boolean
  start?: number // For ordered lists
  spread: boolean // Loose vs tight
  children: ListItem[]
}

interface ListItem {
  type: "listItem"
  checked?: boolean | null // null = not a task, true/false = task
  spread: boolean
  children: BlockContent[]
}
````

### Phrasing (Inline) Nodes

```typescript
type PhrasingContent =
  | Text // Plain text
  | Emphasis // *italic*
  | Strong // **bold**
  | Delete // ~~strikethrough~~
  | InlineCode // `code`
  | Link // [text](url)
  | Image // ![alt](url)
  | LinkReference // [text][ref]
  | FootnoteReference
  | Html // Inline HTML
  | Break // Hard line break
```

### Extensions

```typescript
// Wikilinks (Obsidian)
interface WikiLink {
  type: "wikiLink"
  value: string // [[Page Name]]
  alias?: string // [[Page Name|display text]]
}

// Task extensions
interface TaskItem extends ListItem {
  checked: boolean
  taskMark: " " | "x" | "X" | "/" | "-" | "!"
  // Extended marks:
  // ' ' = todo
  // 'x'/'X' = done
  // '/' = wip (work in progress)
  // '!' = blocked
  // '-' = dropped
}

// Frontmatter
interface Yaml {
  type: "yaml"
  value: string // Raw YAML content
}

// Tags
interface Tag {
  type: "tag"
  value: string // #tag-name
}
```

---

## AST to Nodes

### Conversion Rules

| AST Type      | km Node Type   | Notes                           |
| ------------- | -------------- | ------------------------------- |
| root          | file           | Top-level document              |
| heading       | section        | Creates hierarchy by depth      |
| paragraph     | paragraph      | Content block                   |
| blockquote    | quote          | Nested content                  |
| code          | code           | With language metadata          |
| list          | (container)    | Children become list_item nodes |
| listItem      | ul / ol / task | Based on list type and checked  |
| thematicBreak | hr             | Separator                       |
| table         | table          | With row/cell children          |
| html          | html           | Preserved raw                   |

### Section Hierarchy

Headings create implicit sections. Content between headings belongs to the preceding heading.

```markdown
# Title → section (depth 1)

Intro paragraph. → paragraph (child of Title section)

## Section A → section (depth 2, child of Title)

Content A. → paragraph (child of Section A)

## Section B → section (depth 2, sibling of Section A)

Content B. → paragraph (child of Section B)
```

---

## Nodes to Markdown

### Serialization Rules

````typescript
function serializeNode(node: Node): string {
  switch (node.type) {
    case "section":
      const prefix = "#".repeat(node.data.depth || 1)
      return `${prefix} ${node.content}\n\n`
    case "paragraph":
      return node.content + "\n\n"
    case "quote":
      return (
        node.content
          .split("\n")
          .map((l) => "> " + l)
          .join("\n") + "\n\n"
      )
    case "code":
      return "```" + (node.data.lang || "") + "\n" + node.content + "\n```\n\n"
    case "ul":
      return "- " + node.content + "\n"
    case "ol":
      return "1. " + node.content + "\n"
    case "task":
      return `- [${node.task_mark || " "}] ${node.content}\n`
    case "hr":
      return "---\n\n"
    default:
      return node.content + "\n"
  }
}
````

---

## Task Parsing

### Standard Tasks

```markdown
- [ ] Open task
- [x] Completed task
```

### Extended Task Marks

```markdown
- [/] In progress
- [-] Cancelled
- [!] Blocked
```

### Task Metadata (Obsidian Tasks compatible)

```markdown
- [ ] Task with due date 📅 2024-01-15
- [ ] Task with scheduled date ⏳ 2024-01-10
- [ ] Task with priority priority:: P1
- [ ] Task with recurrence 🔁 every week
```

Parsed into node data:

```typescript
{
  type: 'task',
  content: 'Task with due date',
  task_status: 'todo',
  due_date: '2024-01-15',
  data: {
    emoji_markers: ['📅 2024-01-15']
  }
}
```

---

## Wikilinks

### Syntax

```markdown
[[Page Name]]                  Link to page
[[Page Name|Display Text]]     Link with alias
[[Page Name#Section]]          Link to section in page
[[Page Name#^block-id]]        Link to block ID in another page
[[#^block-id]]                 Link to block ID in same file (file-local)
[[^block-id]]                  Link to globally unique block ID (any file)
![[Page Name]]                 Embed (transclude) page
![[Page Name#^block-id]]       Embed specific block
```

### Block IDs

Block IDs are 4-6 character alphanumeric identifiers appended to any block:

```markdown
- [ ] Buy groceries ^k7m2
## Section Title ^abc1
Paragraph content ^x9p3
```

Three reference scopes:
- **`[[file.md#^id]]`** — block in a specific file
- **`[[#^id]]`** — block in the current file (file-local)
- **`[[^id]]`** — globally unique block (resolved across all files)

Block anchors are generated on-demand during serialization when an embed references
an inline node that doesn't yet have one. Stored in `node.name` (without `^`) —
since schema v6, the anchor literal IS the node's name (see
`hub/km/storage-architecture.md` §2.3).

### Parsed Representation

```typescript
interface WikiLink {
  type: "wikiLink"
  target: string      // "Page Name" (empty for file-local/global block refs)
  section?: string    // "Section"
  blockId?: string    // "block-id" (without ^)
  alias?: string      // "Display Text"
  embedded?: boolean  // true for ![[...]] embeds
}
```

### Resolution

```typescript
function resolveWikiLink(link: WikiLink, currentFile: Node): Node | null {
  // 1. Exact path match
  let target = findNodeByPath(link.target)

  // 2. Filename match (Obsidian-style)
  if (!target) {
    target = findNodeByFilename(link.target)
  }

  // 3. With section/block
  if (target && link.section) {
    target = findChildBySlug(target, link.section)
  }
  if (link.blockId) {
    target = resolveBlockId(link.blockId)
  }

  return target
}
```

---

## Inline Properties

`key:: value` syntax for structured metadata inline with content. Compatible with
Logseq, Obsidian Dataview, Tana, and Roam. Multiple properties per line supported.

### Syntax

```markdown
- [ ] Task blocked-by:: [[other-task]]
- [ ] Book review rating:: 5 author:: [[Oscar Wilde]]
- [ ] Deploy blocks:: [[km-auth]], [[km-api]]
```

### Property Types

| Type   | Example                      | Parsed Value                            |
| ------ | ---------------------------- | --------------------------------------- |
| Link   | `blocks:: [[km-a1b2]]`       | `{ type: "link", target: "km-a1b2" }`   |
| Number | `rating:: 5`                 | `{ type: "number", value: 5 }`          |
| Date   | `due:: 2024-01-15`           | `{ type: "date", value: "2024-01-15" }` |
| Text   | `reason:: Fixed in PR #123`  | `{ type: "text", value: "..." }`        |
| List   | `tags:: [[a]], [[b]], [[c]]` | `{ type: "list", values: [...] }`       |

### Storage

Properties are stored in `node.data.props`:

```typescript
{
  type: 'task',
  content: 'Task blocked-by:: [[other-task]] rating:: 5',
  data: {
    props: {
      'blocked-by': { type: 'link', target: 'other-task' },
      rating: { type: 'number', value: 5 }
    },
    propsRaw: {
      'blocked-by': '[[other-task]]',
      rating: '5'
    }
  }
}
```

### Backlinks

Property links create backlinks with relationship type:

- `blocks:: [[km-a1b2]]` on node X → X appears in km-a1b2's backlinks as "blocks"
- Enables semantic queries like finding all tasks that block a given issue

---

## Frontmatter

YAML frontmatter maps to node.data:

```markdown
---
id: 01H5X...
tags: [project, active]
due: 2024-01-15
priority: 1
---
```

```typescript
node.data = {
  id: "01H5X...",
  tags: ["project", "active"],
  due: "2024-01-15",
  priority: 1,
}
```

### Reserved Fields

| Field    | Maps To          |
| -------- | ---------------- |
| id       | node.id          |
| type     | node.type        |
| status   | node.task_status |
| due      | node.due_date    |
| priority | node.priority    |
| assigned | node.assigned_to |
| tags     | node.data.tags   |

---

## Position Tracking

Nodes track their source position for:

- Incremental updates (change only affected nodes)
- Jump-to-source in editor
- Merge conflict resolution

```typescript
interface Position {
  start: { line: number; column: number; offset: number }
  end: { line: number; column: number; offset: number }
}

// Stored in node
md_pos: number // start.offset (byte position)
md_end: number // end.offset
```

---

## Parser Implementation

Use [unified](https://unifiedjs.com/) ecosystem:

```typescript
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkWikiLink from "remark-wiki-link"

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm) // Tables, strikethrough, task lists
  .use(remarkWikiLink)

function parseMarkdown(content: string): Root {
  return parser.parse(content)
}
```

---

## Prior Art

### Block References

| System | Syntax | Scope |
|--------|--------|-------|
| **km** | `[[^id]]` | Global (any file) |
| **km** | `[[#^id]]` | File-local |
| **km** | `[[file#^id]]` | Cross-file |
| Obsidian | `[[file#^id]]`, `[[#^id]]` | File-scoped only (no global) |
| Logseq | `((block-uuid))` | Global (opaque UUIDs) |
| Pandoc | `{#id}` after heading | HTML anchor, same file |
| kramdown | `{: #id}` after block | HTML anchor, same file |
| PHP MD Extra | `{#id}` | HTML anchor |
| GitHub | Auto-slug from heading text | Same file, `#heading-text` |
| Org-mode | `#+NAME:`, `<<target>>`, `CUSTOM_ID` | Global via ID registry |

km's `[[^id]]` is unique: a globally-scoped block ref without specifying the file.

### Inline Metadata

| System | Syntax | Notes |
|--------|--------|-------|
| **km** | `key:: value` | Multiple per line, compatible with all below |
| Logseq | `key:: value` | Origin of double-colon syntax |
| Dataview | `key:: value`, `[key:: val]`, `(key:: val)` | Obsidian plugin; brackets for inline, parens hide key |
| Tana | `key:: value` | Backed by typed fields/supertags |
| Roam | `attribute:: value` | Same family |
| Obsidian native | YAML frontmatter only | No inline properties without Dataview |
| Pandoc/kramdown | `{#id .class key=val}` | HTML rendering attrs, not semantic data |
| Org-mode | `:PROPERTIES:` drawer | `:KEY: value` in block, not inline |

The `key:: value` double-colon family is the de facto standard for inline semantic
metadata across knowledge tools. km uses this syntax for cross-tool compatibility.

## References

- [mdast](https://github.com/syntax-tree/mdast) — Markdown AST spec
- [unified](https://unifiedjs.com/) — Text processing ecosystem
- [remark](https://remark.js.org/) — Markdown processor
- [Obsidian](https://help.obsidian.md/Editing+and+formatting/Basic+formatting+syntax) — Markdown extensions
- [Pandoc headings](https://pandoc.org/demo/example33/8.3-headings.html) — `{#id}` attribute syntax
- [kramdown IAL](https://kramdown.gettalong.org/syntax.html) — `{: #id .class}` inline attribute lists
- [Logseq properties](https://discuss.logseq.com/t/syntax-for-inline-properties/10031) — `key:: value` origin

---

## Body Content

Sections can contain "body content" — block-level nodes (paragraphs, code, quotes)
that appear before any subsections.

### Current Model (Virtual Body)

Body content is grouped at display time, not stored as a separate node:

```
section "Board"
├── paragraph "Board description"    ← body (virtual grouping)
├── code "example"                   ← body
├── section "Column 1"               ← structural children
└── section "Column 2"
```

Display renders body as a virtual first column (labeled "Description"):

- Read-only: cursor skips body columns in h/l navigation
- Styled differently: dimmed header, info icon

### Planned: km-ast Model

The virtual body heuristic (`extractBody`) is being replaced by a type-based split. In km-ast, node type determines role:

```
oi (section)
├── h "Section Title"        ← blocks[0] = title
├── p "Description"          ← blocks (body content)
├── code "example"           ← blocks
├── oi "Subsection 1"        ← subitems
└── oi "Subsection 2"        ← subitems
```

The split rule is uniform: `blocks = children.filter(c => c.type !== "oi")`, `subitems = children.filter(c => c.type === "oi")`. No positional heuristic — type alone determines classification.

See [design/model/kast.md](../design/model/kast.md) for the full specification.

---

## See Also

- [storage.md](../design/model/storage.md) — Node storage, sync
- [query.md](query.md) — Query language
