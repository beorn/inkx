---
id: "@km/_orphan/2yys"
aliases:
  - km-2yys
created_at: 2026-01-18T00:25:37Z
closed_at: 2026-01-18T22:21:44Z
---

# [x] Storybook View 1 (Cards) missing first line of selected card @km/_orphan #bug #P3

## Bug Description

In the storybook View 1 (Cards), the first line of the first selected card shows "   flow" instead of "▼◐ Implement auth".

## Root Cause Found! (2026-01-18)

**Ink clips from TOP, not bottom, when bordered Box content overflows height constraint.**

### Proof:
```
height=4: Shows "Line 3LINE" - first 2 lines clipped from TOP
height=5: Shows "Line 2, Line 3" - first line clipped from TOP
height=6: Shows all 3 lines correctly (border takes 2 lines + 3 content + header)
```

### The problem in CardsViewDemo:
```tsx
<Box flexDirection="row" width={width} height={height}>  // height=16
  <Box flexDirection="column" width={colWidth}>
    <Text>Header</Text>
    <Box borderStyle="round">                             // Border takes 2 vertical lines
      <TreeNode ... />                                    // Content gets clipped from TOP
    </Box>
  </Box>
</Box>
```

When total content height exceeds the height constraint, Ink's yoga layout clips the FIRST lines of bordered box content rather than the LAST lines.

### Solution options:
1. **Remove height constraint** from the outer row Box (let it grow)
2. **Use `overflowY="hidden"`** on the inner bordered boxes to control clipping
3. **Calculate and set explicit heights** for each bordered box
4. **Use virtualization** (only show cards that fit)

## Action Items

- [x] Identify root cause: Ink clips bordered content from TOP under height constraint
- [ ] Fix storybook CardsViewDemo
- [ ] Document this Ink quirk in docs/dev/ink-patterns.md
- [ ] Consider if production CardColumn.tsx has same issue

## Files Involved

- `apps/km-tui/packages/km-ink/tests/storybook.tsx` - CardsViewDemo has height={height}
- `apps/km-tui/packages/km-ink/src/views/CardColumn.tsx` - production code uses overflowY="hidden"
- `docs/dev/ink-patterns.md` - needs update with this pattern
