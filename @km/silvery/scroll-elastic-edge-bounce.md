---
aliases:
  - km-silvery.scroll-elastic-edge-bounce
  - km-silvery-scroll-elastic-edge-bounce
created_at: 2026-05-05T19:24:53.015Z
---

# [x] Elastic edge bounce — rubber-band overscroll with spring physics #feature #P2

closed:: 2026-05-05
closed_by:: silvery 0148a14d (km c4c2f25d6)

Shipped on silvery main 0148a14d. enableElasticEdges added to UseKineticScrollOptions and ListView. Wheel past edge applies iOS-style resistance (1 + overshoot · 0.5), capped at ELASTIC_BUDGET_ROWS=3. On release, ease-out spring-back over 200ms via the unified ease-anim infrastructure (shared with animateToFloat). Rendered scrollOffset render-clamps; only the float overshoots — invisible at row resolution in the terminal but real for the physics layer (and for canvas/web targets). 4 regression tests covering overshoot, default-off behavior, spring-back landing, and rendered-offset clamp.

---

Currently when wheel/momentum hits top/bottom edge, scrollFloat clamps to bounds and momentum is killed (return false from momentumStep). iOS UIScrollView and Lenis instead let position go past bounds with diminishing-return resistance, then spring back when input releases.

For terminal target the visual effect is limited (Box overflow=scroll clamps integer offset), but the physics layer matters: hitting an edge with momentum should not feel like hitting a wall. The velocity gets absorbed by spring force and decays naturally. Mostly invisible in terminal but real in canvas/web target.

API: add enableElasticEdges?: boolean to UseKineticScrollOptions (default false initially). When true:
- Wheel past edge applies displacement with resistance: appliedRows = sampleDir * stepRows / (1 + |overshoot| * 0.5)
- scrollFloat allowed to go below 0 / above maxScroll up to ELASTIC_BUDGET (~3 rows)
- On wheel release, instead of stopping at clamped bound, spring-decay back to bound (critical-damped, ~150ms)
- Existing onEdgeReached fires once when overshoot starts (gives terminal a visual cue)

Acceptance:
- enableElasticEdges option exposed
- wheel-past-top causes scrollFloat to dip below 0 with resistance
- spring animation pulls back to 0 within ~200ms
- existing onEdgeReached still fires once per edge contact
- existing tests still pass with default (disabled)
- new test verifies overshoot + bounce-back
