---
id: "@km/tui/ansi16-palette"
aliases:
  - km-tui.ansi16-palette
  - km-tui-ansi16-palette
created_by: claude:d697f216
created_at: 2026-02-25T13:09:19Z
closed_at: 2026-02-25T17:18:57Z
---

# [x] Restrict UI chrome to ANSI 16 colors; allow extended for user content @km/tui #task #P1 @claude:d697f216

All UI elements (selection highlights, borders, outlines, pane bars, dim text, active/inactive states) must use only ANSI 16 colors + dim/bold modifiers. No hex colors (#rrggbb) in UI chrome.

Extended colors (256 or RGB) are allowed for:
- Tag colors (user-assigned)
- User content styling (syntax highlighting, etc.)
- Board/project colors (user-configurable)

ANSI 16 UI palette:
- Selection focused: yellow bg + black text (bold)
- Selection unfocused: dim yellow text (no bg) or dim + inverse
- Muted text: white + dim, or gray
- Borders/outlines: white + dim (unfocused), white (focused)
- Links: cyan + underline; bare URLs: cyan + dim + underline
- Active input: blue or cyan border
- Errors: red; warnings: yellow; success: green

Sweep needed — agents just introduced hex colors that need replacing:
- #888 → gray or white+dim (whichkey hints)
- #333333 → dim (unfocused pane bar bg, detail cursor)
- #555500 → yellow+dim (unfocused selection)
- #5599dd → blue (active command box outline)