---
id: "@km/silvery/hvl-test-coverage"
aliases:
  - km-silvery.hvl-test-coverage
  - km-silvery-hvl-test-coverage
created_by: claude:65d845d9
created_at: 2026-03-13T06:46:19Z
closed_at: 2026-03-13T06:54:28Z
close_reason: 42 boundary-condition tests for VirtualList and SelectList added.
  No similar ceil bugs found — VirtualList uses Box overflow=scroll which
  handles clipping differently. Tests cover exact-fit, partial-fit, all-fit,
  overflow indicators, variable heights, gaps.
---

# [x] Add boundary-condition tests for all silvery UI components with math (VirtualList, SelectList) @km/silvery #task #P2 @claude:65d845d9

HVL had zero tests and a ceil/floor bug that caused layout corruption at boundary widths. Prevent this class of bug by adding boundary-condition unit tests for all silvery components that calculate counts, offsets, or positions. Key components: VirtualList, SelectList, HorizontalVirtualList (done). Test the three key boundary states: exact-fit, partial-fit, all-fit. Use parametric test.each across widths spanning boundaries.