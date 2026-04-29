---
id: "@km/termless/themes"
aliases:
  - km-termless.themes
  - km-termless-themes
created_by: claude:4929065a
created_at: 2026-04-02T17:24:32Z
closed_at: 2026-04-02T17:33:44Z
close_reason: 12 built-in themes (dracula, nord, monokai, catppuccin,
  tokyo-night, solarized, github, gruvbox, one-dark, rose-pine + light
  variants), --theme CLI flag, Set Theme in .tape, termless themes command. 14
  tests.
owner: bjorn@stabell.org
---

# [x] Recording themes: Set Theme in .tape using silvery's 38 palettes @km/termless #feature #P3

Support themes in .tape recordings and CLI — map VHS-style Set Theme to silvery's palette system.

## VHS themes
VHS supports Set Theme "Dracula", "Nord", "Monokai", etc. for screenshot/GIF rendering.

## Silvery themes
Silvery has 38 palettes in @silvery/theme (catppuccin, dracula, nord, gruvbox, tokyo-night, etc.). These define fg, bg, cursor, and 16 ANSI palette colors — exactly what the SVG renderer needs.

## Implementation
- Parse Set Theme "name" in .tape (already parsed, just needs wiring)
- Map theme name to silvery palette: import { palettes } from "@silvery/theme"
- Pass palette colors to screenshotSvg as SvgTheme
- CLI flag: --theme name (applies to record + play)
- termless themes — list available themes
- termless play --theme dracula demo.tape

## VHS theme compatibility
Map VHS theme names to silvery palettes where they match:
- Dracula → dracula
- Nord → nord
- Monokai → monokai (if available)
- Catppuccin → catppuccin-mocha
- Tokyo Night → tokyo-night

For VHS themes without a silvery equivalent, fall back to the closest match or default.

## Also
- Auto-detect terminal theme from env (COLORFGBG, terminal-specific APIs)
- Set Theme could also accept a JSON object for custom colors