---
id: "@km/_orphan/inkx-sticky-tall"
aliases:
  - km-inkx-sticky-tall
created_at: 2026-02-02T20:43:11Z
closed_at: 2026-02-04T11:24:02Z
---

# [x] inkx layout-phase: Sticky children taller than viewport misaligned @km/_orphan #bug #P3

## Problem
If childHeight > viewportHeight, the sticky positioning calculation produces negative values:

renderOffset = Math.max(0, Math.min(renderOffset, viewportHeight - childHeight));

When childHeight > viewportHeight, the inner Math.min produces a negative number that gets clamped to 0.

## Impact
Sticky children taller than the viewport always start at 0, hiding overflow.

## Location
vendor/beorn-inkx/src/pipeline/layout-phase.ts lines 303-315