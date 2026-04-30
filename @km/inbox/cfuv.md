---
id: "@km/inbox/cfuv"
aliases:
  - km-cfuv
  - "@km/_orphan/cfuv"
created_at: 2026-01-20T07:44:50Z
closed_at: 2026-01-20T13:08:49Z
---

# [x] InkX: Extract reconciler helpers @km/_orphan #task #P3

## Problem
`vendor/beorn-inkx/src/reconciler.ts` is 979 lines with extractable helper functions:
- applyBoxProps (lines 174-339)
- applySpacing (lines 344-381)
- Helper mappings (lines 386-414)

## Proposed
Extract to `reconciler/helpers.ts` or `reconciler/yoga-utils.ts`