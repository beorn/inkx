---
id: "@km/_orphan/jwsk"
aliases:
  - km-jwsk
created_at: 2026-01-20T07:43:36Z
closed_at: 2026-01-20T08:57:42Z
---

# [x] Add tests for transformers.ts @km/_orphan #task #P3

## Problem
packages/@km/_orphan/board/src/transformers.ts has 2 public functions with 0 tests:
- toBoardViewModel()
- toTreeViewModel() (deprecated alias)

## Solution
Create packages/@km/_orphan/board/tests/transformers.test.ts verifying:
- toBoardViewModel() preserves Sets for selectedNodes/foldedNodes
- toTreeViewModel() alias works correctly