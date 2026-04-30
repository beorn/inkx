---
id: "@km/inbox/1796-flexx-fix-marginx-marginy-calculation"
aliases:
  - km-1796
  - "@km/_orphan/1796"
  - "@km/_orphan/1796-flexx-fix-marginx-marginy-calculation"
created_at: 2026-01-20T13:22:48Z
closed_at: 2026-01-20T14:01:15Z
---

# [x] Flexx: Fix marginX/marginY calculation @km/_orphan #bug #P2

## Problem
Flexx calculates marginX and marginY differently than Yoga.

## Expected Behavior
marginX should apply equal left/right margins, marginY should apply equal top/bottom margins.

## Reproduction (from layout-equivalence.test.tsx)
```tsx
<Box width={30} height={8}>
  <Box marginX={2} marginY={1}>
    <Text>Centered</Text>
  </Box>
</Box>
```

## Impact
- marginX and marginY test fails

## Investigation Points
- Check margin handling in `layoutNode()`
- Verify resolveSpacing() handles X/Y shorthand correctly
- Compare with Yoga's margin resolution

## Verification
Run: `bun test tests/layout-equivalence.test.tsx -t "marginX"`
After fix, unskip and verify the test passes.