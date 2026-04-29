---
id: "@km/silvercode/adopt-text-render-react"
aliases:
  - km-silvercode.adopt-text-render-react
  - km-silvercode-adopt-text-render-react
created_by: claude:2405c72e
created_at: 2026-04-28T22:28:37Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.adopt-text-render-react
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T15:28:37Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [ ] Replace silvercode's block-level markdown renderer with @km/text-render + thread InlineComponents-equivalent @km/silvercode #task #P2

blocks:: [[@km/silvercode]]

Follow-up to @km/shared/text-render-package. The parser surface ships in @km/text-render (parse, types, prettifyUrl, extractRefs, displayLength, stripAnsi, search-decorations) — that's enough to unblock @km/silvercode/markdown-table-render P0.

But silvercode still has its OWN block-level markdown renderer (MarkdownView.tsx, LinkifiedText.tsx, SyntaxHighlighter.tsx, markdown.ts) that parallels @km/tui. The original @km/shared/text-render-package acceptance bullet called for deleting those — but that needs threading @km/tui's InlineComponents-equivalent React rendering into silvercode, currently coupled to Popover / AutolinksContext from @km/tui's view tree.

Scope:
- Extract a silvery-friendly InlineComponents from apps/@km/tui/src/text/InlineComponents.tsx that doesn't depend on Popover/AutolinksContext (or accepts them as optional injected context)
- Wire silvercode to use it via @km/text-render
- Delete apps/silvercode/.../{MarkdownView.tsx, LinkifiedText.tsx, SyntaxHighlighter.tsx, markdown.ts} parallel implementations
- Verify silvercode rendering parity post-cutover (snapshot tests in apps/silvercode/storybook/)

Why P2 (not P0): markdown-table-render P0 doesn't strictly require the silvercode-side block-renderer cutover — only the parser surface. This bead is the cleanup that completes the original @km/shared/text-render-package acceptance.

Reference: @km/shared/text-render-package agent report 2026-04-28 evening.