---
mentions:
  - km
  - claude
id: "@km/inbox/rev-tests-0126"
aliases:
  - km-rev-tests-0126
  - "@km/_orphan/rev-tests-0126"
created_at: 2026-01-26T17:14:16Z
closed_at: 2026-01-27T12:16:13Z
assignee: claude:5f8fa618
---

# [x] Test review: merge navigation tests, parameterize roundtrip, fix timing @km/_orphan #task #P2 @claude:5f8fa618

## Test Review Findings - 2026-01-26

## Completed in This Session

- [x] Fixed storybook.tsx SQLite layer violation (dead code removed)
- [x] Deleted 5 duplicate tests from markdown.test.ts (120+ lines)
- [x] Deleted 1 tautology test from roundtrip.test.ts

## Remaining Optimizations

### Performance (test:fast at 9-10s, target <5s)

**Slowest file: board.spec.ts (1056ms)**

- This single file is ~10% of total runtime
- Consider optimizing fixture setup or splitting tests

### Merges Needed

1. **visual-navigation.test.ts (745 lines) + layout-registry.test.ts (492 lines)**
- Significant conceptual overlap testing same registry
- Could reduce to ~600-700 lines combined
5. **roundtrip.test.ts wiki-link tests (lines 839-944)**
- 9 nearly identical tests for wiki-link variations
- Convert to parameterized test.each
9. **normalizeMarkdown() helper**
- Duplicated in roundtrip.test.ts and properties-roundtrip.test.ts
- Extract to shared test-utils

### Minor Fixes

- repo.test.ts:27 uses `km-repo-test-` prefix (inconsistent with `kmtest-`)

