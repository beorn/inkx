---
mentions:
  - km
  - claude
id: "@km/themex/token-redesign"
aliases:
  - km-themex.token-redesign
  - km-themex-token-redesign
created_by: claude:66437c43
created_at: 2026-03-03T16:11:42Z
closed_at: 2026-03-03T22:51:31Z
owner: bjorn@stabell.org
assignee: claude:66437c43
---

# [x] Redesign: ColorPalette (22), DesignTokens (32), from*() generators, docs rewrite @km/themex #feature #P2 @claude:66437c43

## Redesign: ColorPalette pivot + shadcn DesignTokens + docs rewrite

### Four concepts (the new mental model)

1. **Palette generators** — from*() functions that produce a ColorPalette
2. **ColorPalette** — the 22 terminal colors (de facto standard)
3. **DesignTokens** — 32 semantic tokens with shadcn-style $name/$name-fg pairing
4. **Theme system** — themex, the package

### Code changes

**ColorPalette (replaces ThemePalette)**

- 14 named colors → 22 terminal colors (16 ANSI + fg + bg + cursor_color + cursor_text + selection_bg + selection_fg)
- The 22 is the canonical pivot — every input produces it, every output consumes it

**DesignTokens (replaces Theme)**

- 19 inconsistent tokens → 32 shadcn-style tokens
- 14 pairs: $bg/$fg, $surface/$surface-fg, $popover/$popover-fg, $muted/$muted-fg,
  $primary/$primary-fg, $secondary/$secondary-fg, $accent/$accent-fg,
  $error/$error-fg, $warning/$warning-fg, $success/$success-fg,
  $info/$info-fg, $selection/$selection-fg, $inverse/$inverse-fg, $cursor/$cursor-fg
- 4 standalone: $border, $input, $ring, $link
- Plus $color0-$color15 passthrough = 48 addressable tokens

**Palette generators**: from*() pattern — fromBase16(), fromITerm(), fromOSC(), fromColors()

**Dual derivation**: ANSI 16 = aliases (no computation), truecolor = rich blends

### Docs rewrite (complete rethink, not find-and-replace)

Every doc was written for "14-color ThemePalette → 19 tokens." The new mental model
is fundamentally different. Pages to rewrite from scratch:

- getting-started.md — introduce the 4 concepts, ColorPalette as pivot
- creating-themes.md — authoring a ColorPalette (22 fields), from*() generators
- design-philosophy.md — why 22, why shadcn pairing, the into-22/22-and-out split
- theme-palette.md → color-palette.md — ColorPalette reference (22 fields)
- semantic-tokens.md → design-tokens.md — DesignTokens reference (32 tokens, the big table)
- derivation-rules.md — dual derivation (ANSI 16 aliases vs truecolor blends)
- builder-api.md — from*() pattern, ColorPalette output
- comparisons.md — update tables to reflect new architecture
- web-usage.md — CSS custom properties from DesignTokens
- CLAUDE.md — update architecture section
- README.md — update quick start

### Not yet decided

- Text hierarchy: 1 muted level (shadcn) vs 3+ (Apple HIG)?
- Shade generation: primaryLighten1-3 via OKLCH?
- Terminal config exporters (Ghostty/Kitty themes from ColorPalette)
- Embeddable ThemePicker/ThemePreview components

### Inspired by

- shadcn/ui: consistent pairing, $border/$input/$ring standalone
- M3: on-* concept, color roles
- Apple HIG: ONE accent, text opacity cascade
- Textual: minimal authoring, shade generation
- Terminal standard: the 22-color de facto format

