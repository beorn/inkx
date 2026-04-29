---
id: "@km/silvercode/markdown-table-render"
aliases:
  - km-silvercode.markdown-table-render
  - km-silvercode-markdown-table-render
created_by: claude:1eb07bba
created_at: 2026-04-26T05:49:35Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.markdown-table-render
    depends_on_id: km-shared.text-render-package
    type: blocks
    created_at: 2026-04-28T12:45:11Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-silvercode.markdown-table-render
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T14:19:55Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [ ] Markdown table rendering with column alignment @km/silvercode #feature #P0

blocks:: [[@km/shared/text-render-package]], [[@km/silvercode]]

Render markdown tables in silvercode's MarkdownView with column alignment from header separators (:--- / :---: / ---:).

Currently MarkdownView treats GFM tables as plain text — multi-row tabular output (e.g., bd output, Claude tool results showing data) renders as misaligned monospaced lines.

Scope:
- Parse |---| separator rows to detect tables and capture per-column alignment
- Render via silvery layout: each row a Box flexDirection=row, each cell a Text with padding to the column width
- Width budget: pick column widths via max content width per column, capped at terminal width / column count
- Alignment: left | center | right per the separator markers

Blocked-on: @km/shared/text-render-package (architectural — extract @km/tui/src/text/* into a shared package so MarkdownView in silvercode can reuse km's existing inline parser + components instead of reimplementing). See feedback in earlier session: "make sure that rendering of 'content' is shared with km not reimplemented in silvercode".

Parked from /loop session 2026-04-28 evening at user direction.