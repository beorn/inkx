---
id: "@km/silvery/sterling-derivation-adaptive"
aliases:
  - km-silvery.sterling-derivation-adaptive
  - km-silvery-sterling-derivation-adaptive
created_by: claude:4274df30
created_at: 2026-04-20T03:17:50Z
closed_at: 2026-04-20T03:35:51Z
close_reason: "Shipped in vendor/silvery commit dce80b83. Adaptive L-shift
  (direction follows token's own luminance) + chroma-preservation at L extremes.
  All 84 catalog schemes still pass WCAG AA strict; 5 new adaptive-shift
  regression tests in sterling/roles.test.ts. Catppuccin Frappe regression
  fixed: accent/warning hover-active no longer collapse to #FFFFFF. Paired with
  km-silvery.sterling-prune-state-variants (bfc017a5). sterling-2d-release
  forward-blocks are for the 0.19.0 release cut — this bead was a prerequisite,
  unblocking it is correct."
---

# [x] Sterling: adaptive OKLCH state-variant derivation (no white-out) @km/silvery #feature #P2 @claude:4274df30

blocks:: [[@km/silvery/sterling-2d-release]], [[@km/silvery/theme-v4]]

Sterling's current hover/active derivation uses naive OKLCH ±0.04L / ±0.08L shifts. At high base-L (yellows, light blues, Catppuccin's #8F97FF), shifting up collapses the color to #FFFFFF, losing all hue. Observed 2026-04-19 with Catppuccin Frappe where accent.hover.fg = active.fg = #FFFFFF.

## Root cause

`hover.fg = OKLCH(baseL + 0.04, baseC, baseH)`. When baseL is already ≥0.7, pushing up saturates toward white. Chroma can't survive at L>0.9 in most hues.

## Fix

**Adaptive L-shift** — determine shift direction per token's own luminance, not scheme.dark:

```
if baseL > 0.6:   shift DOWN  (darken for hover, darker for active)
else:             shift UP    (brighten for hover, brighter for active)
```

Plus **chroma-preservation fallback** — if target L would push past 0.9 or below 0.1, reduce chroma proportionally so the color goes toward gray, not white/black.

## Alternatives considered

- **Chroma-first** (desaturate for hover): clear but muted look
- **Contrast-delta** (shift until ΔCR = 0.3): most robust; harder to compute, needs bg context per token
- **HCT tone ramp** (Material-style discrete tones): most perceptually correct; requires per-hue chroma ceiling tables — overkill for v1

Picked **adaptive L-shift + chroma fallback** — simplest algorithmic fix that removes the white-out bug while staying close to the current model.

## Acceptance

- Catppuccin Frappe accent.hover.fg is a distinguishable blue, NOT #FFFFFF
- Warning/yellow tokens' hover shifts stay in yellow family, NOT #FFFFFF
- All 84 catalog schemes: for every token with state variants, the variants are visually distinguishable from base (ΔE00 > some threshold) and from each other
- WCAG contrast with bg still passes (catalog gate, same as current sterling-2a)
- Storybook's token tree shows distinct colors for hover.fg / active.fg columns

## Scope

~40 LOC change in sterling/derive.ts + contrast.ts. New tests in sterling/derive.test.ts targeting the white-out case. ~1 session.

## Depends on / blocks

- **Depends on**: sterling-2d (breaking change — bundle into 0.19.0)
- **Blocks**: sterling-storybook-full (the contrast audit panel is meaningful only when variants differ)
- **Relates to**: sterling-prune-state-variants (some hover/active tokens shouldn't exist at all)

Parent: @km/silvery/theme-v4