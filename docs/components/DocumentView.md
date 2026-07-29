# DocumentView

`DocumentView` renders an already-projected semantic document. It does not
parse Markdown or depend on an application store.

```tsx
import { DocumentView, type DocumentBlock } from "silvery"

const blocks: DocumentBlock[] = [
  { id: "title", kind: "heading", level: 1, content: "Release" },
  {
    id: "first",
    kind: "list-item",
    list: { groupId: "steps", depth: 0, ordered: true },
    content: "Run verification",
  },
  {
    id: "second",
    kind: "list-item",
    list: { groupId: "steps", depth: 0, ordered: true },
    content: "Publish",
  },
]

;<DocumentView blocks={blocks} />
```

The presenter owns:

- heading and paragraph rhythm
- prose, wide, and full Content lanes
- ordered counters
- fixed marker columns and the real marker/body gap
- hanging indents and nested-list indentation
- quote, code, table, rule, and extension-block geometry
- selected-row background and foreground

Supported block kinds are `heading`, `paragraph`, `list-item`, `quote`,
`code`, `table`, `rule`, and `extension`.

## List identity

Every list item supplies a stable `groupId`. Items in one ordered group advance
from `start` (default `1`) even when a parser normalizes source markers. The
widest marker in the group determines the marker column, so `9.`, `10.`, and
`11.` share one body column. `depth` is zero-based.

Applications may supply a leaf `marker` (for example, a checkbox) and its
`markerWidth`. DocumentView still owns the marker cell, gap, body column, and
wrapping.

## Extension boundary

`content`, `marker`, and `accessory` accept React nodes as leaf or inline
content. They are not block-layout escape hatches. Adapters must not use them
to recreate lanes, list rows, rhythm, or wrapping.

If no surrounding [`Content.Layout`](./Content.md) exists, DocumentView
provides one automatically. A host may provide Content explicitly to customize
lane widths without changing document geometry.
