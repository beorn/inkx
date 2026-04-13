# Theme System v2: Semantic Tokens + Progressive Enhancement

> **SUPERSEDED**: This design spec predates the swatch redesign (2026-03).
> The actual implementation uses ColorPalette (22 terminal colors) → Theme (33 shadcn-style tokens).
> See `vendor/silvery/packages/theme/CLAUDE.md` for the current architecture.
> Token names below (`$text`, `$chromebg`, etc.) are outdated — current tokens use
> `$fg`, `$inverse`, `$surface`, etc. See the CLAUDE.md semantic tokens table.

## Goals

1. **Semantic tokens** with simple English names, inspired by Apple HIG
2. **Progressive enhancement**: ANSI 16 baseline -> 256-color -> truecolor
3. **Configurable primary color** (cycle through palette)
4. **Dark + light themes**, each with ANSI 16 and truecolor variants
5. **Inherited opacity** for pane dimming and ghost cards
6. **View settings UI** to switch themes live
7. **Storybook** visualizes all themes and tokens in use

## Token System

### Semantic Tokens (19)

Components reference tokens with `$` prefix: `color="$primary"`, `borderColor="$separator"`.
Derived from a `ThemePalette` (14 raw colors) via `deriveTheme()` -- both defined in the
`swatch` package. See the [theme package reference](../../vendor/silvery/packages/theme/README.md)
for the full token list and derivation rules.

### Content Palette (16)

For categorization -- tags, calendar colors, chart series, node type tinting.

```
$color0  ... $color15    Maps to ANSI 16 at baseline, curated hues at truecolor
```

Apps reference palette colors by index: `color={`$color${tagColorIndex}`}`.
At ANSI 16 these map directly to the 16 terminal colors.
At truecolor they become curated equal-weight hues (Apple system colors style).

### Inherited Opacity

Not a token -- a **Box prop** that multiplies all descendant colors toward background.

```tsx
<Box opacity={0.6}>   {/* Unfocused pane -- everything inside dims */}
  <CardColumn ... />
</Box>

<Box opacity={0.3}>   {/* Ghost card -- very faint */}
  <Card ... />
</Box>
```

Implementation by tier:
- **ANSI 16**: opacity < 0.5 -> dimColor on all descendants. Binary (dim or not).
- **256-color**: Map each color to a dimmer 256-color equivalent. 2-3 levels.
- **Truecolor**: True alpha blending toward $bg. Continuous.

## Theme Architecture

The theme system uses a two-layer architecture defined in `swatch`:

- **Layer 1: ThemePalette** -- 14 raw colors (6 surface ramp + 8 accent hues)
- **Layer 2: Theme** -- 19 semantic tokens + 16 palette colors derived via `deriveTheme()`

See the [theme package reference](../../vendor/silvery/packages/theme/README.md) for
the full rationale and derivation rules.

### Token Aliases

See the [theme package reference](../../vendor/silvery/packages/theme/README.md) for backward-compatible aliases.

| Alias Token     | Resolves To    |
|-----------------|--------------- |
| `$accent`       | `$primary`     |
| `$muted`        | `$text2`       |
| `$raisedbg`     | `$surface`     |
| `$background`   | `$bg`          |
| `$border`       | `$separator`   |

### Cross-Platform Binding

The same `ThemePalette` + `deriveTheme()` produces a `Theme` that binds to any platform.
See the [theme package reference](../../vendor/silvery/packages/theme/README.md) for CSS custom
properties and React context examples.

## Where Each Token Is Used in km

| Token | UI Elements |
|-------|-------------|
| `$primary` | Active tab dot, board heading, column header (focused), shortcut keys in help, favorite keys |
| `$link` | Inline links, `@board` references, wiki-links |
| `$control` | Keyboard shortcut badges, input borders, chord hint keys |
| `$selected` | Cursor row background, selected card bg, picker selected row |
| `$selectedfg` | Text on cursor row, text on selected items |
| `$focusborder` | Focused pane border, editing card border, active input outline |
| `$text` | Node titles, body text, fold markers, column headers |
| `$text2` | Node descriptions, metadata labels, unfocused column headers |
| `$text3` | Child counts, timestamps, dot leaders, chord separators, footer hints |
| `$text4` | Ghost fold dots, empty column placeholders, grid empty cells |
| `$bg` | Main background (usually terminal default) |
| `$surface` (`$raisedbg` alias) | Dialog/modal background, picker dropdown, tooltip bg |
| `$separator` | All borders (auto-default), divider lines, column separators |
| `$chromebg` | Status bar bg, title bar bg (inverted) |
| `$chromefg` | Status bar text, title bar text (inverted) |
| `$error` | Overdue dates, P0/P1 priority, blocked status, validation errors, broken embeds |
| `$warning` | In-progress status (WIP icon), unsaved indicator, P2 priority |
| `$success` | Done status (checkmark), actionable dates, start dates |
| `$color0`--`$color15` | Board-specific colors, tag colors, calendar event colors |

### Help Dialog Color Spec

```
+-- Keyboard Shortcuts --------------------- ? --+
|                                                 |  border: $separator (auto)
|  NAVIGATION -------------------------           |  title: $text (bold)
|  j .............................down             |  hotkey badge: $control
|  k ...............................up             |  section heading: $primary (bold)
|  g-i .....................go inbox               |  heading dashes: $text4
|                                                 |  keys: $control
|  SHORTCUTS --------------------------           |  dot leaders: $text4
|              go to   move   add/link            |  descriptions: $text2
|  prefix key  g or ^g m or ^m a or ^l            |  chord dots: $text3
|  i inbox     gi      mi     ai                  |  "/" separator: $text3
|  j journal   gj      .      .                   |  grid col headers: $primary (bold)
|                                                 |  "or" text: $text3
|  Esc to close                        |j/k|      |  grid location key: $control
+-------------------------------------------------+  grid location label: $text2
                                                     grid empty ".": $text4
                                                     footer: $text3
                                                     scroll hint: $text3
                                                     dialog bg: $surface
```

## Migration from Current System

### Token Mapping

| Old (km.*)              | New Token    | Notes                                  |
|-------------------------|-------------|----------------------------------------|
| `km.selectionBg`        | `$selected`  | Promoted to theme token                |
| `km.selectionFg`        | `$selectedfg`| Promoted to theme token                |
| `km.selectionDim`       | `$selected` + opacity | Unfocused = parent opacity   |
| `km.inputFocusRing`     | `$focusborder` | Promoted to theme token                |
| `km.cardBorderEditing`  | `$focusborder` | Same as focus ring (editing = focused) |
| `km.cardBorderSelected` | `$selected`  | Selected card border = selection color |
| `km.textPrimary`        | `$text`      | Direct mapping                         |
| `km.textLink`           | `$link`      | Promoted to theme token                |
| `km.paneBorderFocused`  | `$text`      | Focused pane = normal text border      |
| `km.columnHeaderColor`  | `$text`      | Column headers = primary text          |
| `km.hintKey`            | `$primary`   | Keys in popups = brand color           |
| `km.hintKeyDim`         | `$text3`     | Dimmed keys = tertiary text            |
| `km.modeMagenta`        | `$color5`    | Mode indicator via palette             |
| `km.overlayBg`          | `$surface`   | Overlay background = raised surface    |
| `km.dialogBorder`       | `$separator` | Dialog border = separator              |
| `km.dialogTitle`        | `$text`      | Dialog title = primary text (bold)     |
| `km.dialogBody`         | `$text`      | Dialog body = primary text             |
| `km.dialogDim`          | `$text2`     | Secondary dialog text                  |
| `km.dialogSelectedBg`   | `$selected`  | Same selection token everywhere        |
| `km.dialogSelectedFg`   | `$selectedfg`| Same selection fg everywhere           |
| `km.dialogInputBorder`  | `$focusborder` | Input border = focus ring              |
| `km.dialogShortcut`     | `$control`   | Shortcut hints = interactive chrome    |
| `km.helpSectionHeading` | `$primary`   | Help headings = brand color (bold)     |
| `km.helpKey`            | `$control`   | Help keys = interactive chrome         |

After migration, `km` constants reduce from ~25 to **0** -- all colors come from
theme tokens. The `km` object and `theme.ts` in km-tui are deleted.

### silvery Default: Box borderColor = $separator

When `borderStyle` or `outlineStyle` is set but no explicit `borderColor`/`outlineColor`
is provided, silvery resolves the color to `$separator` from the active theme. This
eliminates the need to specify `borderColor` on every bordered element.

```tsx
{/* Before: explicit color needed */}
<Box borderStyle="single" borderColor={km.dialogBorder}>

{/* After: automatic from theme */}
<Box borderStyle="single">
```

## Implementation Plan

### Phase 0: Color Utilities -- DONE (vendor/silvery/packages/theme)

Extracted to `swatch` package (`vendor/silvery/packages/theme/src/color.ts`).

### Phase 1: ThemePalette + deriveTheme() -- DONE (vendor/silvery/packages/theme)

Extracted to the `swatch` package. ThemePalette and deriveTheme now live in `swatch`.
silvery imports from `"swatch"`. Built-in palettes (45 total across 15 theme families).

### Phase 2: km-tui Migration (apps/km-tui)

1. Replace all hardcoded color names with `$token` references across views
2. Delete `GTD_BOARD_COLORS`, `getTermColor()`, `colorize()` helpers
3. Update `tui.tsx` ThemeProvider to use new themes
4. Add primary color cycling to view settings
5. Add theme switching (dark/light, palette selection) to view settings
6. Persist theme settings in vault `.km/settings.json`

### Phase 3: Storybook (apps/km-tui/tests/storybook.tsx)

1. Add "Theme Gallery" section showing all tokens with color swatches
2. Add theme switcher (cycle themes with keybinding)
3. Add primary color cycling demo
4. Show same component in all 4 themes side-by-side (if width allows)
5. Show opacity/dimming demo (normal -> dim -> ghost)

### Phase 4: Tests

1. Test `deriveTheme()` produces valid themes for all built-in palettes
2. Test OKLCH bright variants are perceptually correct
3. Test `blend()` / `contrastFg()` edge cases
4. Update all test helpers to use new theme
5. Test theme switching doesn't break layout
6. Snapshot tests for storybook sections

## Hardcoded Color Migration

~160 hardcoded color names across ~28 view files need migration to `$token` references.

### What to Remove

- **GTD board colors** (`GTD_BOARD_COLORS` in `apps/km-tui/src/text/colors.ts`): Template-specific. Board colors should come from content palette (`$color0`--`$color15`).
- **`getTermColor()`/`colorize()` helpers**: Replace with `$token` props.

### Migration Pattern

```tsx
// Before: hardcoded color name
<Text color="cyan">description</Text>
<Text color="gray">timestamp</Text>
<Text color="yellowBright">active</Text>

// After: semantic token
<Text color="$text2">description</Text>
<Text color="$text3">timestamp</Text>
<Text color="$primary">active</Text>
```

### Migration Priority

1. Status colors (red/green/yellow for task states) -> `$error`/`$success`/`$warning`
2. Text hierarchy (white/gray/dim variations) -> `$text`/`$text2`/`$text3`/`$text4`
3. Interactive elements (cyan/blue for links, borders) -> `$primary`/`$link`/`$control`
4. Categorization colors (per-board, per-tag) -> `$color0`--`$color15`
5. Chrome/surface colors (bg, borders) -> `$bg`/`$surface`/`$separator`

## Future: Cross-App Theme Generation

Inspired by Omarchy's config generation pipeline, a single `ThemePalette` could generate
themed configs for the user's entire terminal environment:

```
palette.toml -> deriveTheme() -> ghostty.conf    (terminal theme)
                               -> neovim.lua      (colorscheme)
                               -> tmux.conf       (status line colors)
                               -> bat-theme.tmTheme (syntax highlighting)
                               -> lazygit.yml     (git TUI colors)
```

This is out of scope for v2 but the `ThemePalette` interface is designed to support it.
The 14-color input (6 surface + 8 hues) is expressive enough to generate any of these configs.
