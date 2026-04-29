---
id: "@km/props/2-km-props-integrate-into-ast2nodes-convertlistitem"
aliases:
  - km-props.2
  - km-props-2
  - "@km/props/2"
created_at: 2026-01-21T10:47:26Z
closed_at: 2026-01-21T12:13:26Z
---

# [x] km-props: Integrate into ast2nodes convertListItem() @km/props #task #P1

In ast2nodes.ts, modify convertListItem() to:
1. Call parseInlineProperties(text) on task content
2. Store parsed values in node.data.props
3. Store raw strings in node.data.propsRaw (for round-trip preservation)

File: packages/@km/markdown/src/ast2nodes.ts (around line 332)
