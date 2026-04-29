---
id: "@km/_orphan/2sly"
aliases:
  - km-2sly
created_at: 2026-01-20T10:30:27Z
closed_at: 2026-01-20T11:52:12Z
---

# [x] Audit manual dimension calculations in inkx views @km/_orphan #task #P2

## Request
User asked: "why does the layout use termHeight-2 - why doesn't it use built-in flex? everywhere we do manual size/dimension adjustments we're potentially shooting ourselves in the foot. can you identify all of these places and critique whether we should do it this way or we should switch to an auto layout approach?"

## Problem
Throughout the inkx view code, there are many manual dimension calculations:
- `height={termHeight - 2}` for content area (subtracting top/bottom bar)
- `height={termHeight - 3}` for scroll indicators
- `height={height - 2}` in Column for content area (subtracting header)
- `contentHeight = Math.max(1, height - 2)` in CardColumn

These manual calculations are fragile because:
1. They assume fixed sizes for elements (top bar = 1, bottom bar = 1)
2. They don't account for actual rendered sizes
3. They create tight coupling between parent and child sizes
4. Changes to one area can break calculations elsewhere

## Better Approach
Flexbox should handle this automatically:
- Top bar: `flexShrink={0}` with no explicit height (auto-size to content)
- Content area: `flexGrow={1}` to fill remaining space
- Bottom bar: `flexShrink={0}` with no explicit height

## Action Items
1. Identify all manual dimension calculations in views:
   - Board.tsx
   - CardColumn.tsx
   - ColumnsView.tsx
   - ListView.tsx
   - TabsView.tsx
   - TreeNode.tsx
2. For each, determine if it can be replaced with flexbox auto-layout
3. Test that auto-layout works correctly with inkx/Yoga
4. Document cases where manual sizing is truly necessary

## Related
- @km/_orphan/jrbl: Bottom bar bleeding (likely caused by dimension calculations)
- @km/_orphan/pii3: Layout jumping