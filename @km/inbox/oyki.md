---
id: "@km/_orphan/oyki"
aliases:
  - km-oyki
created_at: 2026-01-20T00:27:58Z
closed_at: 2026-01-20T13:08:49Z
---

# [x] Fix display=none hang in inkx render pipeline @km/_orphan #bug #P3

## Problem
The `display='none'` prop causes the inkx render pipeline to hang.

## Reproduction
There's a skipped test in `tests/compat/layout.test.tsx`:
```tsx
// TODO: This test hangs - investigate display="none" in the render pipeline
test.skip('accepts display="none"', () => {
  // ...
});
```

## Required Test (already exists, just unskip)

```tsx
test('accepts display="none"', () => {
  const { lastFrame } = render(
    <Box>
      <Box display="none">
        <Text>Hidden</Text>
      </Box>
      <Text>Visible</Text>
    </Box>
  );
  expect(lastFrame()).not.toContain('Hidden');
  expect(lastFrame()).toContain('Visible');
});
```

## Investigation
The hang likely occurs in:
1. Layout phase (yoga-adapter) when calculating layout for display=none nodes
2. Paint phase when rendering nodes with display=none

## Acceptance Criteria
1. Unskip the test (it will hang/fail)
2. Debug and fix the render pipeline
3. Test passes without hanging
4. All existing tests still pass