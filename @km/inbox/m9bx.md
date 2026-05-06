---
mentions:
  - km
id: "@km/inbox/m9bx"
aliases:
  - km-m9bx
  - "@km/_orphan/m9bx"
created_at: 2026-01-18T22:27:34Z
closed_at: 2026-01-20T00:58:25Z
---

# [x] Reduce manual size calculations in TUI @km/_orphan #task #P3

## Problem

Board.tsx and view components have extensive manual size calculations:

- Column widths: `Math.floor(availWidthForCols / effectiveMaxCols)`
- Height calculations: `termHeight - 2`, `cardsHeight = height - 2`
- Separator accounting: `availableWidth - separatorCount`
- Scroll indicator widths: `indicatorWidth = (hasLeftIndicator ? 1 : 0) + ....`

This is error-prone and hard to maintain.

## Root Cause

Ink/Yoga doesn't provide computed dimensions to components. See @km/inkz for the long-term solution (two-phase rendering).

## Short-term Mitigations

1. Use `flexGrow={1}` instead of explicit heights where possible
2. Use `flexShrink={0}` on fixed elements (topbar, headers)
3. Add `width` constraints to container Boxes so children don't overflow
4. Add `overflowY="hidden"` to prevent top-clipping

## Fixes Applied (2026-01-18)

- Added `flexShrink={0}` to topbar to prevent clipping
- Added `overflowY="hidden"` to main content area
- Added `width` to ColumnTree cards container

## Related

- @km/inkz - Next-gen renderer that would solve this properly
- @km/_orphan/vzeg - DI approach for component testability
- docs/dev/ink-patterns.md - Documented patterns

