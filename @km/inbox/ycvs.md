---
id: "@km/inbox/ycvs"
aliases:
  - km-ycvs
  - "@km/_orphan/ycvs"
created_at: 2026-01-19T10:09:08Z
closed_at: 2026-01-19T11:09:08Z
---

# [x] DRY overflow indicators - inconsistent styling across views @km/_orphan #task #P3

## Problem
Overflow indicators look different across views (cards, columns, list, tabs). They should be consolidated into a single consistent component.

## Current State
- Each view implements its own overflow indicator styling
- Inconsistent appearance and behavior

## Implementation Guidance

### Check Current Implementations
Review how each view renders overflow indicators:

Key files to review:
- `apps/km-tui/packages/km-ink/src/views/OverflowIndicator.tsx` - shared component
- `apps/km-tui/packages/km-ink/src/views/CardColumn.tsx` - uses OverflowIndicator
- `apps/km-tui/packages/km-ink/src/views/ColumnsView.tsx` - inline Text components
- `apps/km-tui/packages/km-ink/src/views/ListView.tsx` - uses OverflowIndicator
- `apps/km-tui/packages/km-ink/src/constraints/ScrollableList.tsx` - DefaultOverflow

### Questions to Answer
1. Is OverflowIndicator being used consistently across all views?
2. Are some views using inline Text instead of the component?
3. Does ScrollableList's DefaultOverflow match OverflowIndicator styling?
4. What props/variants does OverflowIndicator support?

### Consolidation Plan
1. Audit all overflow indicator usage
2. Ensure OverflowIndicator component handles all needed variants
3. Replace inline implementations with OverflowIndicator
4. Verify consistent styling (arrow, count, colors, alignment)

## Visual Acceptance Test
```bash
# Capture all 4 views and compare overflow indicator appearance
# All should show identical styling for "▲ N above" and "▼ N below"
ttyd -W -p 7681 bun km view -r /tmp/tst-repo @next.md &
sleep 5

# Capture cards view (default)
bun x playwright screenshot http://localhost:7681 /tmp/overflow-cards.png

# Navigate to columns (v), capture
# Navigate to list (v), capture  
# Navigate to tabs (v), capture

# Compare all screenshots - indicators should look identical
```

## Acceptance Criteria
1. Single OverflowIndicator component used by all views
2. Consistent styling (arrow direction, count display, colors)
3. Visual verification via headless screenshot showing consistency