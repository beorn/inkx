---
mentions:
  - km
id: "@km/flexily/no-reentrancy-guard"
aliases:
  - km-flexily.no-reentrancy-guard
  - km-flexily-no-reentrancy-guard
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:18Z
closed_at: 2026-03-13T05:43:03Z
close_reason: "Won't fix: Not a bug. The architecture doc explicitly states 'Not
  reentrant. Layout is single-threaded.' This is a conscious trade-off for
  zero-allocation performance. Adding a reentrancy guard would add overhead to
  every calculateLayout call for a scenario that should not occur in correct
  usage. The shared pre-allocated arrays (Float64Array, traversalStack) are
  documented as non-reentrant. A measure callback calling calculateLayout on a
  separate tree already works correctly in practice (tested)."
owner: bjorn@stabell.org
---

# [x] Bug: No reentrancy guard despite shared module-level mutable state @km/flexily #bug #P1

