---
id: "@km/silvery/sterling-borders-adaptive"
aliases:
  - km-silvery.sterling-borders-adaptive
  - km-silvery-sterling-borders-adaptive
created_by: claude:4274df30
created_at: 2026-04-20T18:39:13Z
closed_at: 2026-04-25T07:04:15Z
close_reason: "Fixed in silvery c0072dae: ensureContrast pass added for
  border-default (3:1) and border-muted (1.5:1). 0/84 → 84/84 catalog pass-rate.
  theme-contrast.test.ts strict mode restored."
---

# [x] Sterling: border-default/muted derivation needs contrast lift @km/silvery #bug #P2 @claude:22c2717d

blocks:: [[@km/all/sterling]], [[@km/silvery/sterling-2e-interior-migration]]

Surfaced 2026-04-20 by Sterling 2e Phase A audit (commit cc33ef9e in vendor/silvery).

## Problem

Sterling's border-default and border-muted derivation uses fixed blend ratios (0.18 / 0.10 against bg) WITHOUT ensureContrast lift. Result: 84/84 catalog palettes fall below WCAG CONTROL (3:1) on border-default and below FAINT (1.5:1) on border-muted.

Legacy deriveTruecolorTheme ran ensureContrast on borders — Sterling's derive.ts skipped this step.

## Fix

In packages/theme/src/sterling/derive.ts, add ensureContrast pass for border-default and border-muted (same approach as the auto-lift used for fg/bg pairs).

## Acceptance

- All 84 catalog palettes pass WCAG CONTROL (3:1) on border-default
- All 84 catalog palettes pass FAINT (1.5:1) on border-muted
- theme-contrast.test.ts assertions return to strict mode (currently loosened)
- Sterling 219 tests still green

Parent: @km/silvery/theme-v4