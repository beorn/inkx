---
id: "@km/_orphan/6pyw"
aliases:
  - km-6pyw
created_at: 2026-01-20T07:45:25Z
closed_at: 2026-01-20T13:08:49Z
---

# [x] InkX: Add tests for missing unicode functions @km/_orphan #task #P4

## Problem
Several functions in `vendor/beorn-inkx/src/unicode.ts` lack test coverage:
- normalizeText() (line 679)
- getFirstCodePoint() (line 726)
- isLikelyEmoji() (line 735)
- isCJK() (line 743)

## Solution
Add tests in unicode.test.ts for these functions.