---
id: "@km/_orphan/qwtw"
aliases:
  - km-qwtw
created_at: 2026-01-20T07:44:52Z
closed_at: 2026-01-20T13:08:49Z
---

# [x] InkX: Refactor unicode.ts @km/_orphan #task #P3

## Problem
`vendor/beorn-inkx/src/unicode.ts` is 746 lines mixing concerns:
- Grapheme segmentation
- Display width calculation
- ANSI handling

## Proposed
Consider splitting into focused modules if it continues to grow.