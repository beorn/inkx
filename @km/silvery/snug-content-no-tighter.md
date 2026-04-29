---
id: "@km/silvery/snug-content-no-tighter"
aliases:
  - km-silvery.snug-content-no-tighter
  - km-silvery-snug-content-no-tighter
created_by: Bjørn Stabell
created_at: 2026-04-12T04:28:50Z
closed_at: 2026-04-12T07:41:31Z
close_reason: Resolved by the maxWidth-aware measurement fix (silvery 770436af)
  and the correction pass (silvery 492bea71 + 6288bc25). 4 regression tests now
  pass. Remaining plain-Box overflow tracked under km-silvery.fit-content-clamp.
---

# [x] snug-content integration produces same width as fit-content at render time @km/silvery #bug #P2

blocks:: [[@km/silvery]], [[@km/silvery/fit-content-clamp]]

The snug-content binary search (shrinkwrapWidth() in pretext.ts) has passing unit tests, but at the rendering integration level <Box width="snug-content"> produces the same boundingBox width as <Box width="fit-content">.

Probably downstream of @km/silvery/fit-content-clamp — if the upper-bound fit-content width is wrong (unclamped to parent), the binary search operates in the wrong range. May resolve automatically when fit-content clamp is fixed.

Regression tests (test.fails): vendor/silvery/tests/features/pretext-layout.test.tsx
- "identical text renders narrower under snug+even than fit+greedy"
- "snug-content alone is no wider than fit-content for the same text"

Block on: @km/silvery/fit-content-clamp (test again after that fix).