---
mentions:
  - km
  - claude
id: "@km/shared/text-render-package"
aliases:
  - km-shared.text-render-package
  - km-shared-text-render-package
created_by: claude:2405c72e
created_at: 2026-04-28T19:44:55Z
started_at: 2026-04-28T22:11:22Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-shared.text-render-package
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-28T12:44:55Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [/] Extract km-tui text pipeline into shared package — silvercode adopts, no duplication @km/shared #task #P1 @claude:2405c72e

blocks:: [[@km/all]]

Architectural debt: @km/tui and silvercode each ship their own markdown / inline-link / autolink rendering, with parallel implementations of essentially the same surface.

@km/tui has at apps/@km/tui/src/text/:

- inline-parser.ts (parseInlineText: markdown → InlineNode[])
- InlineComponents.tsx (InlineBold, InlineItalic, InlineLink, InlineWikiLink, InlineCode, InlineMention, InlineTag, InlineProject, InlineField, InlineBareURL, InlineNodes orchestrator)
- inline-ast-types.ts, rich.ts, format.ts, text-pipeline.ts, AutolinksContext, link-interaction, search-decorations, url-metadata

silvercode parallel impl:

- apps/silvercode/src/markdown.ts (parseBlocks)
- apps/silvercode/src/components/MarkdownView.tsx (block renderer)
- apps/silvercode/src/components/LinkifiedText.tsx (auto-detects URLs/paths in plain text — comment at line 12 explicitly acknowledges duplication of @km/tui)
- apps/silvercode/src/components/SyntaxHighlighter.tsx (code block syntax highlighting)
- apps/silvercode/src/components/MarkdownTable (markdown tables — see @km/silvercode/markdown-table-render which is now blocked on this bead)

Goal: extract a new package, e.g. @km/text-render or fold into @km/markdown, that exports React components and hooks both apps consume. silvercode's parallel impl gets deleted.

Phasing:

1. Audit the surface: list every export silvercode and @km/tui currently use from their parallel impls. Find the union.
2. Pick the home: extending @km/markdown is cheaper (already published, already a dep of silvercode) but conflates parser with renderer. New @km/text-render package is cleaner but more setup.
3. Move @km/tui's text/ files into the new package; @km/tui imports from the package.
4. silvercode adopts package. Delete silvercode/src/components/MarkdownView, LinkifiedText, SyntaxHighlighter, markdown.ts.
5. Verify: @km/tui visual tests still green; silvercode visual tests still green; bundle size doesn't regress.

Until this bead lands: NEW silvercode work that touches content rendering must NOT introduce new parallel implementations. If a silvercode component needs a markdown/inline-link primitive that doesn't exist yet, ADD IT TO @km/tui's text/ first, then call it from silvercode (cross-app import is OK in monorepo dev mode while the extraction is pending).

Acceptance:

- New package or extended @km/markdown with: parseInline, parseBlocks, MarkdownView (block), InlineNodes (inline), Linkified, SyntaxHighlight
- @km/tui imports from the package
- silvercode imports from the package; old parallel files deleted
- bun run test:fast green for both apps
- bundle size: silvercode + @km/tui combined doesn't grow (verify via tsdown sizes)

