---
id: "@km/inkx/osc-palette"
aliases:
  - km-inkx.osc-palette
  - km-inkx-osc-palette
created_by: claude:d697f216
created_at: 2026-02-25T13:21:52Z
closed_at: 2026-02-25T13:58:51Z
---

# [x] OSC 4: query/set terminal color palette entries @km/inkx #feature #P2 @claude:d697f216

Add queryPaletteColor(index) to query the terminal's 256-color palette entries. Useful for detecting the actual colors used by the terminal theme (especially ANSI 16 colors 0-15). Could be used to detect color scheme or build adaptive themes.