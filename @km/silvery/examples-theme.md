---
id: "@km/silvery/examples-theme"
aliases:
  - km-silvery.examples-theme
  - km-silvery-examples-theme
created_by: claude:73d7a332
created_at: 2026-03-12T16:46:46Z
---

# [ ] Example: theme explorer (38 palettes, live preview, semantic tokens) @km/silvery #task #P3

Example: theme — Browse all 38 built-in palettes with live preview

## What It Demonstrates
- All 38 built-in theme palettes
- Live theme switching with instant preview
- ANSI color swatches (16-color, 256-color, truecolor)
- Typography samples with each theme
- Semantic token preview (primary, success, warning, error, muted, border)

## Status: NEW terminal version (web-only showcase exists at web/showcases/theme-explorer.tsx)

## Source Material
- web/showcases/theme-explorer.tsx — web-only version, needs terminal port
- packages/theme/ — builtinThemes (38 palettes), getThemeByName(), Theme type

## Design
Single-screen layout:
- Left: theme list with color swatches (SelectList)
- Right: live preview panel showing:
  - Semantic tokens as colored text blocks (primary, success, warning, error, muted)
  - ANSI 16-color table
  - Sample UI with borders, text, badges using current theme
  - Typography samples (H1, Strong, Muted, Code)

## Key Components
- SelectList (theme navigation)
- ThemeProvider (wraps preview)
- builtinThemes from @silvery/theme
- Box borderStyle variants
- Text with semantic $token colors

## Implementation Notes
- ExampleMeta: name="Theme Explorer", description="Browse 38 built-in palettes with live color preview"
- features: ["ThemeProvider", "builtinThemes", "semantic tokens", "ANSI colors"]
- File: examples/interactive/theme.tsx
- j/k to navigate themes, Enter to select, preview updates instantly
- Web: works well since it's just colored text/boxes