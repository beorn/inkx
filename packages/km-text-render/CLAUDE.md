# @km/text-render

Shared inline-text parsing primitives — markdown + km-syntax (wikilinks, `@mentions`, `#tags`, `+projects`, `key::value` fields, `[[wikilinks]]`, bare URLs) → `InlineNode[]` AST.

This package is **consumed by both km-tui and silvercode** so neither has to reimplement the parser. Renderer React components live in the consumer apps — this package only owns the data layer (AST + parsing + helpers).

## Surface

- `parseInlineText(text)` — text → `InlineNode[]`. Builds on `mdast-util-from-markdown` + `@km/markdown`'s `km` extension, with km-syntax post-processing of mdast `text` nodes.
- `parseToPlainText(text)` — text → display string (sigils preserved, markdown stripped).
- `inlineNodesToPlainText(nodes)` — `InlineNode[]` → display string.
- `extractRefs(content)` — pull `{ mentions, tags, projects, wikilinks }` arrays from raw text.
- `prettifyUrl(url)` — strip protocol/tracking params, apply site-specific shortening (Google Docs, Drive, Amazon).
- `SIGIL_PATTERN` — canonical Unicode-aware regex for `@`/`#`/`+` sigils.
- `displayLength(text)` — Unicode-aware width (handles emoji, CJK, ANSI escapes).
- `stripAnsi(text)` — re-export from `@silvery/ag-react`.
- `computeSearchDecorations(visibleText, query, isCurrent)` — `TextDecoration[]` for highlighted matches.
- `computeSearchDecorationsFromSource(sourceText, query, isCurrent)` — same, but parses source first.

## What lives elsewhere (intentional)

The km-tui-specific render layer stays in `apps/km-tui/src/text/`:

- `InlineComponents.tsx` — React components (depend on silvery `<Link>`/`<Text>`, `Popover`, `AutolinksContext`, `link-interaction` — not portable).
- `colors.ts` — board color tokens (km-tui board concept).
- `format.ts` — depends on `KNode`/`Repo` (km data model).
- `AutolinksContext.tsx`, `autolink-popover.tsx`, `link-interaction.ts`, `url-metadata.ts` — interaction layer.

If silvercode wants the same React rendering shape, the next step is to extract the components into a `packages/km-text-render-react/` package — but that requires inverting the dependency on Popover/AutolinksContext (currently coupled to km-tui's view tree). Out of scope for this bead.

## Dependencies

- `@km/markdown` — for the `km` micromark extension (wikilinks, fields, block refs)
- `@silvery/ag-react` — re-exports `stripAnsi` only (not React components)
- `mdast-util-from-markdown`, `@types/mdast` — parser
- `string-width` — Unicode-aware width

## Tests

`packages/km-text-render/tests/` covers the contract — paragraphs, bold/italic/code, links, lists, sigils, wikilinks, search decorations. The tests run as part of `bun run test:fast`.

## See also

- Bead `@km/shared/text-render-package` — the extraction itself.
- Bead `@km/silvercode/markdown-table-render` (P0) — the consumer this unblocked.
