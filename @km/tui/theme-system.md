---
id: "@km/tui/theme-system"
aliases:
  - km-tui.theme-system
  - km-tui-theme-system
created_by: claude:d697f216
created_at: 2026-02-25T21:02:57Z
closed_at: 2026-03-03T23:21:56Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Theme system: semantic tokens, ANSI16+truecolor, primary color cycling, light/dark @km/tui #feature #P1 @claude:d697f216

Theme system v2 → standalone FOSS package extraction.

**Package**: vendor/beorn-themex (git submodule → github:beorn/themex)

## Status: Core extraction DONE, redesign in progress

All original extraction work is complete (Phases 1-6). The package works,
inkx imports migrated, 45 palettes, 166 tests, docs live.

Active redesign tracked under @km/swatch/token-redesign:
- ThemePalette (14) → ColorPalette (22 terminal standard)
- Theme (19 tokens) → DesignTokens (32 tokens, shadcn-style $name/$name-fg pairs)
- from*() palette generators
- Dual derivation: ANSI 16 (aliases) vs truecolor (rich blends)

See @km/_orphan/swatch epic for current state.