---
id: "@km/inbox/rem3"
aliases:
  - km-rem3
  - "@km/_orphan/rem3"
created_at: 2026-01-20T10:30:03Z
closed_at: 2026-01-20T13:27:33Z
---

# [x] Flexx: Expand test coverage beyond layout.test.ts @km/_orphan #task #P2

## Problem
Flexx has only 1 test file with 44 tests for 1,434 LOC (46% test-to-source ratio).

Missing test coverage:
- Wrap modes (WRAP_WRAP, WRAP_WRAP_REVERSE)
- display:none behavior
- Reverse flex directions
- Edge cases: zero dimensions, negative values
- Circular parent-child relationships
- Very deep nesting

## Solution
Add comprehensive tests. Estimated ~200-300 lines of new tests.