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
  │                              1. kmBlockIdTransform     ← strips ` ^id`, sets data.blockId
  │                              2. kmInlinePropTransform  ← extracts key:: value, sets data.props
  │                              3. kmRefsTransform        ← extracts #tag @mention +project
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

| Transform | What it does | Data fields set |
|-----------|--------------|-----------------|
| `kmBlockIdTransform` | Strips ` ^blockId` suffix from text | `node.data.blockId` |
| `kmInlinePropTransform` | Extracts `key:: value` pairs | `node.data.props`, `.propsRaw`, `.cleanText` |
| `kmRefsTransform` | Extracts `#tag`, `@mention`, `+project` | `node.data.tags`, `.mentions`, `.projects` |

Transform order matters: block-id modifies text first, then inline-prop, then refs reads remaining text.

## Type Extensions (module augmentation)

All types are in `packages/km-markdown/src/kmast/types.ts`. Uses mdast's module augmentation pattern:

```typescript
// Extended Data fields (on existing mdast nodes)
declare module 'mdast' {
  interface Data {
    blockId?: string
    props?: Record<string, PropertyValue>
    propsRaw?: Record<string, string>
    cleanText?: string
    tags?: string[]
    mentions?: string[]
    projects?: string[]
  }
  interface ListItemData extends Data {
    taskMark?: string   // '/', '-', '!', ' ', 'x', 'X'
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
    km-block-id.ts        ← mdast tree transform
    km-inline-prop.ts     ← mdast tree transform
    km-refs.ts            ← mdast tree transform
    index.ts              ← Combined: km() + kmFromMarkdown()
```
