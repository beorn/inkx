---
id: "@km/silvery/color-oklch"
aliases:
  - km-silvery.color-oklch
  - km-silvery-color-oklch
created_by: Bjørn Stabell
created_at: 2026-04-18T06:26:28Z
closed_at: 2026-04-18T07:40:21Z
close_reason: OKLCH migration complete — all in-scope acceptance criteria
  verified. Generators.ts HSL migration intentionally deferred to
  km-silvery.theme-generators (called out in that bead).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.color-oklch
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T23:26:41Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Migrate @silvery/color to OKLCH-native — blend, lighten, complement, contrast in perceptually-uniform space @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/design-system]]

## Why

`@silvery/color` today does math in RGB (blend, brighten, darken) and HSL (via hexToHsl). RGB blending produces muddy midpoints; HSL's L is perceptually non-linear (50% lightness yellow looks brighter than 50% lightness blue).

**OKLCH** (CSS Color Module 4) is the modern standard — perceptually uniform, designer-friendly, adopted by Tailwind v4, Radix Colors, DaisyUI. Migrate all silvery color math to OKLCH-native; sRGB hex becomes serialization-only.

## Scope

All color operations move to OKLCH:

- `blend(a, b, t)` — interpolate in OKLCH space
- `brighten(color, amount)` — increase OKLCH L
- `darken(color, amount)` — decrease OKLCH L
- `complement(color)` — rotate hue 180°, preserve L + C
- `ensureContrast(fg, bg, target)` — OKLCH L delta (or APCA) instead of WCAG 2.1 relative luminance
- `contrastFg(surface)` — OKLCH-based pick between near-black and near-white
- Scheme generators (@km/silvery/theme-generators) use OKLCH for the hue wheel, saturation/lightness tuning
- Tier C formulas (@km/silvery/theme-auto-detect) expressed in OKLCH
- 256-color quantization picks nearest in OKLCH, not RGB

## Tools

Option A: Write OKLCH conversion + primitives in @silvery/color
Option B: Depend on culori (or similar) — mature library, small footprint
→ Pick B for first version; inline the conversion math if culori's surface is too big

Conversion chain: sRGB hex ↔ linear RGB ↔ OKLab ↔ OKLCH (polar form of OKLab)

## API shape

```ts
// Primitives
oklch(hex: string): { L: number; C: number; H: number }
toHex(lch: { L, C, H }): string

// Operations (hex in, hex out — internals are OKLCH)
blend(a: string, b: string, t: number): string
brighten(hex: string, amount: number): string  // L += amount
darken(hex: string, amount: number): string    // L -= amount
complement(hex: string): string                 // H += 180°
saturate(hex: string, amount: number): string   // C += amount
ensureContrast(fg: string, bg: string, minDelta: number): string  // widens L delta
```

Callers don't need to know about OKLCH — they still pass/receive hex. Internal representation is OKLCH.

## Migration plan

1. Add OKLCH conversion primitives to @silvery/color
2. Rewrite blend/brighten/darken/complement to operate in OKLCH
3. Migrate hexToHsl callers to OKLCH equivalents
4. Update derivation (@silvery/ansi/theme/derive.ts) to use OKLCH operations
5. Verify all theme outputs visually identical or better (spot-check across 20 palettes)
6. Update docs: hub/silvery/design/v10-terminal/terminal-color-strategy.md, silvery styling guide

## Acceptance

- [ ] @silvery/color exports oklch() + toHex() primitives
- [ ] blend/brighten/darken/complement/saturate use OKLCH internally
- [ ] ensureContrast uses OKLCH L delta (or APCA option)
- [ ] Scheme generators (bead: scheme-generators) use OKLCH
- [ ] Snapshot tests verify derivation outputs look correct across bundled schemes
- [ ] hexToHsl / brighten-by-RGB callers migrated
- [ ] CLAUDE.md + styling guide updated with 'color math uses OKLCH' note
- [ ] Documented in hub/silvery/design/v10-terminal/terminal-color-strategy.md (done)

## Related

- Parent: @km/silvery/design-system
- Consumed by: scheme-generators, scheme-detect (Tier C), theme-custom (derive callbacks), theme-mono
- Reference: hub/silvery/design/v10-terminal/terminal-color-strategy.md
- Code: vendor/silvery/packages/color/src/color.ts (current RGB/HSL impl)
- Prior art: culori (JS OKLCH lib), Tailwind v4, Radix Colors
