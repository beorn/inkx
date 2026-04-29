---
id: "@km/silvery/theme-multi-target"
aliases:
  - km-silvery.theme-multi-target
  - km-silvery-theme-multi-target
created_by: Bjørn Stabell
created_at: 2026-04-18T07:01:47Z
---

# [ ] Theme multi-target — canvas + web renderers consume the same 20 tokens @km/silvery #feature #P4

blocks:: [[@km/silvery/design-system]]

The 20-token semantic system must hold up for silvery's v2.0 (canvas) and v3.0 (web) render targets. Tokens are target-neutral OKLCH values; renderers translate per-target.

## Rendering per target

### Terminal (v1.0, current)
- truecolor: emit SGR 38;2;R;G;B from token.toHex()
- 256: quantize OKLCH → cube/ramp/ANSI16 deterministically
- ANSI16: nearest-hue slot from probed or default scheme
- monochrome: strip colors, emit attrs from per-token table (see theme-mono)
- NO_COLOR: plain

### Canvas (v2.0)
- ctx.fillStyle = token.toHex() — always truecolor-equivalent
- ctx.font from typography preset (H1 = 'bold 16px ui-monospace', etc.)
- No capability tiers — canvas is always full-color

### Web (v3.0)
- CSS :root { --fg-default: oklch(0.90 0.01 230); ... }
- Browser renders natively via CSS Color 4 oklch() support (~95% modern browsers)
- Fallback: @supports-less-than → toHex()

## Design implications

- Tokens must NOT encode terminal-specific concerns (ANSI16 fallback per token lives in terminal renderer, not token)
- Typography presets must map cleanly: H1 → bold + color token (same across targets)
- SGR attrs (dim/bold/italic/underline/inverse/strike) have CSS + canvas equivalents:
  - bold → font-weight: bold / canvas.font 'bold'
  - italic → font-style / canvas.font 'italic'
  - underline → text-decoration / canvas.drawLine
  - dim → opacity 0.6 / CSS opacity
  - inverse → reversed fg/bg / paint bg rect first
- Gamut map is per-target (sRGB for canvas, sRGB or P3 for web)

## Acceptance

- [ ] @silvery/ag-canvas renderer consumes tokens via ctx.fillStyle + font
- [ ] @silvery/ag-web renderer emits CSS custom properties or inline styles
- [ ] Same theme object produces correct output in all 3 targets
- [ ] Typography presets render consistently cross-target
- [ ] Test matrix: all bundled themes × all 3 targets × representative components

## Blocked

- v2.0 canvas work (@km/silvery/canvas horizon)
- v3.0 web work (@km/silvery/web horizon)

## Related

- Parent: @km/silvery/design-system
- Depends on: @km/silvery/color-oklch (OKLCH throughout)
- Reference: hub/silvery/design/v10-terminal/terminal-color-strategy.md