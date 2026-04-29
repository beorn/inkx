---
id: "@km/_orphan/7gno"
aliases:
  - km-7gno
created_at: 2026-01-22T22:07:44Z
closed_at: 2026-01-22T23:01:09Z
---

# [x] @due() incorrectly parsed as mention in frontmatter @km/_orphan #bug #P2

## Description
The markdown parser incorrectly extracts `@due(2024-01-15)` as a mention when it appears in YAML frontmatter, even though frontmatter should be treated as opaque string content.

## Reproduction
```typescript
const original = `---
due: "@due(2024-01-15)"
---
# Test`;
const nodes = parseMarkdownToNodes(original, "/test.md");
const regenerated = nodesToMarkdown(nodes);
// Frontmatter content may be corrupted or missing the @due reference
```

## Impact
- Frontmatter corruption during round-trip
- May affect other @ patterns in frontmatter (emails, usernames)

## Test
`packages/km-storage/tests/watch/chaos/roundtrip.test.ts` - frontmatter round-trip tests

## Fix Approach
Disable mention extraction when parsing within frontmatter blocks. The frontmatter content should be preserved verbatim.