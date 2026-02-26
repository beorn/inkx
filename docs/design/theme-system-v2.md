# Theme System v2: Semantic Tokens + Progressive Enhancement

> Design spec for km-tui.theme-system (P1)

## Goals

1. **Semantic tokens** with simple English names, inspired by Apple HIG
2. **Progressive enhancement**: ANSI 16 baseline → 256-color → truecolor
3. **Configurable primary color** (cycle through palette)
4. **Dark + light themes**, each with ANSI 16 and truecolor variants
5. **Inherited opacity** for pane dimming and ghost cards
6. **View settings UI** to switch themes live
7. **Storybook** visualizes all themes and tokens in use

## Token System

### Semantic Tokens (17)

Components reference tokens with `$` prefix: `color="$primary"`, `borderColor="$separator"`.

```
── Brand ─────────────────────────────────────────────────────────────
$primary        Brand tint, active indicators, interactive controls
$link           Hyperlinks, references (derived from primary)
$control        Interactive chrome, input borders (derived from primary)

── Selection ─────────────────────────────────────────────────────────
$selected       Selection highlight background
$selectedfg     Text on selected background (contrast-paired)
$focusring      Keyboard focus outline (always blue — accessibility)

── Text ──────────────────────────────────────────────────────────────
$text           Primary content — headings, body
$text2          Secondary — descriptions, metadata
$text3          Tertiary — timestamps, hints, placeholders
$text4          Quaternary — ghost text, watermarks, barely visible

── Surface ───────────────────────────────────────────────────────────
$bg             Default background (detected or configured)
$raisedbg       Elevated surfaces — dialogs, overlays, popovers
$separator      Dividers, borders, rules

── Status ────────────────────────────────────────────────────────────
$error          Destructive, overdue, validation errors
$warning        Caution, unsaved changes
$success        Positive, completed, saved
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
  raisedbg: string
  separator: string

  // Status
  error: string
  warning: string
  success: string

  // Content palette (16 indexed colors)
  palette: string[]
}
```

## Themes

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
| `km.overlayBg`          | `$raisedbg`  | Overlay background = raised surface    |
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
                                            dialog bg: $raisedbg
```

### inkx Theme Interface Changes

The inkx `Theme` interface expands from 10 to 17 semantic tokens + palette:

| Added Token   | Purpose                                    |
|---------------|-------------------------------------------|
| `link`        | Hyperlinks (was implicit via `primary`)    |
| `control`     | Interactive chrome (was implicit)          |
| `selected`    | Selection bg (was app-level)               |
| `selectedfg`  | Selection text (was app-level)             |
| `focusring`   | Focus outline (was app-level)              |
| `text2`       | Secondary text (was `muted`)               |
| `text3`       | Tertiary text (new)                        |
| `text4`       | Quaternary text (new)                      |
| `raisedbg`    | Elevated surface bg (was `surface`)        |
| `palette`     | 16 content colors (new)                    |

Removed/renamed:
- `accent` → removed (absorbed into `primary`)
- `muted` → renamed to `text2`
- `surface` → renamed to `raisedbg`
- `background` → renamed to `bg`
- `border` → renamed to `separator`

## Implementation Plan

### Phase 1: inkx Theme Interface (vendor/beorn-inkx)

1. Update `Theme` interface in `theme-defs.ts` with new 17 tokens + palette
2. Update `resolveThemeColor()` for new token names + palette ($color0-$color15)
3. Create 4 built-in themes (dark/light × ANSI16/truecolor)
4. Add `generateTheme(primary, dark, tier)` function
5. Backward compat: alias old token names (`$accent` → `$primary`, `$muted` → `$text2`, etc.)
6. Default Box borderColor/outlineColor to `$separator` when style is set but color is not
7. Add `opacity` prop to Box (ANSI 16: dimColor inheritance)
8. Update inkx docs

### Phase 2: km-tui Migration (apps/km-tui)

1. Replace all `km.*` constants with `$token` references across views
2. Delete `apps/km-tui/src/theme.ts` (km constants file)
3. Update `tui.tsx` ThemeProvider to use new themes
4. Add primary color cycling to view settings
5. Add theme switching (dark/light, ANSI16/truecolor) to view settings
6. Persist theme settings in vault `.km/settings.json`

### Phase 3: Storybook (apps/km-tui/tests/storybook.tsx)

1. Add "Theme Gallery" section showing all tokens with color swatches
2. Add theme switcher (cycle themes with keybinding)
3. Add primary color cycling demo
4. Show same component in all 4 themes side-by-side (if width allows)
5. Show opacity/dimming demo (normal → dim → ghost)

### Phase 4: Tests

1. Update all test helpers to use new theme
2. Test theme switching doesn't break layout
3. Test primary color cycling produces valid themes
4. Test opacity inheritance (ANSI 16 dimColor propagation)
5. Snapshot tests for storybook sections
