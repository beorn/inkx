---
id: "@km/inkz/11-km-migration"
aliases:
  - km-inkz.11-km-migration
  - km-inkz-11-km-migration
created_at: 2026-01-19T12:02:51Z
closed_at: 2026-01-19T15:04:19Z
---

# [x] Migrate km-ink to InkZ: remove all manual layout calculation @km/inkz #task #P2

## Goal

Migrate @km/_orphan/ink from Ink to InkZ with zero regressions. This is a phased, test-driven migration that validates every step before proceeding.

## Migration Strategy

**Parallel Implementation** -> **Visual Validation** -> **Test Migration** -> **Cutover** -> **Cleanup**

Build InkZ versions alongside Ink versions, validate they're identical, then swap.

## Phases

1. **Parallel Component Implementation** - Create `.inkz.tsx` variants for all views
2. **Storybook Parallel Implementation** - Side-by-side comparison stories
3. **Test Migration** - Unit tests run against both implementations
4. **Manual Validation** - User sign-off checklist
5. **Cutover** - Swap default, update imports
6. **Cleanup** - Delete Ink code, update docs

## Key Files to Migrate

| Ink Component | InkZ Variant | Key Changes |
|---------------|--------------|-------------|
| ColumnsView.tsx | ColumnsView.inkz.tsx | Remove manual width calc, use flexGrow |
| ListView.tsx | ListView.inkz.tsx | Replace ScrollableList with overflow=scroll |
| TreeNode.tsx | TreeNode.inkz.tsx | Remove width prop, use useLayout() |
| DetailPane.tsx | DetailPane.inkz.tsx | Remove height arithmetic |
| HelpOverlay.tsx | HelpOverlay.inkz.tsx | Use useLayout() for centering |

## Files to Delete After Migration

- src/constraints/ - entire directory (ConstraintContext, ScrollableList)
- src/views/tree-node-helpers.ts - estimateTreeNodeHeight() function
- constrainText() and wrapText() from layout utilities
- All width prop types and threading

## Acceptance Criteria

- [ ] All existing tests pass with InkZ
- [ ] Visual output is pixel-identical (or approved differences)
- [ ] No performance regression
- [ ] User has manually approved all views
- [ ] No Ink code remains in codebase
