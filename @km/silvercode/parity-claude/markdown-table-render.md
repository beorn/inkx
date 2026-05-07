---
mentions:
  - km
aliases:
  - "@km/silvercode/markdown-table-render"
  - km-silvercode.markdown-table-render
  - km-silvercode-markdown-table-render
created_by: claude:1eb07bba
created_at: 2026-04-26T05:49:35Z
owner: bjorn@stabell.org
closed_at: 2026-05-06T22:23:05Z
close_reason: "Verified MarkdownView/Content.Table path renders GFM tables with
  alignment and wrapped cell content instead of truncating. Tests: bun vitest
  run apps/silvercode/tests/content-layout.test.tsx plus
  apps/silvercode/tests/visual/markdown.test.tsx
  apps/silvercode/tests/visual/markdown-bugs.test.tsx (10 visual markdown tests
  passed after the focused content-layout run)."
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
props:
  verified:
    type: text
    value: "2026-05-06: Content.Table + MarkdownView path verified by content-layout
      and markdown visual tests."
  blocked-by:
    type: list
    values:
      - type: link
        target: km-shared.text-render-package
      - type: link
        target: km-silvercode
propsRaw:
  verified: "2026-05-06: Content.Table + MarkdownView path verified by
    content-layout and markdown visual tests."
---

# [x] Markdown table rendering with column alignment @km/silvercode #feature #P0 ^markdown-table-render

blocks:: [[@km/silvercode/text-render-package]], [[@km/silvercode]]

Render markdown tables in silvercode's MarkdownView with column alignment from header separators (:--- / :---: / ---:).

Currently MarkdownView treats GFM tables as plain text — multi-row tabular output (e.g., bd output, Claude tool results showing data) renders as misaligned monospaced lines.

Scope:

- Parse |---| separator rows to detect tables and capture per-column alignment
- Render via silvery layout: each row a Box flexDirection=row, each cell a Text with padding to the column width
- Width budget: pick column widths via max content width per column, capped at terminal width / column count
- Alignment: left | center | right per the separator markers

Originally blocked on `@km/shared/text-render-package`; current implementation uses the mdast/GFM pipeline plus Silvercode `Content.Table` while the broader shared text-render extraction remains a separate architecture track.

## Implementation Notes

2026-05-05:

- `apps/silvercode/src/markdown.ts` now uses the mdast/GFM markdown pipeline and projects table headers, rows, and separator alignment into `MdBlock.kind === "table"`.
- `MarkdownView` delegates tables to `Content.Table` when inside `Content.Layout`.
- `Content.Table` tries prose, then wide, then full-width grid rendering; if the table cannot fit, it expands each row into key/value blocks.
- `Content.Table.Grid` and `Content.Table.Blocks` are available as explicit variants and are covered in the content layout story.
- Verification: `apps/silvercode/tests/detection.test.ts`, `apps/silvercode/tests/content-layout.test.tsx`, `apps/silvercode/tests/visual/markdown.test.tsx`, and `apps/silvercode/tests/visual/markdown-bugs.test.tsx` passed, 63 tests total.

2026-05-06:

- Re-verified after Claude Code parity triage: `bun vitest run apps/silvercode/tests/content-layout.test.tsx apps/silvercode/tests/visual/markdown.test.tsx apps/silvercode/tests/visual/markdown-bugs.test.tsx` passed, 53 tests.
- Existing regression `wide markdown tables wrap long cell content instead of truncating it` asserts the unique tail marker survives and no ellipsis is introduced.

