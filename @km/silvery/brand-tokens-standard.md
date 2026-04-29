---
id: "@km/silvery/brand-tokens-standard"
aliases:
  - km-silvery.brand-tokens-standard
  - km-silvery-brand-tokens-standard
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:09Z
closed_at: 2026-04-18T18:27:07Z
close_reason: "Shipped in v0.18.0: Theme.brand/brandHover/brandActive (app
  identity) + categorical ring (red/orange/yellow/green/teal/blue/purple/pink).
  Auto-derived from scheme via OKLCH; apps override via tokens prop. ANSI 16
  maps to named slots. Resolver kebab-case→camelCase aliases for $brand-hover
  etc. Renamed from $brand-<hue> → $<hue> for ergonomics; old names kept as
  @deprecated aliases."
---

# [x] Standard brand tokens (Apple system-color model) @km/silvery #task #P3

blocks:: [[@km/silvery/theme-system-v2]]

Ship brand tokens as part of every theme, auto-derived from scheme, overridable by apps. Apple system-color model applied to terminals.\n\nStandard set:\n- $brand (primary identity anchor)\n- $brand-hover, $brand-active (+0.04L / +0.08L OKLCH)\n- $brand-red, -orange, -yellow, -green, -teal, -blue, -purple, -pink (auxiliary category accents, NOT states)\n\nAuto-derivation (when app doesn't override):\n- $brand → existing brand cascade (scheme.primary → probed cursor → most-chromatic cool slot → fallback)\n- $brand-<hue> → scheme's accent ring via ensureContrast\n\nApp override:\n  <ThemeProvider tokens={{ brand: '#5B8DEF' }}>  // auxiliary ring still auto-derives\n  <ThemeProvider tokens={{ brand: '#5B8DEF', 'brand-red': '#E57373' }}>  // full pin\n\nDepends on: tokens-prop-provider\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p3