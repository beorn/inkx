# kmast — km Markdown AST Extensions

**kmast = mdast + km extensions**. The AST is self-describing: all km semantics live in AST structure and data fields, not in downstream regex extraction.

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
kmast tree (enriched mdast)
  │
  ▼
astToNodes()         ──── reads kmast data fields instead of regex
  │
  ▼
KNode[]
```

## Extension Types

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

## Type Extensions (module augmentation)

All types are in `packages/km-markdown/src/kmast/types.ts`. Uses mdast's module augmentation pattern:

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

### kmast → KLink

The parser-layer `KmWikilink` (above), plus mdast's native `Link` and autolink/bare-URL nodes, are lowered by `astToNodes()` into the canonical [`KLink`](design/links.md) that lives inside `KNode.content`:

```typescript
type KLink = {
  href: string                                    // parsed target (km:Note, #Section, https://…)
  rel: 'link' | 'embed'                           // closed enum for v1
  alias?: string                                  // |alias or [text](…) text
  md?: { form?: 'wiki' | 'mdlink' | 'autolink' | 'bare' }
}
```

`md.form` captures the notation for roundtrip fidelity. `#tag`, `@mention`, `+project` sigils are recognized as `rel: 'link'` with `md.form: 'bare'` — sigils are part of the node name, not a separate namespace. See [docs/design/links.md](design/links.md) for the full link model, including the complete Markdown → KLink table.

## Usage

```typescript
import { parseMarkdown } from '@km/markdown'

// parseMarkdown() already uses km() + kmFromMarkdown() internally
const tree = parseMarkdown('- [/] Task #urgent blocked-by:: [[other]] ^abc')

// tree is a kmast tree with all extensions applied:
// listItem.data.taskMark = '/'
// listItem.data.blockId = 'abc'
// listItem.data.tags = ['urgent']
// listItem.data.props = { 'blocked-by': { type: 'link', target: 'other' } }
```

## File Layout

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
