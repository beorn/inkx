---
mentions:
  - km
  - claude
id: "@km/market/doc-derived-glossary"
aliases:
  - km-market.doc-derived-glossary
  - km-market-doc-derived-glossary
created_by: claude:4929065a
created_at: 2026-04-01T07:09:15Z
closed_at: 2026-04-01T07:53:18Z
close_reason: "Implemented in @bearly/vitepress-enrich: 3 extraction patterns
  (heading+paragraph, abbreviation, dfn), JSONL round-trip, bucket composition,
  extractGlossary/extractFromMarkdown/loadBucket/writeGlossaryBucket/readGlossa\
  ryBucket API. 23 tests pass."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Doc-derived glossary: extract terms from source docs with buckets @km/market #feature #P3 @claude:4929065a

Extract glossary terms directly from documentation source files instead of maintaining separate JSON files. Support multiple extraction patterns and bucket-based composition.

## Extraction Patterns (support all 3)

1. **Heading + first paragraph**: Mark sections as glossary sources
   \`\`\`markdown

  <!-- glossary: components -->

- SelectList

Interactive keyboard-navigable list with j/k navigation and type-ahead search.

```
2. **Abbreviation syntax** (markdown-it-abbr): Inline definitions
 \`\`\`markdown
 *[SGR]: Select Graphic Rendition — ANSI escape codes for text styling
 \`\`\`
3. **\<dfn\> marking** (Bikeshed/W3C-style): Mark defining instance
 \`\`\`markdown
 The <dfn>alternate screen</dfn> preserves scrollback when fullscreen apps run.
 \`\`\`

## Buckets

Terms belong to named buckets (e.g., "terminal", "components", "hooks", "matchers"). Buckets can be:

- Specified in the definition: \`<!-- glossary: components -->\` or frontmatter
- Inferred from file path (e.g., docs/api/*.md → "api" bucket)
- Declared in glossary.json entries

Sites compose by importing specific buckets:
\`\`\`typescript
const glossary = [
...loadBucket("terminal"),      // from terminfo.dev
...loadBucket("components"),    // extracted from silvery docs
...loadBucket("matchers"),      // extracted from termless docs
...siteSpecific,                // manual overrides
]
\`\`\`

## Architecture

Build-time VitePress plugin that:

1. Scans markdown files for glossary markup (all 3 patterns)
2. Extracts term + definition + bucket into JSONL files
3. JSONL files can be imported by other sites
4. Composed glossary feeds into the existing glossaryPlugin

## Prior Art

- MDN: glossary-as-directory (each term = a page)
- Sphinx: `:term:` cross-references with `.. glossary::` directive
- Bikeshed: \<dfn\> + auto-linking with spec-dfn-contract
- Wikipedia: heading + first paragraph extraction for hover previews
- docusaurus-plugin-glossary: remark plugin scanning AST text nodes

## Value

- Terms stay in sync with docs (no separate file to maintain)
- Cross-site composition via buckets (terminfo terminal terms available everywhere)
- Scales to 200+ terms where manual JSON breaks down
- Foundational for any content-rich VitePress site

```

