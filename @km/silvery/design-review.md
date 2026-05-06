---
mentions:
  - km
id: "@km/silvery/design-review"
aliases:
  - km-silvery.design-review
  - km-silvery-design-review
created_by: Bjørn Stabell
created_at: 2026-04-16T19:40:05Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.design-review
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-16T12:40:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] Design review with Mike — tokens, components, contrast settings, 'bun design' workbench @km/silvery #feature #P2

blocks:: [[@km/silvery]]

Bring Mike Welch in to review and level up silvery's design system. Deliverable: a design system that drives silvery.dev and the coding-assistant showcase, visually competitive with opencode.

## Why this bead exists

Silvery has a 22-color ColorPalette (ANSI 16 + fg/bg/cursor/selection + primary/dim variants) and a 33-token Theme. Today deriveTheme() transforms one into the other with hardcoded constants (AA=4.5, DIM=3.0, blend percentages like 5%/8%/15%). It works, but:

- The rationale is implicit — no designer-readable doc explains why primary = blend(...) or why surfacebg = blend(bg, fg, 5%).
- The formula isn't parameterized — changing contrast means editing code.
- **Stage 1 is missing.** How we GET to the 22-color palette (inherit? brand-override? fully hardcoded?) isn't modeled — it's just "whatever the caller passes in."

Components ARE using tokens (not raw palette), which is right. The gap is in explaining, parameterizing, and staging the derivation.

## The two-stage model

```
[spec]  →  [Stage 1: palette completion]  →  ANSI 22 palette  →  [Stage 2: token derivation]  →  33 design tokens  →  components
 input        (fill in missing slots)         (22 colors)          (blend/ensure/complement)      (universal output)    (consume tokens)
```

Each stage has its own formula, its own rationale, and its own configurability.

## Stage 1 — Palette completion (spec → ANSI 22)

The input is a **partial or full ColorPalette spec**. The output is always a complete 22-color ANSI 22 palette. How we get from one to the other depends on the spec mode.

| Mode                 | Input                | Formula                                                                   | Rationale                                                                                                 |
| -------------------- | -------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| inherit-all          | {}                   | detectTheme()                                                             | No opinion. Be the user's terminal. km today.                                                             |
| brand + inherit      | {primary: brand}     | {...detectTheme(), primary: brand}                                        | Minimal touch — just the emphasis color. Status, neutrals, ANSI 16 all inherit. Respect the user's shell. |
| brand-pair + inherit | {primary, accent}    | {...detectTheme(), primary, accent}                                       | Two-color brand. Status + neutrals still inherit.                                                         |
| brand-derived        | {primary: brand}     | {...neutrals from detectTheme(), all ANSI 16 = hueRotate(brand, offsets)} | Brand owns the mood. Even red/yellow/green shift to harmonize.                                            |
| semantic override    | {red, green, yellow} | {...detectTheme(), ...overrides}                                          | Tweak specific semantics (e.g., softer red) without changing the feel.                                    |
| full spec            | all 22 colors        | pass through                                                              | For screenshots/marketing where user's terminal must not leak through.                                    |

Each mode is a real design choice:

- km: inherit-all (dev vehicle; respects user's terminal)
- coding-assistant showcase: probably brand-pair + inherit or brand-derived (competitive with opencode's distinct look)
- silvery.dev gallery: full spec (consistent across every visitor)

**Stage 1 config axis**: \`source\` in the six-axis model becomes a mode picker with these 6 values, not just "inherit | hardcoded".

## Stage 2 — Token derivation (ANSI 22 → 33 tokens)

The 22-color palette is the input; the 33-token theme is the output. Formula in deriveTheme():

```
-- Neutrals --
bg          = palette.background                          — the canvas; inherits directly
fg          = palette.foreground, ensureContrast AA        — body text; readable on every surface
muted       = blend(fg, bg, 40%), ensureContrast AA        — secondary info; distinct but readable
disabledfg  = blend(fg, bg, 50%), ensureContrast DIM(3.0)  — clearly inert, not invisible

-- Surfaces --
surfacebg   = blend(bg, fg, 5%)   — subtle lift; perceptible hierarchy without distraction
popoverbg   = blend(bg, fg, 8%)   — more lift; modals sit above surfaces
mutedbg     = blend(bg, fg, 4%)   — slight tint; for Code + muted blocks
inversebg   = blend(fg, bg, 10%)  — dark inverse; status bar family

-- Accent family --
primary     = dark ? yellow : blue, ensureContrast AA   — warm emphasis on dark, trust on light
accent      = complement(primary), ensureContrast AA    — opposite hue; maximum variety with zero config
secondary   = blend(primary, accent, 35%), ensure AA    — bridges primary + accent; harmonizes
info        = blend(fg, accent, 50%), ensureContrast AA — de-saturated accent; informational
link        = dark ? brightBlue : blue, ensure AA       — convention; blue = clickable since 1993

-- Status --
error       = palette.red, ensureContrast AA            — inherits user's red
warning     = palette.yellow, ensureContrast AA         — inherits user's yellow
success     = palette.green, ensureContrast AA          — inherits user's green

-- Structural --
border      = blend(bg, fg, 15%), ensure FAINT(1.5)     — visible line without shouting
inputborder = blend(bg, fg, 25%), ensure CONTROL(3.0)   — more present; interactives announce themselves
focusborder = link                                       — focus ring matches link; both signal 'actionable'
```

Every line is a micro-design-decision. Every decision needs one-sentence rationale (as above). The rationale lives in docs/guide/derivation.md for designer readability.

## Global configs (parameterize the Stage 2 formula)

Not per-token sliders — per-role scalars that preserve token relationships.

### Contrast

Replaces hardcoded AA/DIM/FAINT/CONTROL constants:

```
setting       body  dim   faint   control
native        4.5   3.0   1.5     3.0   (current AA)
comfortable   5.5   3.5   2.0     3.5
high          7.0   4.5   3.0     4.5   (AAA)
```

And scales surface-blend percentages proportionally (higher contrast = bigger lift between bg/surfacebg/popoverbg):

```
setting       surfacebg  popoverbg  mutedbg  inversebg  border  inputborder
native        5%         8%         4%       10%        15%     25%  (current)
comfortable   7%         11%        6%       13%        20%     30%
high          10%        15%        8%       18%        25%     35%
```

### Saturation

HSL saturation multiplier applied post-derivation on accent/status tokens only (primary, secondary, accent, error, warning, success, info). Neutrals (fg, muted, bg, surfaces, borders) stay untouched.

```
native = ×1.0   boost = ×1.2   max = ×1.5 (clamped at 100%)
```

### Other candidates (to discuss with Mike)

- **Breadth** — how many accent/status hues the app exposes. One-accent reduces chroma diversity.
- **Demarcation** — panes (bg-tint + padding) vs borders (box-drawing) vs mixed. Affects component defaults.
- **Density** — padding/gap scalars. Affects component defaults.

### Deliberately NOT exposing

Per-color sliders. Pick a spec mode + palette + set global configs. If accents feel wrong, switch palettes or spec mode — don't tweak individual colors. This keeps token relationships coherent.

## The rationale doc

docs/guide/derivation.md — two tables (Stage 1 modes, Stage 2 formulas) with one-sentence rationale per row. Mike reviews the rationale; if a step seems arbitrary, we revise the formula. Output: a doc readable by designers and engineers that explains WHY the pipeline produces what it does.

## Workbench — 'bun design'

The workbench is the formula explorer. Sections:

1. **Spec Mode (Stage 1)** — pick a mode; if brand-based, set primary (and accent if brand-pair); show the resulting ANSI 22 palette with a note on which slots came from where (inherited, derived, specified).
2. **Formula + Tokens (Stage 2)** — every token with formula + rationale + live hex swatch + live WCAG contrast ratio (red if below target).
3. **Global Configs** — live controls for contrast, saturation (plus breadth/demarcation/density later); change these and watch every token recompute.
4. **Components** — every typography preset + canonical component in every state — proves the tokens work in situ.
5. **ANSI 16 Preview** — side-by-side: each truecolor token → nearest of the user's 16 slots, with collision flags.

## Acceptance

**Phase 1** — Rationale documented, workbench exists, Mike audit scheduled

- \`docs/guide/derivation.md\` lists every Stage 1 mode + Stage 2 token with formula + rationale
- \`bun design\` runs; shows both stages with live contrast readouts and spec-mode picker
- Mike onboarded, walked through workbench, returns prioritized change list

**Phase 2** — Pipeline parameterized, global configs land

- Stage 1 spec modes implemented as first-class \`PaletteSpec\` type + \`completePalette(spec)\` function
- Contrast scalar replaces hardcoded AA/DIM/FAINT/CONTROL in deriveTheme
- Saturation multiplier applied post-derivation
- ThemeAdjustment API supports the new knobs
- Workbench controls drive live theme rebuild

**Phase 3** — New components + doctrine

- MessageBlock (chat/agent rail), StatusBar (multi-column muted), CommandPalette (list + input combined), Indicator (single-side border), flat Table/Dialog variants
- Per-side border props on Box
- Density tokens + component defaults
- Doctrine doc: when to use panes vs borders, selection colors, hierarchy rules

**Phase 4** — Showcase + ship

- silvery.dev gallery updated with new components + derivation doc
- Coding-assistant showcase hits opencode parity via brand-derived or brand-pair Stage 1 mode
- km switches nothing (dev vehicle stays on inherit-all / native contrast)

## References

- **Code**: \`vendor/silvery/packages/ansi/src/theme/derive.ts\` (Stage 2 formula), \`vendor/silvery/packages/color/src/contrast.ts\` (ensureContrast), \`vendor/silvery/packages/ansi/src/theme/types.ts\` (22/33 shapes)
- **Workbench**: \`vendor/silvery/examples/apps/design.tsx\` (scaffolded; needs Stage 1 spec-mode picker + global config controls)
- **Docs**: \`vendor/silvery/docs/guide/styling.md\` (current), \`docs/guide/derivation.md\` (to create — rationale tables for both stages)
- **Related beads**: @km/silvery/tea/aichat-polish (showcase), @km/tui/minimalist-redesign (pure panes experiment), @km/silvery/commander-help-redesign, @km/silvery/variant-style-system
- **Competitors**: opencode (target visual parity)

