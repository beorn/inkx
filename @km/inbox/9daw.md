---
id: "@km/inbox/9daw"
aliases:
  - km-9daw
  - "@km/_orphan/9daw"
created_at: 2026-01-19T15:23:01Z
closed_at: 2026-01-19T23:20:09Z
---

# [x] Add tests for km-tree display utilities @km/_orphan #task #P3

## Problem

8 public functions in `packages/km-tree/src/display.ts` have no tests:

- `getNodeDisplayName()` - Get display name for a node
- `getTypeIndicator()` - Get icon/indicator for node type
- `normalizeName()` - Normalize names for comparison
- `namesAreSimilar()` - Check if two names are similar
- `getCollapsedTypeSuffix()` - Get suffix for collapsed type display
- `collapseRedundantAncestors()` - Collapse redundant ancestor paths
- `collapseAncestorsWithTypes()` - Collapse with type annotations
- `getParentContext()` - Get parent context for display

### Impact

Display bugs won't be caught by tests. These functions are used throughout CLI and TUI.

### Fix

Create `packages/km-tree/tests/display.test.ts` with unit tests for each function.