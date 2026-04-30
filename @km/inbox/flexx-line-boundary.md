---
id: "@km/inbox/flexx-line-boundary"
aliases:
  - km-flexx-line-boundary
  - "@km/_orphan/flexx-line-boundary"
created_at: 2026-01-31T08:27:57Z
closed_at: 2026-01-31T08:59:04Z
assignee: claude:b8b4780b
---

# [x] Implement line boundary indices @km/_orphan #task #P2 @claude:b8b4780b

# Line Boundary Indices

**Goal:** Eliminate O(N×L) child scanning during flex distribution.

## Problem

Currently `distributeFlexSpaceForLine()` scans ALL children for EACH line.
This causes O(N×L) complexity where N=children, L=lines.

## Solution

Store line start/end indices during `breakIntoLines()`:

```typescript
// Instead of scanning all children per line:
for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
  const start = _lineStarts[lineIdx];
  const end = start + _lineLengths[lineIdx];
  for (let i = start; i < end; i++) {
    const child = _lineChildren[lineIdx][i - start];
    // Process without re-scanning
  }
}
```

## Effort

Low effort, high impact. Affects both classic and zero-alloc algorithms.

## Files

- src/layout.ts (classic)
- src/layout-zero.ts (zero-alloc)