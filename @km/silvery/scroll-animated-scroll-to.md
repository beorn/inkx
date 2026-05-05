---
aliases:
  - km-silvery.scroll-animated-scroll-to
  - km-silvery-scroll-animated-scroll-to
created_at: 2026-05-05T19:24:36.642Z
---

# [x] Animated scrollTo — programmatic smooth scroll with easing #feature #P2

closed:: 2026-05-05
closed_by:: silvery 0148a14d (km c4c2f25d6)

Shipped on silvery main 0148a14d. animateToFloat (cubic ease-out, default 250ms) added to useKineticScroll; scrollBehavior='instant'|'smooth' prop on ListView wires scrollBy/scrollToTop/scrollToBottom through smooth animation. scrollToItem stays instant for v1 (virtualizer index→row path). 4 regression tests in tests/features/use-kinetic-scroll-quality.test.tsx.

---

Currently scrollTo (number prop on ListView, setScrollOffset method on useKineticScroll) jumps instantly. Best-in-class libraries ease over ~250ms with the same exponential decay curve as kinetic scroll. Affects programmatic 'go to bottom', anchor jumps, search-result navigation, cursor follow.

API: add scrollBehavior?: 'instant' | 'smooth' prop to ListView (default 'instant' for backward compat). Internally, useKineticScroll exposes animateToFloat(target, durationMs?) that runs an interval-driven animation using cubic ease-out. User wheel input cancels the animation (via existing stopKinetic).

Acceptance:
- new prop scrollBehavior on ListView (default 'instant')
- new method on useKineticScroll: animateToFloat
- changing scrollTo with scrollBehavior='smooth' animates over ~250ms cubic ease-out
- user wheel input during animation cancels and resumes manual control
- test: animation reaches target within duration, can be cancelled mid-flight
