---
id: "@km/silvery/state-variants"
aliases:
  - km-silvery.state-variants
  - km-silvery-state-variants
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:11Z
closed_at: 2026-04-18T19:18:55Z
close_reason: Shipped at silvery 7312271a + km bump 8cf5e86a5. 8 new state
  tokens (primaryHover/Active, accentHover/Active, fgHover/Active,
  bgSelectedHover, bgSurfaceHover) derived ±0.04L/±0.08L OKLCH. PRIMER_ALIASES
  routes $primary-hover→primaryHover. 23 tests pass.
---

# [x] $primary-hover/-active + family — state variants as tokens @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/theme-system-v2]]

Ship state-variant tokens as standard, derived from their base at ±0.04L (hover) and ±0.08L (active) in OKLCH.\n\nCoverage:\n- $primary-hover, $primary-active\n- $accent-hover, $accent-active\n- $brand-hover, $brand-active (covered by brand-tokens-standard)\n- $fg-hover (rare, mostly for links)\n- $bg-selected-hover, $bg-surface-hover (for interactive surfaces)\n\nSilvery's Kitty mouse + useModifierKeys already tracks hover state. This bead just adds the token names + derivation.\n\nDepends on: token-rename-primer (needs final names)\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p7