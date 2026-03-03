# Theme System v2: Semantic Tokens + Progressive Enhancement

> Design spec for km-tui.theme-system (P1)

> **Note:** The core theme system (ThemePalette, Theme, deriveTheme, resolveThemeColor,
> color utilities, built-in palettes) has been extracted to the `themex` package
> (`vendor/beorn-themex/`, importable as `"themex"`). This doc retains the design rationale,
> km-specific token usage, and migration plan. See `vendor/beorn-themex/CLAUDE.md` for
> the package API reference.

## Goals

1. **Semantic tokens** with simple English names, inspired by Apple HIG
2. **Progressive enhancement**: ANSI 16 baseline → 256-color → truecolor
3. **Configurable primary color** (cycle through palette)
4. **Dark + light themes**, each with ANSI 16 and truecolor variants
5. **Inherited opacity** for pane dimming and ghost cards
6. **View settings UI** to switch themes live
7. **Storybook** visualizes all themes and tokens in use

## Token System

### Semantic Tokens (19)

Components reference tokens with `$` prefix: `color="$primary"`, `borderColor="$separator"`.
Derived from a `ThemePalette` (14 raw colors) via `deriveTheme()` — both defined in the
`themex` package. See [ThemePalette](#themepalette-cross-platform-color-input).

```
── Brand ─────────────────────────────────────────────────────────────
$primary        Brand accent — active indicators, headings, badges
$link           Hyperlinks, references (always blue)
$control        Interactive chrome — shortcuts, input borders (muted accent)

── Selection ─────────────────────────────────────────────────────────
$selected       Selection highlight background (contrasting hue)
$selectedfg     Text on selected background
$focusring      Keyboard focus outline (always blue — accessibility)

── Text ──────────────────────────────────────────────────────────────
$text           Primary content — headings, body, node titles
$text2          Secondary — descriptions, metadata, unfocused labels
$text3          Tertiary — timestamps, hints, counts, placeholders
$text4          Quaternary — ghost text, watermarks, decorative dots

── Surface ───────────────────────────────────────────────────────────
$bg             Default background
$surface        Elevated surfaces — cards, dialogs, popovers
$separator      Dividers, borders, rules
$chromebg       Inverted areas — title bars, status bars (bg)
$chromefg       Inverted areas — title bars, status bars (fg)

── Status ────────────────────────────────────────────────────────────
$error          Destructive, overdue, blocked, validation errors
$warning        Caution, unsaved, in-progress (orange, not yellow)
$success        Positive, completed, saved, actionable
```

### Content Palette (16)

For categorization — tags, calendar colors, chart series, node type tinting.

```
$color0  … $color15    Maps to ANSI 16 at baseline, curated hues at truecolor
```

Apps reference palette colors by index: `color={`$color${tagColorIndex}`}`.
At ANSI 16 these map directly to the 16 terminal colors.
At truecolor they become curated equal-weight hues (Apple system colors style).

### Inherited Opacity

Not a token — a **Box prop** that multiplies all descendant colors toward background.

```tsx
<Box opacity={0.6}>   {/* Unfocused pane — everything inside dims */}
  <CardColumn ... />
</Box>

<Box opacity={0.3}>   {/* Ghost card — very faint */}
  <Card ... />
</Box>
```

Implementation by tier:
- **ANSI 16**: opacity < 0.5 → dimColor on all descendants. Binary (dim or not).
- **256-color**: Map each color to a dimmer 256-color equivalent. 2-3 levels.
- **Truecolor**: True alpha blending toward $bg. Continuous.

## Theme Interface

Defined in `themex` (`vendor/beorn-themex/src/types.ts`). The actual field name for elevated
surfaces is `raisedbg`; `$surface` is a backward-compat alias (see alias table below).

```typescript
interface Theme {
  // Metadata
  name: string
  dark: boolean

  // Brand
  primary: string
  link: string
  control: string

  // Selection
  selected: string
  selectedfg: string
  focusring: string

  // Text
  text: string
  text2: string
  text3: string
  text4: string

  // Surface
  bg: string
  raisedbg: string      // $surface is a backward-compat alias
  separator: string
  chromebg: string
  chromefg: string

  // Status
  error: string
  warning: string
  success: string

  // Content palette (16 indexed colors)
  palette: string[]
}
```

## Themes

Built-in themes are now defined in `themex` (`vendor/beorn-themex/src/generate.ts` for ANSI 16,
`vendor/beorn-themex/src/palettes/` for truecolor). The examples below show the design intent;
the canonical definitions are in the themex source.

### Dark ANSI 16

Primary = yellow. High contrast on dark terminals.

```typescript
const darkAnsi16: Theme = {
  name: "dark-ansi16",
  dark: true,

  primary: "yellow",
  link: "yellowBright",
  control: "yellow",         // + dimColor for secondary

  selected: "cyan",
  selectedfg: "black",
  focusring: "blueBright",

  text: "whiteBright",
  text2: "white",
  text3: "gray",             // = blackBright
  text4: "gray",             // + dimColor

  bg: "",                    // terminal default
  raisedbg: "black",         // explicit black for opaque overlays
  separator: "gray",         // + dimColor

  error: "redBright",
  warning: "yellow",         // = primary (context disambiguates)
  success: "greenBright",

  palette: [
    "black", "red", "green", "yellow",
    "blue", "magenta", "cyan", "white",
    "blackBright", "redBright", "greenBright", "yellowBright",
    "blueBright", "magentaBright", "cyanBright", "whiteBright",
  ],
}
```

### Light ANSI 16

Primary = blue. Readable on light terminal backgrounds.

```typescript
const lightAnsi16: Theme = {
  name: "light-ansi16",
  dark: false,

  primary: "blue",
  link: "blueBright",
  control: "blue",           // + dimColor

  selected: "cyan",
  selectedfg: "black",
  focusring: "blue",

  text: "black",
  text2: "blackBright",      // = gray
  text3: "gray",
  text4: "gray",             // + dimColor

  bg: "",                    // terminal default
  raisedbg: "white",         // explicit white for opaque overlays
  separator: "gray",

  error: "red",
  warning: "yellow",
  success: "green",

  palette: [
    "black", "red", "green", "yellow",
    "blue", "magenta", "cyan", "white",
    "blackBright", "redBright", "greenBright", "yellowBright",
    "blueBright", "magentaBright", "cyanBright", "whiteBright",
  ],
}
```

### Dark Truecolor

Nord-inspired. Primary derived from a configurable hue.

```typescript
const darkTruecolor: Theme = {
  name: "dark-truecolor",
  dark: true,

  primary: "#EBCB8B",        // warm gold (Nord yellow)
  link: "#ECCC90",           // primary lightened 5%
  control: "#B8A06E",        // primary @ 70%

  selected: "#88C0D0",       // frost blue (distinct hue)
  selectedfg: "#2E3440",     // dark bg
  focusring: "#5E81AC",      // always blue-ish

  text: "#ECEFF4",           // snow white
  text2: "#D8DEE9",          // 85%
  text3: "#7B88A1",          // 50%
  text4: "#545E72",          // 30%

  bg: "#2E3440",             // polar night
  raisedbg: "#3B4252",       // one shade lighter
  separator: "#4C566A",      // subtle border

  error: "#BF616A",          // aurora red
  warning: "#EBCB8B",        // aurora yellow (= primary)
  success: "#A3BE8C",        // aurora green

  palette: [
    "#2E3440", "#BF616A", "#A3BE8C", "#EBCB8B",
    "#5E81AC", "#B48EAD", "#88C0D0", "#E5E9F0",
    "#4C566A", "#D08770", "#8FBCBB", "#D8DEE9",
    "#81A1C1", "#B48EAD", "#8FBCBB", "#ECEFF4",
  ],
}
```

### Light Truecolor

Clean, airy. Lighter palette colors.

```typescript
const lightTruecolor: Theme = {
  name: "light-truecolor",
  dark: false,

  primary: "#0056B3",        // strong blue
  link: "#0066CC",           // slightly brighter
  control: "#3380CC",        // @ 70% toward white

  selected: "#B8D4E8",       // light blue tint
  selectedfg: "#1A1A1A",     // near-black
  focusring: "#0066CC",      // blue

  text: "#1A1A1A",           // near-black
  text2: "#4A4A4A",          // 70%
  text3: "#8A8A8A",          // 45%
  text4: "#B0B0B0",          // 30%

  bg: "#FFFFFF",             // white
  raisedbg: "#F5F5F5",       // just off-white
  separator: "#E0E0E0",      // light gray

  error: "#D32F2F",
  warning: "#F57C00",
  success: "#388E3C",

  palette: [
    "#1A1A1A", "#D32F2F", "#388E3C", "#F57C00",
    "#1976D2", "#7B1FA2", "#0097A7", "#757575",
    "#424242", "#E53935", "#43A047", "#FB8C00",
    "#1E88E5", "#8E24AA", "#00ACC1", "#BDBDBD",
  ],
}
```

## Theme Generation: One Knob

Implemented in `themex` (`vendor/beorn-themex/src/derive.ts` and `generate.ts`).
A complete theme is generated from 3 inputs:

```typescript
function generateTheme(primary: string, dark: boolean, tier: "ansi16" | "truecolor"): Theme
```

### Derivation Rules (ANSI 16)

Given `primary` and `dark`:

```
── Brand (derived from primary) ──────────────────────────────────────
link        = bright variant of primary (e.g., yellow → yellowBright)
control     = primary (rendered with dimColor by consumers for subtlety)
warning     = primary (context disambiguates — always paired with icon)

── Selection (contrasting hue, auto-picked) ──────────────────────────
selected    = cyan   if primary is warm (yellow, red, magenta, green)
              yellow if primary is cool (cyan, blue)
selectedfg  = black  (always dark on selection bg)

── Fixed ─────────────────────────────────────────────────────────────
focusring   = blueBright (accessibility — never changes)
error       = redBright (dark) / red (light)
success     = greenBright (dark) / green (light)

── Text (derived from dark/light) ────────────────────────────────────
text        = whiteBright (dark) / black (light)
text2       = white (dark) / blackBright (light)
text3       = gray (dark) / gray (light)
text4       = gray + dimColor (dark) / gray + dimColor (light)

── Surface (derived from dark/light) ─────────────────────────────────
bg          = "" (terminal default)
raisedbg    = black (dark) / white (light)
separator   = gray + dimColor
```

### Derivation Rules (Truecolor)

Given `primary` (hex) and `dark`:

```
── Brand (opacity/lightness derivation) ──────────────────────────────
link        = primary lightened 5%
control     = primary @ 70% opacity
warning     = primary (or orange if primary is too close to yellow)

── Selection (30% opacity tint) ──────────────────────────────────────
selected    = contrasting hue @ 30% opacity over bg
selectedfg  = auto-contrast (WCAG AA against selected)

── Text (opacity cascade from text base) ─────────────────────────────
text        = #ECEFF4 (dark) / #1A1A1A (light)
text2       = text @ 85%
text3       = text @ 50%
text4       = text @ 30%

── Surface (lightness cascade from bg) ───────────────────────────────
bg          = detected via OSC 11, or #2E3440 (dark) / #FFFFFF (light)
raisedbg    = bg lightened 5% (dark) / bg darkened 3% (light)
separator   = text @ 20%
```

### Primary Color Presets (ANSI 16)

The user cycles through these. Each generates a full theme:

```
  yellow*    → link=yellowBright,  selected=cyan,   warning=yellow
  cyan       → link=cyanBright,    selected=yellow,  warning=cyan
  magenta    → link=magentaBright, selected=cyan,    warning=magenta
  green      → link=greenBright,   selected=cyan,    warning=green
  red        → link=redBright,     selected=cyan,    warning=red
  blue       → link=blueBright,    selected=yellow,  warning=blue
  white      → link=whiteBright,   selected=cyan,    warning=white
```

### View Settings Integration

The view settings panel (accessible via keybinding) shows:

```
THEME
  Mode ........... dark / light
  Colors ......... ANSI 16 / truecolor / auto
  Primary ........ ● yellow  ○ cyan  ○ magenta  ○ green  ...
```

`auto` detects terminal capability (COLORTERM=truecolor → truecolor, else ANSI 16).
Settings are persisted in the vault's `.km/settings.json`.

## Migration from Current System

### Token Mapping

| Old (km.*)              | New Token    | Notes                                  |
|-------------------------|-------------|----------------------------------------|
| `km.selectionBg`        | `$selected`  | Promoted to theme token                |
| `km.selectionFg`        | `$selectedfg`| Promoted to theme token                |
| `km.selectionDim`       | `$selected` + opacity | Unfocused = parent opacity   |
| `km.inputFocusRing`     | `$focusring` | Promoted to theme token                |
| `km.cardBorderEditing`  | `$focusring` | Same as focus ring (editing = focused) |
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
| `km.dialogInputBorder`  | `$focusring` | Input border = focus ring              |
| `km.dialogShortcut`     | `$control`   | Shortcut hints = interactive chrome    |
| `km.helpSectionHeading` | `$primary`   | Help headings = brand color (bold)     |
| `km.helpKey`            | `$control`   | Help keys = interactive chrome         |

After migration, `km` constants reduce from ~25 to **0** — all colors come from
theme tokens. The `km` object and `theme.ts` in km-tui are deleted.

### inkx Default: Box borderColor = $separator

When `borderStyle` or `outlineStyle` is set but no explicit `borderColor`/`outlineColor`
is provided, inkx resolves the color to `$separator` from the active theme. This
eliminates the need to specify `borderColor` on every bordered element.

```tsx
{/* Before: explicit color needed */}
<Box borderStyle="single" borderColor={km.dialogBorder}>

{/* After: automatic from theme */}
<Box borderStyle="single">
```

### Help Dialog Color Spec

```
┌─ Keyboard Shortcuts ────────────── ? ─┐
│                                        │  border: $separator (auto)
│ NAVIGATION ────────────────────────    │  title: $text (bold)
│ j ····························down     │  hotkey badge: $control
│ k ······························up     │  section heading: $primary (bold)
│ g·i ······················go inbox     │  heading dashes: $text4
│                                        │  keys: $control
│ SHORTCUTS ─────────────────────────    │  dot leaders: $text4
│             go to   move   add/link    │  descriptions: $text2
│ prefix key  g or ⌃g m or ⌃m a or ⌃l   │  chord dots: $text3
│ i inbox     gi      mi     ai          │  "/" separator: $text3
│ j journal   gj      ·      ·          │  grid col headers: $primary (bold)
│                                        │  "or" text: $text3
│ Esc to close                   ↑j/k↓  │  grid location key: $control
└────────────────────────────────────────┘  grid location label: $text2
                                            grid empty "·": $text4
                                            footer: $text3
                                            scroll hint: $text3
                                            dialog bg: $surface
```

### Theme Interface Changes (now in themex)

The `Theme` interface (now in `themex`) has 19 semantic tokens + palette. inkx imports
`Theme`, `resolveThemeColor`, and theme state management from `"themex"`.

| Token         | Purpose                                    |
|---------------|-------------------------------------------|
| `link`        | Hyperlinks (was implicit via `primary`)    |
| `control`     | Interactive chrome (was implicit)          |
| `selected`    | Selection bg (was app-level)               |
| `selectedfg`  | Selection text (was app-level)             |
| `focusring`   | Focus outline (was app-level)              |
| `text2`       | Secondary text (was `muted`)               |
| `text3`       | Tertiary text (new)                        |
| `text4`       | Quaternary text (new)                      |
| `raisedbg`    | Elevated surface bg (`$surface` is alias)  |
| `palette`     | 16 content colors (new)                    |

Renamed (old names available as aliases via `resolveThemeColor`):
- `$accent` → `$primary`
- `$muted` → `$text2`
- `$surface` → `$raisedbg`
- `$background` → `$bg`
- `$border` → `$separator`

## Implementation Plan

### Phase 0: Color Utilities — DONE (vendor/beorn-themex)

Extracted to `themex` package (`vendor/beorn-themex/src/color.ts`).

1. ~~Add OKLCH conversion utilities (`toOKLCH`, `fromOKLCH`)~~
2. ~~Implement `blend()`, `brighten()`, `darken()`, `contrastFg()`, `isWarm()`~~
3. ~~Implement `brightVariant()` using Catppuccin OKLCH formula~~
4. ~~Unit tests for all color math~~

### Phase 1: ThemePalette + deriveTheme() — DONE (vendor/beorn-themex)

Extracted to the `themex` package (`vendor/beorn-themex/`, importable as `"themex"`).
ThemePalette and deriveTheme now live in `themex`. inkx imports from `"themex"`.

Built-in palettes (17 total): Catppuccin (Mocha, Frappe, Macchiato, Latte), Nord,
Dracula, Solarized (Dark, Light), Tokyo Night (Night, Storm, Day), One Dark,
Gruvbox (Dark, Light), Rose Pine (Main, Moon, Dawn).

1. ~~Add `ThemePalette` interface~~ → `themex/src/types.ts`
2. ~~Implement `deriveTheme(palette, opts)` → `Theme`~~ → `themex/src/derive.ts`
3. ~~Define built-in `ThemePalette` values~~ → `themex/src/palettes/` (17 palettes)
4. `$surface` is a backward-compat alias for `$raisedbg` (the canonical field name)
5. ~~Update `resolveThemeColor()` with aliases~~ → `themex/src/resolve.ts`
6. ~~Derive built-in themes from the palettes~~ → `themex/src/palettes/index.ts`
7. ~~Update `generateTheme()`~~ → `themex/src/generate.ts`
8. ~~Update docs~~ → `vendor/beorn-themex/CLAUDE.md`

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
5. Show opacity/dimming demo (normal → dim → ghost)

### Phase 4: Tests

1. Test `deriveTheme()` produces valid themes for all built-in palettes
2. Test OKLCH bright variants are perceptually correct
3. Test `blend()` / `contrastFg()` edge cases
4. Update all test helpers to use new theme
5. Test theme switching doesn't break layout
6. Snapshot tests for storybook sections

## ThemePalette: Cross-Platform Color Input

The `ThemePalette` is the universal input a theme author provides. From it, all semantic
tokens are derived. The same palette works across terminal, web, and native.

Defined in `themex` (`vendor/beorn-themex/src/types.ts`). See `vendor/beorn-themex/CLAUDE.md`
for the full API reference.

### Architecture: Three Layers

```
Layer 1: ThemePalette (theme author provides — 14 colors)
  Surface ramp: crust, base, surface, overlay, subtext, text
  Accent hues:  red, orange, yellow, green, teal, blue, purple, pink

Layer 2: Theme (app uses in JSX — 19 semantic tokens + palette)
  Derived from ThemePalette via deriveTheme()

Layer 3: Platform binding (automatic)
  Terminal: resolveThemeColor() → ANSI name or hex
  Web:      Theme → CSS custom properties (--km-primary, --km-text, etc.)
  Native:   Theme → UIColor / SwiftUI Color
```

### ThemePalette Interface

14 colors + 2 metadata fields. Surface ramp (crust/base/surface/overlay/subtext/text) +
8 accent hues (red/orange/yellow/green/teal/blue/purple/pink). Full definition in
`vendor/beorn-themex/src/types.ts`.

### How Popular Themes Map to ThemePalette

```
                    crust    base     surface  overlay  subtext  text
Catppuccin Mocha    #11111B  #1E1E2E  #313244  #6C7086  #A6ADC8  #CDD6F4
Nord                #2E3440  #2E3440  #3B4252  #4C566A  #D8DEE9  #ECEFF4
Dracula             #21222C  #282A36  #44475A  #6272A4  #6272A4  #F8F8F2
Solarized Dark      #002B36  #073642  #586E75  #657B83  #839496  #FDF6E3
Tokyo Night         #1A1B26  #24283B  #292E42  #545C7E  #A9B1D6  #C0CAF5
One Dark            #21252B  #282C34  #2C313A  #5C6370  #ABB2BF  #ABB2BF

                    red      orange   yellow   green    teal     blue     purple   pink
Catppuccin Mocha    #F38BA8  #FAB387  #F9E2AF  #A6E3A1  #94E2D5  #89B4FA  #CBA6F7  #F5C2E7
Nord                #BF616A  #D08770  #EBCB8B  #A3BE8C  #8FBCBB  #5E81AC  #B48EAD  #B48EAD
Dracula             #FF5555  #FFB86C  #F1FA8C  #50FA7B  #8BE9FD  #BD93F9  #BD93F9  #FF79C6
Solarized           #DC322F  #CB4B16  #B58900  #859900  #2AA198  #268BD2  #6C71C4  #D33682
```

### Derivation: ThemePalette → Theme

Implemented in `themex` (`vendor/beorn-themex/src/derive.ts`). The derivation logic maps
palette fields to semantic tokens — primary from the chosen accent hue, links always blue,
text hierarchy from the surface ramp, status from direct hue mapping. See the source for
the full implementation.

### Token Aliases

Defined in `themex` (`vendor/beorn-themex/src/resolve.ts`). The canonical field name for
elevated surfaces is `raisedbg`; `$surface` is a backward-compat alias.

| Alias Token     | Resolves To    |
|-----------------|--------------- |
| `$accent`       | `$primary`     |
| `$muted`        | `$text2`       |
| `$surface`      | `$raisedbg`    |
| `$background`   | `$bg`          |
| `$border`       | `$separator`   |

### Semantic Token Reference

Defined in `themex`. See `vendor/beorn-themex/CLAUDE.md` for the full token list.
The 19 semantic tokens + 16 palette colors are the same as listed at the
[top of this document](#semantic-tokens-19).

### Where Each Token Is Used in km

| Token | UI Elements |
|-------|-------------|
| `$primary` | Active tab dot, board heading, column header (focused), shortcut keys in help, favorite keys |
| `$link` | Inline links, `@board` references, wiki-links |
| `$control` | Keyboard shortcut badges, input borders, chord hint keys |
| `$selected` | Cursor row background, selected card bg, picker selected row |
| `$selectedfg` | Text on cursor row, text on selected items |
| `$focusring` | Focused pane border, editing card border, active input outline |
| `$text` | Node titles, body text, fold markers, column headers |
| `$text2` | Node descriptions, metadata labels, unfocused column headers |
| `$text3` | Child counts, timestamps, dot leaders, chord separators, footer hints |
| `$text4` | Ghost fold dots, empty column placeholders, grid empty cells |
| `$bg` | Main background (usually terminal default) |
| `$raisedbg` (`$surface`) | Dialog/modal background, picker dropdown, tooltip bg |
| `$separator` | All borders (auto-default), divider lines, column separators |
| `$chromebg` | Status bar bg, title bar bg (inverted) |
| `$chromefg` | Status bar text, title bar text (inverted) |
| `$error` | Overdue dates, P0/P1 priority, blocked status, validation errors, broken embeds |
| `$warning` | In-progress status (WIP icon), unsaved indicator, P2 priority |
| `$success` | Done status (checkmark), actionable dates, start dates |
| `$color0`–`$color15` | Board-specific colors, tag colors, calendar event colors |

### M3 Mapping Summary

How our tokens relate to M3 roles:

| M3 Role | Our Token | Notes |
|---------|-----------|-------|
| Primary | `$primary` | Same concept — the brand accent |
| On Primary | `$selectedfg` | Text on primary-colored backgrounds |
| Secondary | `$control` | M3 secondary = desaturated primary. Our control = muted accent for chrome |
| Tertiary | `$focusring` / `$selected` | M3 tertiary = rotated hue. Our selection + focus use a contrasting hue |
| Error | `$error` | Direct match |
| Surface | `$bg` / `$raisedbg` | M3 has surface + surface container. We have bg + raisedbg |
| On Surface | `$text` / `$text2` | Direct match |
| Outline | `$separator` | Direct match |

### Cross-Platform Binding

The same `ThemePalette` + `deriveTheme()` (from `themex`) produces a `Theme` that binds to any platform:

**Terminal** (current):
```typescript
// resolveThemeColor("$primary", theme) → "yellow" or "#EBCB8B"
<Text color="$primary">Hello</Text>
```

**Web** (future):
```css
:root {
  --km-primary: #EBCB8B;
  --km-text: #ECEFF4;
  --km-surface: #3B4252;
  /* ... all 19 tokens */
}
```
```html
<span style="color: var(--km-primary)">Hello</span>
```

**Native** (future):
```swift
extension Color {
  static let kmPrimary = Color("primary")  // from asset catalog
  static let kmText = Color("text")
}
Text("Hello").foregroundColor(.kmPrimary)
```

## Color Manipulation Utilities

Implemented in `themex` (`vendor/beorn-themex/src/color.ts`). Operates in OKLCH for
perceptual uniformity. Core functions: `blend()`, `brighten()`, `darken()`, `contrastFg()`,
`isWarm()`, `brightVariant()`. See the source for details.

## Design Influences

Research on existing theme systems — what we learned and what we adopted.

### Systems Compared

| System | Architecture | Tokens | Key Innovation |
|--------|-------------|--------|----------------|
| **Catppuccin** | 26-color palette → port applies | 26 | OKLCH bright derivation, cross-app consistency |
| **oh-my-pi** | `vars` palette → `colors` semantic → component interfaces | 66 | Two-layer indirection, color-blind mode, symbol theming |
| **Charm/lipgloss** | CompleteAdaptiveColor (6 values per token) | Per-component | Dark/light × truecolor/256/16 adaptive, color utilities |
| **oh-my-posh** | Palette refs (`p:name`) + template conditionals | ~20 | Decorator chain, conditional palettes |
| **Omarchy (DHH)** | 22 tokens in `colors.toml` → cross-app config generation | 22 | Config generation pipeline (Neovim, tmux, bat, lazygit) |
| **Zed** | 150+ tokens with state variants | 150+ | Hover/active/disabled per token, 24 terminal colors |
| **Apple HIG** | ONE accent + opacity cascade | ~20 | Text hierarchy via opacity, system palette |
| **Material Design 3** | HCT color space, one seed color | ~25 roles | Primary/secondary/tertiary from hue rotation |

### What We Adopted

**From Catppuccin**: Surface ramp naming (crust/base/surface/overlay/subtext/text) — widely
recognized, self-explanatory. OKLCH bright variant formula for perceptually correct derivation.
Dark/light palette flip for ANSI 16 color0/7/8/15.

**From oh-my-pi**: Two-layer indirection pattern (`ThemePalette` → `Theme`). This is the core
architectural insight — theme authors provide raw colors, the system derives semantic tokens.
Validates our exact architecture. Their 66 tokens are too many (UI-framework-specific tokens
like `input_border_active_hover`); our 19 semantic tokens + 16 palette = 35 total is the right
level of abstraction.

**From Apple HIG**: Text hierarchy via opacity cascade (text → text2 → text3 → text4 as
decreasing opacity of the same base color). ONE user-chosen accent color, not multiple accent
families.

**From Charm/lipgloss v2**: Color manipulation utilities as first-class API (`Darken`, `Lighten`,
`Alpha`). We adopt `blend()`, `brighten()`, `darken()`, `contrastFg()` as core utilities.
The `CompleteAdaptiveColor` pattern (dark/light × tier = 6 values per token) validates our
progressive enhancement approach.

**From Omarchy**: Cross-app config generation from a single source. Our `ThemePalette` →
`deriveTheme()` is the same idea — one palette input, automatic derivation for any platform.
The 22-token system (6 semantic + 16 ANSI) is too minimal for a rich TUI; we need text hierarchy
and chrome tokens. But the "generate configs for Neovim, tmux, bat, lazygit" pipeline is a
future direction (generate Ghostty theme, Neovim colorscheme, tmux status line from one palette).

### What We Rejected

**M3's secondary/tertiary accent tokens**: Over-engineered for TUIs. Our content palette
($color0–$color15) provides multi-color categorization; brand tokens ($primary/$link/$control)
provide accent variation; status tokens cover semantic colors. No need for hue-rotated secondary
and tertiary accent families.

**Zed's 150+ tokens with state variants**: Too granular. `input_border_active_hover` vs
`input_border_active` vs `input_border` — this level of specificity belongs in CSS, not in a
theme interface. TUI components have fewer states than web components.

**oh-my-pi's component interfaces**: Interesting (components declare color needs via interfaces),
but premature for us. Our components use `$token` strings directly — adding a typed interface
layer adds complexity without proportional benefit at our scale.

**oh-my-pi's 66 tokens**: Too many. Many are component-specific (`breadcrumb_active_fg`,
`tab_close_hover_bg`) which couples the theme interface to UI implementation details. Our 19
semantic tokens are UI-agnostic — any component can use `$primary`, `$text2`, `$separator`.

### Cross-Theme Palette Comparison

| Theme | Base/Surface | Accent Hues | Status | Total | Primary Accent? |
|-------|-------------|-------------|--------|-------|----------------|
| **Catppuccin** | 12 (3 bg + 3 surface + 3 overlay + 2 subtext + text) | 14 | 4 (from accents) | 26 | No (port chooses) |
| **Dracula** | 7 (bg ×5, fg, selection) | 7 (R/O/Y/G/C/Pu/Pk) | 5 (functional UI) | ~15 | No (peers) |
| **Nord** | 7 (4 Polar Night + 3 Snow Storm) | 9 (4 Frost + 5 Aurora) | 3 (from Aurora) | 16 | Yes (nord8 blue) |
| **Solarized** | 8 (symmetric base03–base3) | 8 (YORGMVBC) | 0 (informal) | 16 | No (equals) |
| **Tokyo Night** | ~15 (7 bg + 5 fg + neutrals) | ~16 (7 blues + 9 others) | 4 (error/warn/info/hint) | ~55 | Yes (blue) |
| **One Dark** | 5 (bg + 3 mono + accent) | 8 (hue-1 through hue-6-2) | 0 (informal) | ~13 | Yes (syntax-accent) |
| **themex** | 6 (crust/base/surface/overlay/subtext/text) | 8 (R/O/Y/G/T/B/Pu/Pk) | 3 (error/warning/success) | 14 | Yes (user-chosen) |

### Key Insights

1. **Every theme defines the same two layers**: raw palette (hues + neutrals) → semantic mapping
2. **Universal hue set**: red, orange, yellow, green, teal, blue, purple, pink — present in every theme
3. **Surface ramp**: 6–12 levels. 6 is sufficient (Solarized, Nord prove this); more granularity adds complexity without proportional benefit
4. **Status colors**: error=red, warning=orange/yellow, success=green is universal
5. **Terminal emulators expose 16 ANSI + fg/bg/cursor/selection** — the universal baseline
6. **Two-layer indirection** (palette → semantic) is the dominant pattern across all mature systems
7. **OKLCH** is the right color space for derivation (perceptually uniform, unlike RGB/HSL)
8. **35 tokens is the sweet spot** — enough for rich TUIs, few enough to maintain

## Hardcoded Color Migration

~160 hardcoded color names across ~28 view files need migration to `$token` references.

### What to Remove

- **GTD board colors** (`GTD_BOARD_COLORS` in `apps/km-tui/src/text/colors.ts`): Template-specific. Board colors should come from content palette (`$color0`–`$color15`).
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

1. Status colors (red/green/yellow for task states) → `$error`/`$success`/`$warning`
2. Text hierarchy (white/gray/dim variations) → `$text`/`$text2`/`$text3`/`$text4`
3. Interactive elements (cyan/blue for links, borders) → `$primary`/`$link`/`$control`
4. Categorization colors (per-board, per-tag) → `$color0`–`$color15`
5. Chrome/surface colors (bg, borders) → `$bg`/`$surface`/`$separator`

## Future: Cross-App Theme Generation

Inspired by Omarchy's config generation pipeline, a single `ThemePalette` could generate
themed configs for the user's entire terminal environment:

```
palette.toml → deriveTheme() → ghostty.conf    (terminal theme)
                              → neovim.lua      (colorscheme)
                              → tmux.conf       (status line colors)
                              → bat-theme.tmTheme (syntax highlighting)
                              → lazygit.yml     (git TUI colors)
```

This is out of scope for v2 but the `ThemePalette` interface is designed to support it.
The 14-color input (6 surface + 8 hues) is expressive enough to generate any of these configs.
