---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-render-strategy"
aliases:
  - km-silvery.sterling-render-strategy
  - km-silvery-sterling-render-strategy
created_by: claude:4274df30
created_at: 2026-04-19T23:17:47Z
started_at: 2026-04-25T07:14:19Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.sterling-render-strategy
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:12:59Z
    created_by: claude:5e447b66
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-all.sterling
      - type: link
        target: "@km/silvery/sterling"
---

# [ ] Sterling: pluggable RenderStrategy (output-side composability) @km/silvery #feature #P3 @claude:22c2717d

blocks:: [[@km/silvery/sterling]]

Post-plateau feature to complete Sterling's 'everything swappable' promise. Right now DesignSystem (input) is pluggable; RenderStrategy (output quantization) is not.

## Motivation

Surfaced 2026-04-19 by the Sterling Storybook MVP tier-toggle limitation: quantization is hardcoded in the output phase, so changing tier doesn't visibly do anything. More broadly: an app that wants contrast-preserving quantization, OSC-palette-queried rendering, dithered gradients, or brand-preserving tokens has no extension point.

## Shape

Three pluggable layers at the input-output pipeline; the middle layer (Theme) stays target-neutral:

```
input → DesignSystem → Theme → RenderStrategy → pixels
```

## RenderStrategy interface

```ts
interface RenderStrategy {
  readonly name: string
  selectTier(caps: TerminalCaps, override?: Tier): Tier
  quantize(hex: string, tier: Tier): { hex: string; attrs?: SGRAttrs }
}
```

## Strategies to ship

- preservative (default) — OKLCH-nearest, current behavior preserved
- rgbNearest — fast/cheap, legacy-compatible
- contrastPreserving — minimize fg/bg contrast-ratio delta before hue delta
- oscPalette — query terminal's actual palette via OSC 4, quantize to user's real colors
- monoAttribute — map hue → SGR attrs instead of colors (for mono tier)

## Deliberately NOT in scope: TokenResolver / fallback chains

Original bead description proposed a TokenResolver layer for cross-design-system Theme fallbacks. REMOVED 2026-04-19 per explicit decision.

Rationale: silvery/ui is built for Sterling. A Theme missing $fg-accent throws an error. Cross-design-system use (e.g. silvery/ui with @silvery/design-material) requires an explicit adapter written by the consumer — e.g. materialToSterling(materialTheme) returning a Sterling-shaped Theme. The coupling stays visible, errors are loud, no runtime fallback cost.

This aligns with D6 (clean breaks, no compat shims) and Sterling's philosophy that integration problems should surface at mount time, not as subtly-wrong colors in production.

## Scope

3-4 sessions (down from 3-5):

1. Interface + default strategies in new @silvery/render subpath of @silvery/ansi
2. Output-phase refactor to consume strategy (touches pipeline — silvery agent)
3. run({ render }) option + default wiring
4. Storybook gets second toggle: strategy selector alongside tier
5. 2-3 worked examples (contrastPreserving, oscPalette, monoAttribute)

## Dependencies

- BLOCKED on: Sterling plateau complete (2a-2d + storybook + package rename + public docs + design-material reference). All gated on 2d release.
- BLOCKS: nothing on the critical path

## Not in scope

- TokenResolver / Theme fallback chains (silvery/ui fails loud on missing tokens; consumers write adapters)
- Changing the default behavior (preservative stays default, same math as today)
- Breaking the current output-phase API consumers
- Shipping this before Sterling 0.19.0 plateau

