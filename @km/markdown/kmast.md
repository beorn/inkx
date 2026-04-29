---
id: "@km/markdown/kmast"
aliases:
  - km-markdown.kmast
  - km-markdown-kmast
created_by: claude:4c413aae
created_at: 2026-02-21T17:30:09Z
closed_at: 2026-02-21T18:22:07Z
---

# [x] kmast: proper micromark extensions for km markdown syntax @km/markdown #feature #P2 @claude:4c413aae

## Problem
astToNodes() extracts @km/_orphan/specific semantics (custom task marks, wikilinks, block IDs, inline properties, HR styles) via regex post-processing on mdast text. This requires threading raw sourceText through the entire conversion pipeline and prevents clean HTML→AST→KNode pipelines (needed for Asana import).

## Solution
Write proper micromark + mdast-util extensions that make the AST self-describing:
1. micromark-extension-@km/_orphan/task — tokenize [/], [-], [!] as first-class task marks
2. micromark-extension-@km/_orphan/wikilink — tokenize [[target]], ![[embed]], [[^blockId]]
3. micromark-extension-@km/_orphan/block-id — tokenize ^blockId suffixes
4. micromark-extension-@km/_orphan/inline-props — tokenize key:: value pairs
5. mdast-util counterparts — extend mdast node types with km fields
6. Define kmast as mdast + these extensions (typed, documented)

## Deliverables
- packages/@km/markdown/src/kmast/ — extension implementations
- packages/@km/markdown/src/kmast/types.ts — kmast type definitions
- docs/kmast.md — architecture doc explaining the AST layer
- Full unit tests for each extension (tokenizer + AST + round-trip)
- Refactor astToNodes to consume kmast instead of regex-extracting from text
- Remove sourceText parameter from astToNodes/convertListItem/convertBlock

## Impact
- Unblocks HTML→mdast→kmast→KNode pipeline for Asana import
- Makes the AST self-describing — cleaner, more correct parsing
- Enables future markdown extensions without more regex hacks