---
id: "@km/silvery/sterling-surface-adaptive"
aliases:
  - km-silvery.sterling-surface-adaptive
  - km-silvery-sterling-surface-adaptive
created_by: claude:4274df30
created_at: 2026-04-20T18:39:28Z
closed_at: 2026-04-25T07:04:17Z
close_reason: "Fixed in silvery c0072dae: surface ramp lift mirrors legacy fg
  lift (ensureContrast against blend(bg, fg, 0.08)). 81/84 → 84/84 on
  fg/bg-surface-overlay AND fg/bg-surface-hover. inline.ts now overwrites
  bg-surface-hover (preventing legacy stop-gap leak)."
---

# [x] Sterling: bg-surface-overlay near-misses AA on light schemes @km/silvery #bug #P4 @claude:22c2717d

blocks:: [[@km/all/sterling]]

Surfaced 2026-04-20 by Sterling 2e Phase A audit (commit cc33ef9e in vendor/silvery).

## Problem

bg-surface-overlay (blend at 0.12 against bg) near-misses AA on 3 light schemes: tokyo-night-day, everforest-light, material-light. Threshold loosened by 0.25 in tests as workaround.

## Fix

Run ensureContrast on bg-surface-overlay against fg-default. Same approach as the bg-fill auto-lift.

## Acceptance

- All 84 schemes pass strict AA on bg-surface-overlay
- Test threshold tightened back from 0.25 loosening to strict

Parent: @km/silvery/theme-v4