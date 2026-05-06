---
mentions:
  - km
id: "@km/silvery/theme-generators"
aliases:
  - km-silvery.theme-generators
  - km-silvery-theme-generators
created_by: Bjørn Stabell
created_at: 2026-04-18T05:37:42Z
closed_at: 2026-04-18T18:27:44Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-generators
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T22:37:43Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.design-system
---

# [x] Theme generators — synthesize themes from partial input (fg/bg, brand color, accents) @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Build valid 22-slot schemes from partial input — brand colors, AI seeds, Tier C fallback.

## API

```ts
generateScheme({ fg, bg })                              // minimum
generateScheme({ fg, bg, primary })                     // with seed
generateScheme({ fg, bg, accents: { red, green, … } })  // explicit overrides
generateScheme({ baseHue, isDark })                     // AI-friendly
```

## Algorithm

- 16 ANSI: base hue wheel, proper S/L for dark/light, AA contrast vs bg
- Semantic slots: formulas (cursorText=bg, selFg=fg, selBg=blend(bg,fg,0.18), cursor=fg)
- Bright variants: brighten 10-15%
- Every output flows through ensureContrast()

## Acceptance

- [ ] 4 input shapes produce valid ColorScheme
- [ ] All outputs pass AA contrast
- [ ] 100 random seeds → 100 valid schemes (property test)
- [ ] scheme-detect Tier C uses this

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system

