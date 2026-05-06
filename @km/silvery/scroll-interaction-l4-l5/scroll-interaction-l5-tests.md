---
aliases:
  - km-silvery.scroll-interaction-l5-tests
  - km-silvery-scroll-interaction-l5-tests
created_at: 2026-05-06T00:23:10.786Z
_stub: true
---

related:: [[@km/silvery/scroll-interaction-l4-l5]]

## Problem

The same scroll class has regressed several ways: stale thumb pixels, pointer
capture outside the terminal, follow=end interactions, row-space ListView
scrolling, Storybook preview measurement, and drag geometry drift.

The L5 target needs tests that preserve the invariant across composition
rather than one smoke test per component prop.

### Acceptance Criteria

- [ ] Existing regression tests are consolidated into domain files:
      scrollbar, ListView scroll, Storybook preview, pointer dispatch.
- [ ] Add geometry-changing active-drag cases:
      max grows, max shrinks, viewport grows, viewport shrinks.
- [ ] Add property-style tests for scrollbar mapping:
      offset 0 -> top, offset max -> bottom, pointer grab fraction preserved.
- [ ] Add Storybook PreviewHost integration tests after `ScrollArea` lands.
- [ ] Run with `SILVERY_STRICT=1`; no incremental/fresh mismatches.

Added regressions in existing scrollbar/ListView/Storybook suites: outside-terminal hover cleanup, active drag max grow/shrink, stale thumb clearing, ScrollArea measured wheel scrolling, Storybook preview wheel scrolling, ListView thumb-to-bottom.
