---
title: Color Schemes
description: The 22-slot color scheme, Sterling's preservative derivation, and the 84 bundled schemes silvery ships.
---

# Color Schemes

Silvery's color system has two layers:

```
Layer 1:  ColorScheme   →  22 slots (16 ANSI + 6 semantic)   ← what the terminal exposes
Layer 2:  Theme         →  ~50 tokens ($fg-accent, $bg-error, …)  ← what your UI consumes
```

Every token you style with (`$fg-accent`, `$bg-surface-subtle`, …) traces back to a slot in the user's color scheme. Change schemes and the Theme re-derives.

## The ColorScheme shape

`ColorScheme` is framework-agnostic — the same shape iTerm2, Ghostty, Kitty, WezTerm, and every other emulator exposes. Pure hex strings, platform-neutral.

```ts
interface ColorScheme {
  name?: string
  dark?: boolean
  primary?: string      // semantic brand anchor (optional)

  // 16 ANSI slots (ANSI 0-15)
  black: string; red: string; green: string; yellow: string
  blue: string; magenta: string; cyan: string; white: string
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string
  brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string

  // 6 semantic slots
  foreground: string
  background: string
  cursorColor: string             // cursor block / line color
  cursorText: string              // text under the cursor
  selectionBackground: string
  selectionForeground: string
}
```

Values are `#RRGGBB`. This is the same file format Ghostty, WezTerm, and iTerm2 import/export — user-authored schemes work as-is.

## Deriving a Theme

`design.deriveFromScheme(scheme)` turns the 22 slots into a full Sterling Theme (~50 tokens). Every token resolves to a concrete hex — no token is "theme-dependent" at render time.

```ts
import { design, schemes } from "silvery"

const theme = design.deriveFromScheme(schemes.dracula)

theme["fg-accent"]          // "#BD93F9"
theme["fg-muted"]           // "#8B8DA2"  (blend of fg + bg)
theme["bg-error"]           // "#FF5555"  (scheme.red, contrast-verified)
```

Derivation is **OKLCH-native** throughout — blends, lightness adjustments, and hue rotations happen in the perceptually-uniform OKLCH space. Result: tokens look visually balanced regardless of which scheme you start with.

### Default rules (preservative)

Sterling preserves the user's 22 colors and fills gaps:

| Token                 | Derivation                                      |
|-----------------------|-------------------------------------------------|
| `fg-error`            | `scheme.red`                                    |
| `fg-warning`          | `scheme.yellow`                                 |
| `fg-success`          | `scheme.green`                                  |
| `fg-info`             | `scheme.primary` (distinct role, same default hex as accent) |
| `fg-accent`           | `scheme.primary`                                |
| `bg-accent`           | `scheme.primary`                                |
| `bg-accent-hover`     | OKLCH +0.04L on `bg-accent`                     |
| `bg-accent-active`    | OKLCH +0.08L on `bg-accent`                     |
| `fg-on-accent`        | contrast-pick(fg, bg) for WCAG AA against `bg-accent` |
| `fg-muted`            | blend(fg, bg, 0.5)                              |
| `bg-surface-default`  | `scheme.background`                             |
| `bg-surface-subtle`   | blend(bg, fg, 0.05)                             |
| `bg-surface-raised`   | blend(bg, fg, 0.08)                             |
| `bg-surface-overlay`  | blend(bg, fg, 0.12)                             |
| `border-focus`        | `scheme.primary`                                |
| `cursor-bg`           | `scheme.cursorColor`                            |
| `cursor-fg`           | `scheme.cursorText`                             |

Scheme authors can override specific tokens; the OKLCH defaults cover most cases.

### State-variant rules

State variants (`-hover`, `-active`) apply to **interactive-surface tokens**, not to text tokens in general. Only text that is itself interactive (accent / links) gets state variants.

| Token                                 | State variants?                |
|---------------------------------------|--------------------------------|
| `bg-accent`, `bg-error`, `bg-warning`, `bg-success`, `bg-info` | always (hover / active) |
| `bg-surface-*`                         | hover                          |
| `fg-on-<role>`                         | no (fg-on-X text doesn't change when the bg-X under it hovers) |
| `fg-accent`                            | hover / active (interactive text) |
| `fg-error`, `fg-warning`, `fg-success`, `fg-info`, `fg-muted` | no (non-interactive status text) |

### Derivation algorithm — adaptive OKLCH L-shift

```
if baseL > 0.6:   hover = L − 0.04, active = L − 0.08   (darken)
else:             hover = L + 0.04, active = L + 0.08   (brighten)
```

Direction follows the **token's own luminance**, not the scheme's global dark/light flag. This prevents the white-out failure mode on intrinsically light tokens (yellows, light blues) in dark schemes, where a naive upward shift collapses to `#FFFFFF`.

When target L would push past `0.9` or below `0.1`, chroma is reduced proportionally — push toward gray rather than toward the luminance extreme. Hue is preserved.

### Contrast guardrails — tiered

Fixed OKLCH deltas are a default, not a law. They fail on yellow schemes (small L shifts produce invisible differences), low-chroma schemes (Nord's blues can collapse `warning` and `surface.subtle`), and very dark/light accents (±0.04L saturates at endpoints).

Sterling enforces three tiers:

1. **Build-time catalog test (the 84 shipped schemes)** — must pass WCAG AA on every role pair. Failure blocks CI. Catalog authors override specific tokens.
2. **Runtime auto-lift (user schemes)** — if a pair falls below AA, Sterling auto-adjusts via OKLCH L-shifts until it passes. Logged at `debug`, silent by default.
3. **Explicit override** — scheme authors pin specific tokens in the scheme object (`{ red: "#bf616a", "fg-error": "#d08770" }`). Auto-adjust skipped for pinned tokens.

Apps don't worry about contrast — tokens are always legible.

### Selection + cursor visibility

Two independent invariants:

- **selection** — `selectionBackground` must differ from `background` by ΔL ≥ 0.08 (OKLCH). Invisible selections get nudged.
- **cursor** — `cursorColor` must differ from `background` by ΔE ≥ 0.15. Low-contrast cursors are pushed away from bg.

These run alongside WCAG contrast repair.

## The bundled catalog — 84 schemes

Silvery ships 84 color schemes out of the box — the full Catppuccin family, Dracula, Tokyo Night, Gruvbox (dark + light), Nord, Solarized (dark + light), One Dark, Rose Pine (all variants), Kanagawa (wave / dragon / lotus), Everforest, Monokai, Night Owl, Ayu (dark / mirage / light), GitHub Dark / Light, plus terminal defaults (Apple Terminal, Windows Terminal Campbell, GNOME Terminal Tango, xterm, VGA) and silvery's own `silvery-dark` / `silvery-light`.

```ts
import { schemes, listSchemes, getScheme } from "silvery"

listSchemes().length              // 84
schemes.nord                       // direct import
getScheme("catppuccin-mocha")     // lookup by name
```

Browse interactively at [Theme Explorer](/themes).

## Auto-detection via OSC 10/11

Silvery queries the terminal on startup for its scheme via OSC 10/11 (fg/bg), OSC 4 (ANSI palette), and OSC 12 (cursor). If detection succeeds, the user's terminal theme becomes the app's theme. If it fails, silvery falls back to `silvery-dark` or `silvery-light` based on detected background brightness.

```ts
import { detectTermScheme, design, schemes } from "silvery"

const scheme = await detectTermScheme({ fallback: schemes.nord })
const theme = design.deriveFromScheme(scheme)
```

Supported terminals: Ghostty, Kitty, WezTerm, iTerm2, foot, Alacritty, xterm. Falls back gracefully in tmux, CI, and pipes.

### Fingerprint matching

Detection can also match the probed colors against the bundled catalog to return a *named* scheme:

```ts
import { fingerprintMatch, listSchemes } from "silvery"

const match = fingerprintMatch(probedSlots, listSchemes())
if (match) {
  console.log(`Detected: ${match.scheme.name} (${(match.confidence * 100).toFixed(0)}% confidence)`)
}
```

Criteria: total OKLCH ΔE < 30 AND max per-slot ΔE < 8. Both must pass — the per-slot check prevents false positives where most slots match but one wildly differs.

## Authoring your own scheme

Export a `ColorScheme` object:

```ts
// my-scheme.ts
import type { ColorScheme } from "silvery"

export const myScheme: ColorScheme = {
  name: "my-scheme",
  dark: true,
  primary: "#7FB3FF",
  black: "#1A1D23",
  // ... all 16 ANSI slots ...
  foreground: "#D8DCE3",
  background: "#1E2128",
  cursorColor: "#7FB3FF",
  cursorText: "#1E2128",
  selectionBackground: "#3A4350",
  selectionForeground: "#E4E8EF",
}
```

Use it:

```tsx
import { ThemeProvider, design } from "silvery"
import { myScheme } from "./my-scheme"

const theme = design.deriveFromScheme(myScheme)

<ThemeProvider theme={theme}>
  <App />
</ThemeProvider>
```

### Building from fewer colors

If you don't want to fill in all 22 slots, generate the rest from a background + foreground + primary:

```ts
import { fromColors, design } from "silvery"

const scheme = fromColors({
  background: "#0D1117",
  foreground: "#C9D1D9",
  primary: "#58A6FF",
  dark: true,
})
// Returns a full 22-slot ColorScheme; accent ring derived by OKLCH hue rotation.

const theme = design.deriveFromScheme(scheme)
```

Accents are generated by rotating the primary's OKLCH hue through 8 target positions (red, orange, yellow, green, teal, blue, purple, pink) at constant L + C — the ring has equal perceived lightness and chroma.

### Single-color shortcut

For a one-hex-and-done:

```ts
import { design } from "silvery"

const theme = design.deriveFromColor("#5E81AC")              // dark by default
const theme = design.deriveFromColor("#5E81AC", { dark: false })
```

Sterling infers a plausible scheme (fg / bg / accent ring) and derives the Theme.

### Brand overlay

If you have a scheme AND a brand color:

```ts
import { design, schemes } from "silvery"

const theme = design.deriveFromSchemeWithBrand(schemes.nord, "#FF6A00")
// Nord's surfaces + fg/bg intact; $fg-accent / $bg-accent take the brand.
```

## CLI helpers

```bash
bunx silvery theme list                   # show all 84 schemes
bunx silvery theme preview nord           # render a swatch in the terminal
bunx silvery theme detect                 # probe current terminal
```

## See also

- [Sterling](./sterling) — how derivation turns schemes into Themes.
- [Token Taxonomy](./token-taxonomy) — every Sterling token.
- [Theming](./theming) — `ThemeProvider`, nested, runtime swap.
- [Custom Tokens](./custom-tokens) — extending Sterling / publishing a DesignSystem.
- [Theme Explorer](/themes) — browse all 84 schemes.
- [`@silvery/design` reference](/reference/theme) — Theme type, derivation adjustments.

<!-- TODO: verify after 0.19.0 ships — confirm `schemes` barrel shape, `getScheme` / `listSchemes` / `fingerprintMatch` exports, `deriveFromSchemeWithBrand` signature (brand as string vs `{ brand }`). -->
