---
id: "@km/silvery/storybook-polish"
aliases:
  - km-silvery.storybook-polish
  - km-silvery-storybook-polish
created_by: Bjørn Stabell
created_at: 2026-04-19T06:14:42Z
---

# [/] Storybook polish: fullscreen palette gallery + tier preview + OKLCH triplet @km/silvery #task #P3 @claude:22c2717d

blocks:: [[@km/silvery/sterling-storybook]]

Three small enhancements to the Sterling Storybook surfaced during the
consolidation review (Pro+Kimi 2026-04-25):

## Acceptance

- [ ] Fullscreen palette gallery (mode toggle, e.g. \`p\` keybinding) —
      maximize SchemeList to fullscreen, one row per palette showing
      bg-surface-default / bg-accent / fg-default / border-default.
      Useful for "QA across 84 schemes at a glance".

- [ ] Tier-preview sub-mode in TierBar — show actual rendered samples
      at each tier (truecolor / 256 / ansi16 / mono), not just the toggle.
      Helpful for inspecting where tokens collapse under quantization.

- [ ] OKLCH triplet display in DerivationPanel — when a token is selected,
      show \`L: x.xx, C: x.xx, H: xxx° → +δ → L: x.xx\`. ~15 LOC if trace
      data already includes OKLCH info.

## Why deferred

The base storybook (built post-Sterling) covers the canonical use cases
already. These three are positive-surprise enhancements — adding depth
for power users without blocking shipping.