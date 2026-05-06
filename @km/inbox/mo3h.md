---
mentions:
  - km
id: "@km/inbox/mo3h"
aliases:
  - km-mo3h
  - "@km/_orphan/mo3h"
created_at: 2026-01-15T16:34:41Z
closed_at: 2026-01-16T07:54:55Z
---

# [x] TUI: Implement render-time visual column navigation @km/_orphan #feature #P3

## Summary

Improve cross-column navigation to use render-time visual height measurement instead of estimated heights.

**Note:** Package names in this bead reference pre-refactoring structure. After @km/_orphan/hv4n (architecture refactoring) completes:

- `km-tui-opentui/src/App.tsx` → `km-tui/src/app/App.tsx`
- `km-tui-opentui/src/components/Card.tsx` → `km-tui/src/components/Card.tsx`

## Current State (After Refactor)

Cross-column navigation logic is in App.tsx using `calculateCrossColumnPath()` function.
This computes Y-position based on card heights estimated from metadata:

- Cards with metadata (priority, dueDate, hasBacklinks) = 4 lines
- Cards without metadata = 3 lines

Navigation now uses structural actions only:

- NAV_PREV_SIBLING, NAV_NEXT_SIBLING (j/k)
- NAV_FIRST_SIBLING, NAV_LAST_SIBLING (g/G)
- NAV_PARENT, NAV_CHILD (h/l at column level, u, Enter, Backspace)
- NAV_TO_PATH (computed cross-column paths from App.tsx)

## Remaining Work

The height estimation is fragile because:

1. Future card content may span multiple lines
2. Actual rendered height may differ from estimates

To improve this:

1. Cards report their actual rendered height to a registry (via refs/context)
2. calculateCrossColumnPath() looks up heights from registry
3. Heights computed lazily when cross-column navigation occurs

## Files to modify (after refactoring)

- packages/@km/tui/src/app/App.tsx - Add height registry, update calculateCrossColumnPath
- packages/@km/tui/src/components/Card.tsx - Report height after render

