---
id: "@km/_orphan/g5vj"
aliases:
  - km-g5vj
created_at: 2026-01-20T07:43:51Z
closed_at: 2026-01-20T10:15:07Z
---

# [x] InkX: Implement truncate-start and truncate-middle modes @km/_orphan #bug #P1

## Problem
Text wrapping modes `truncate-start` and `truncate-middle` are defined in the type signature but not actually implemented.

**Type signature** (`vendor/beorn-inkx/src/types.ts:150`):
```typescript
wrap?: 'wrap' | 'truncate' | 'truncate-start' | 'truncate-middle' | 'truncate-end' | boolean
```

**Implementation** (`vendor/beorn-inkx/src/pipeline.ts:583`):
Only handles `truncate`, `truncate-end`, and `wrap`. No special handling for `truncate-start` or `truncate-middle`.

## Impact
Users setting `wrap="truncate-start"` or `wrap="truncate-middle"` get unexpected behavior.

## Solution
Either:
1. Implement the missing modes properly
2. Remove them from the type signature if not planned