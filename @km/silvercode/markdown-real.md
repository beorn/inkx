---
id: "@km/silvercode/markdown-real"
aliases:
  - km-silvercode.markdown-real
  - km-silvercode-markdown-real
created_by: claude:0940ca20
created_at: 2026-04-24T16:36:29Z
closed_at: 2026-04-24T16:45:50Z
close_reason: Shipped via Agent-A + tests in 9eca295cc.
  apps/silvercode/src/markdown.ts now uses @km/markdown
  (mdast-util-from-markdown + GFM), streaming-safe safeParse fallback,
  MarkdownView.tsx unchanged (same MdBlock/MdInline shapes).
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.markdown-real
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T09:36:43Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] Replace naive md tokenizer with @km/markdown (real mdast) @km/silvercode #task #P2 @claude:0940ca20

blocks:: [[@km/silvercode]]

Current apps/silvercode/src/markdown.ts is a hand-rolled regex tokenizer. @km/markdown already uses mdast-util-from-markdown and handles edge cases (nested emphasis, code fences in lists, tables with inline markup, etc.). Refactor MarkdownView.tsx to call @km/markdown's parseMarkdown → mdast Root, then render via a node-type switch. Keep the InlineRun/MarkdownTable render primitives; just swap the parser+types underneath. Tests in apps/silvercode/tests/markdown.test.ts should continue to pass (they test block/inline detection; upgrade them to assert new edge cases while at it).