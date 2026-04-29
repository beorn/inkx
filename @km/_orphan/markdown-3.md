---
id: "@km/_orphan/markdown-3"
aliases:
  - km-markdown-3
created_at: 2026-01-25T01:31:10Z
closed_at: 2026-02-04T11:27:34Z
---

# [x] Investigate splitting roundtrip.test.ts (1800 lines) @km/_orphan #task #P3

## Context

Test quality review found roundtrip.test.ts is the LARGEST test file (1800 lines, 104 tests).

## Problem

Very large test files are harder to navigate, review, and maintain.

## Proposal

Investigate splitting by markdown feature:
1. roundtrip-links.test.ts - Link parsing and serialization
2. roundtrip-lists.test.ts - List items (tasks, bullets)
3. roundtrip-blocks.test.ts - Code blocks, quotes, etc.
4. roundtrip-inline.test.ts - Inline formatting (bold, italic, code)

## Acceptance Criteria

- [ ] Review file structure and identify natural split points
- [ ] Property-based tests remain comprehensive
- [ ] All tests still pass
- [ ] File sizes more balanced (<500 lines each)

## Reference

See docs/dev/test-quality-report.md for full review findings.