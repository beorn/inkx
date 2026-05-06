---
mentions:
  - km
id: "@km/inbox/board-1"
aliases:
  - km-board-1
  - "@km/_orphan/board-1"
created_at: 2026-01-18T00:14:21Z
closed_at: 2026-02-04T11:27:26Z
---

# [x] Document TUI text styling options (Ink/ANSI) @km/_orphan #task #P4

## Analysis of Text Styling Options in Ink

## Ink Text Component Props

### Style Properties (from Text.d.ts)

- `color` - Foreground text color
- `backgroundColor` - Background color
- `dimColor` - Halves brightness (boolean)
- `bold` - Bold text (boolean)
- `italic` - Italic text (boolean) - **Note: Not all terminals support**
- `underline` - Underlined text (boolean)
- `strikethrough` - Strikethrough text (boolean)
- `inverse` - Swap fg/bg colors (boolean)
- `wrap` - Text wrapping mode (`wrap` | `truncate-*`)

### Available Colors (16 ANSI)

Base colors (8): black, red, green, yellow, blue, magenta, cyan, white
Bright variants (8): blackBright/gray/grey, redBright, greenBright, yellowBright, blueBright, magentaBright, cyanBright, whiteBright

### Extended Colors

- 256-color palette: `ansi256(0-255)`
- 24-bit RGB: `rgb(r,g,b)` or `#RRGGBB`

## Design System Constraints (per docs/08-ui.md)

### Reserved Combinations

- `cyan` bg = selection ONLY (cursor/focus/multi-select)
- `inverse` = input cursor ONLY

### Available for Differentiation

1. **Color** - Any of the 16 ANSI colors except cyan for non-selected items
2. **dimColor** - Halves brightness, good for done/dropped/inactive states
3. **bold** - Text weight, good for emphasis
4. **backgroundColor** - Can use for special states (colored tags)

### NOT Recommended (per design decision)

- `strikethrough` - Disabled in tree-node-helpers.ts (`shouldStrikethrough = false`)
- `italic` - Poor terminal support
- `underline` - Reserved for wiki links

## Practical Palette

For task/content differentiation:

- Status icons: colored (○ gray, ◐ yellow, ⊘ red, ✓ green, ∅ gray)
- Active text: normal
- Inactive/done: dimColor
- Selection: cyan bg + black fg
- Column headers: yellow (selected), yellowBright+dim (unselected)
- Wiki links: underline (default Ink behavior)
- Bold markdown: bold prop
- Code spans: cyan color

Tags/pills use the full color palette based on GTD_BOARD_COLORS mapping.

