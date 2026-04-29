---
id: "@km/flexily/overflow-clip-edges"
aliases:
  - km-flexily.overflow-clip-edges
  - km-flexily-overflow-clip-edges
created_by: Bjørn Stabell
created_at: 2026-04-09T20:12:24Z
closed_at: 2026-04-09T23:36:01Z
owner: bjorn@stabell.org
---

# [x] Flexily overflow clipping rounding differs from Yoga in 3 edge cases @km/flexily #bug #P2

overflowX/Y clipping at fractional positions or with specific padding+border combos rounds slightly differently in flexily vs yoga. 3 Ink 7.0 compat tests fail.

## Fix

Investigate each failing case, decide if flexily's rounding is a bug or intentional. Match Yoga where the difference is not defensible.

## Impact

Closes 3 Ink 7.0 compat failures.

## Parent

@km/silvery/positioning