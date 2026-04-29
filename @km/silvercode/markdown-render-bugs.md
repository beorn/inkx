---
id: "@km/silvercode/markdown-render-bugs"
aliases:
  - km-silvercode.markdown-render-bugs
  - km-silvercode-markdown-render-bugs
created_by: claude:2405c72e
created_at: 2026-04-25T06:39:25Z
closed_at: 2026-04-25T06:58:41Z
close_reason: "Shipped: km main 145d5ff71. Single root cause for all 3 bugs:
  rendering inline runs as separate <Text> flex items inside <Box
  flexWrap=wrap>. Fix: single outer <Text wrap=wrap> with nested styled <Text>
  spans for each token. silvery's collectTextWithBg + mergeStyleContext treats
  nested Text as virtual children → one wrappable text run with per-span style
  projection. Tests at apps/silvercode/tests/visual/markdown-bugs.test.tsx (3
  cases — bullet spacing, URL+colon flow, bold/italic cell attrs)."
---

# [x] Markdown rendering bugs: inconsistent bullet spacing, stray colon, no bold/italic @km/silvercode #bug #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

## Symptoms (assistant message rendering, observed 2026-04-25 wrap fix landed)

Three issues in the same paste, all in silvercode's markdown rendering path:

### 1. Inconsistent bullet spacing

Some bullets render \`• Content\` (proper space), others render \`•Content\` (glued). No clear pattern between them in the same message:

\`\`\`
    • Monorepo with vendored submodules…       ← space (correct)
    • Internal docs in hub/…                    ← space (correct)
    •Issue tracking via beads…                  ← NO SPACE (wrong)
    •Code style: factory functions…             ← NO SPACE (wrong)
    •State machines as (action, state)…         ← NO SPACE (wrong)
\`\`\`

### 2. Colon stranded on new line after a URL

\`\`\`
    Sibling reactive primitives at github.com/beorn/bearly
    : alien-projections, alien-resources, alien-trees — built on upstream alien-
\`\`\`

The trailing \`:\` separator after the URL ends up on its own line. URL detection or link rendering is breaking the inline flow at the URL boundary instead of treating "github.com/beorn/bearly:" as a single inline run.

### 3. No bold/italic styling

Markdown \`**bold**\` and \`*italic*\` aren't being rendered visually. Whole paragraphs render as plain prose with no emphasis applied.

## Suspected files

- \`apps/silvercode/src/components/MarkdownView.tsx:82-99\` — bullet rendering uses \`<Text color="\$muted">• </Text>\` followed by \`<Prose>{InlineRun}</Prose>\`. The hardcoded "• " (with space) suggests bullet 1+2 work; the "•Content" cases hint at the inline parser stripping leading whitespace from b.text inconsistently, OR the wrap algorithm dropping the leading space on wrapped lines after a bullet.
- \`apps/silvercode/src/components/MarkdownView.tsx\` parseInline / InlineRun — likely the colon-after-URL bug (URL detection split a token boundary)
- \`apps/silvercode/src/markdown.ts\` — possibly the parseInline implementation; check \`bun recall "markdown-real"\` for the @km/markdown migration context (m7-silvery-markdown closed)
- \`apps/silvercode/src/components/InlineRun.tsx\` (if exists) — emphasis (bold/italic) rendering

## Repro

Send a long assistant message containing a bulleted list with mixed multi-line/single-line bullets, an inline URL followed by ": text", and **bold** + *italic* segments. silvercode "tell me about this repo" prompt produces a clear repro.

## Acceptance

- [ ] Bullet spacing consistent across all bullets (always \`• Content\`)
- [ ] URL with trailing punctuation flows inline (no orphan colon line)
- [ ] **bold** renders bold; *italic* renders italic
- [ ] Visual regression test in apps/silvercode/tests/visual/ asserting all three (driving via createTermless)

## Related

- \`km-silvercode.prose-primitive\` (closed) — Prose covers the wrap path, but markdown internals under Prose are still broken
- \`km-silvercode.markdown-real\` (closed, m7) — assumed @km/markdown is live; verify whether the parsing or the rendering layer owns these bugs