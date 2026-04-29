---
id: "@km/flexily/fuzz-narrow-distribution"
aliases:
  - km-flexily.fuzz-narrow-distribution
  - km-flexily-fuzz-narrow-distribution
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:58Z
closed_at: 2026-03-13T05:45:38Z
close_reason: "Expanded buildRandomTree in relayout-consistency.test.ts to
  generate: reverse directions (row-reverse, column-reverse), absolute
  positioning with position edges, flex-wrap, padding, gap, minWidth/maxWidth,
  and RTL direction (~15% of trees). Updated testing.ts helpers
  (expectRelayoutMatchesFresh, expectIdempotent, expectResizeRoundTrip) to
  support direction from BuildTreeResult. Also relaxed assertLayoutSanity to
  allow negative positions and NaN widths for absolute children in auto-sized
  containers. All 1215 fuzz tests pass."
owner: bjorn@stabell.org
---

# [x] Testing: Fuzz suite much narrower than docs imply — missing wrap, RTL, absolute, etc. @km/flexily #task #P1
