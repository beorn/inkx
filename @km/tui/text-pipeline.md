---
id: "@km/tui/text-pipeline"
aliases:
  - km-tui.text-pipeline
  - km-tui-text-pipeline
created_by: claude:fcaad2fa
created_at: 2026-02-18T13:14:44Z
closed_at: 2026-02-19T11:21:13Z
---

# [x] Unified text stripping/formatting pipeline @km/tui #task #P2

Unified text stripping/formatting pipeline in \`apps/km-tui/src/text/pipeline.ts\`.

## Status: IMPLEMENTED (feat/nodeview-unify branch)

## What was done

Created a single canonical module that replaces 6 duplicate sigil regex patterns and 4 overlapping text stripping functions across the codebase.

### New canonical functions in pipeline.ts
- \`extractRefs(text)\` — Unicode-aware extraction of @mentions, #tags, +projects, [[wikilinks]]
- \`stripSigils(text, options?)\` — configurable sigil stripping (strip all, shorten persons, keep mentions)
- \`stripMetadata(text)\` — inline metadata + block ID stripping, multi-line aware
- \`toPlainText(text)\` — strips all markup to plain text (replaces renderPlain)
- \`toRichText(text, options?)\` — markdown → styled ANSI (replaces renderRich)
- \`displayLength(text)\` — Unicode-aware display width
- \`SIGIL_REGEX\` — canonical Unicode-aware sigil pattern

### Consumers migrated
- \`text/rich.ts\` → thin facade, delegates to pipeline
- \`detail-pane-helpers.ts\` → stripInlineRefs/shortenInlineRefs/extractReferences delegate to pipeline
- \`search-utils.ts\` → extractTags now Unicode-aware via pipeline
- \`TreeNode.tsx\` → stripContentForDisplay uses pipeline.stripMetadata()
- \`km-cli/debug-log.ts\` → uses inkx stripAnsi instead of local copy

### Tests
51 new tests in \`apps/km-tui/tests/text/pipeline.test.ts\`.

### Intentional behavior change
\`extractTags("#tag-with-dash")\` now returns \`["tag-with-dash"]\` instead of \`["tag"]\`. This is correct — hyphens are valid in tag names, consistent with the @km/markdown COMBINED_REFS_REGEX.

### Remaining duplication to address
- \`km-markdown/parser.ts\` still has its own extractTags/Mentions/Projects with ASCII-only patterns. These should be updated to import from a shared location (pipeline.ts is in @km/tui, so a shared package like @km/_orphan/core would be needed for cross-package sharing).