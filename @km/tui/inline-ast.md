---
mentions:
  - km
  - claude
id: "@km/tui/inline-ast"
aliases:
  - km-tui.inline-ast
  - km-tui-inline-ast
created_by: claude:8f007ba9
created_at: 2026-02-20T17:10:51Z
closed_at: 2026-02-21T08:42:01Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Replace regex text pipeline with inline AST → JSX rendering @km/tui #feature #P2 @claude:8f007ba9

Replace regex text pipeline with inline AST → JSX rendering.

## Status: Ready to implement

All infrastructure is BUILT (zero consumers):

- `inline-parser.ts` — mdast-based parser (`parseInlineText()`), 30+ tests passing
- `InlineComponents.tsx` — 13 JSX components + `InlineText` drop-in + `InlineRenderContext`
- `inline-ast-types.ts` — 13 InlineNode types

## Migration Plan (6 phases)

1. **Parity tests** — New test file for InlineComponents (lock in behavior)
2. **JSX consumers** — shared-components.tsx (1), NodeView.tsx (6), DetailPane.tsx (9 sites)
3. **TreeNode.tsx** — constrainText → Box height clip, stripFgColor → color inheritance
4. **renderPlain consumers** — CardColumn, ListView, TabsView, board-top-bar (7 sites)
5. **render.ts** — Keep string-based for now (2 sites, non-React path)
6. **Cleanup** — Remove processText, dead regex, update exports

## Key Decisions

- Use mdast ecosystem (fromMarkdown + GFM), no custom parsers
- `@km/markdown` has canonical extractors (extractTags/Mentions/Projects) — reuse
- render.ts stays string-based (ColumnsView virtual list, non-React)
- constrainText replaced by `<Box height={2} overflow="hidden">`
- stripFgColor replaced by inkx color inheritance + parent `<Text color=...>`

