---
id: "@km/inbox/6147-inkx-deduplicate-character-width-calculation"
aliases:
  - km-6147
  - "@km/_orphan/6147"
  - "@km/_orphan/6147-inkx-deduplicate-character-width-calculation"
created_at: 2026-01-20T07:43:44Z
closed_at: 2026-01-20T10:14:27Z
---

# [x] InkX: Deduplicate character width calculation @km/_orphan #bug #P1

## Problem
Character width calculation logic is duplicated in two places instead of using the centralized unicode.ts utilities:

1. `vendor/beorn-inkx/src/reconciler.ts:115-136` - `measureTextWidth()`
2. `vendor/beorn-inkx/src/pipeline.ts:1235-1253` - `getCharWidth()`

Both contain identical hardcoded CJK ranges while proper `displayWidth()` and `graphemeWidth()` functions exist in `vendor/beorn-inkx/src/unicode.ts`.

## Risk
If CJK ranges need updating, developers must update two places - bug likely.

## Solution
- Delete `measureTextWidth()` from reconciler.ts
- Delete `getCharWidth()` and `sliceByWidth()` from pipeline.ts
- Use `displayWidth()` and `graphemeWidth()` from unicode.ts instead