# `@silvery/ansi` — Terminal styling

Theme-aware terminal styling with a chalk-compatible chainable API. Use it for CLI output (spinners, log lines, progress bars) that respects terminal color capabilities and resolves Sterling `$`-tokens — no React required.

## Quick Start

```ts
import { style, createStyle } from "@silvery/ansi"
import { design, schemes } from "silvery"

// Global, no theme — sensible ANSI defaults
style.bold.red("Error!")
style["fg-accent"]("Deploy")

// Custom, with Sterling Theme
const theme = design.deriveFromScheme(schemes.nord)
const s = createStyle({ theme })
s["fg-accent"]("deploy")                // hex from theme["fg-accent"]
s["fg-on-error"]("!")                   // hex from theme["fg-on-error"]
s.bold["fg-error"]("FAIL")
```

## `createStyle()`

Returns a chainable, callable style object.

```ts
function createStyle(options?: StyleOptions): Style

interface StyleOptions {
  /** Color level override. Auto-detected from terminal if omitted. */
  level?: "truecolor" | "256" | "basic" | null
  /** Sterling Theme for $-token resolution. */
  theme?: Theme
}
```

| Option  | Default       | Notes                                                      |
|---------|---------------|-------------------------------------------------------------|
| `level` | auto-detect   | `null` disables all color                                   |
| `theme` | `undefined`   | Any object matching Sterling's flat-token shape (`theme["fg-accent"]` etc) |

When `level` is omitted, `createStyle()` auto-detects from `process.stdout`, respecting `NO_COLOR` and `FORCE_COLOR`.

## Global `style`

Pre-configured singleton with auto-detected color level and no theme:

```ts
import { style } from "@silvery/ansi"

style.bold("Important")
style.red("Error")
style["fg-accent"]("Deploy")     // falls back to yellow (no theme set)
```

## Chainable API

Every property returns a new `Style`; call with text to apply.

```ts
const s = createStyle()

s.bold("text")                   // bold
s.dim("text")                    // dim
s.bold.italic("text")            // bold + italic
s.bold.underline.red("text")     // bold + underline + red
```

### Modifiers

| Property        | SGR Open | SGR Close | Description    |
|-----------------|----------|-----------|----------------|
| `bold`          | 1        | 22        | Bold           |
| `dim`           | 2        | 22        | Faint / dim    |
| `italic`        | 3        | 23        | Italic         |
| `underline`     | 4        | 24        | Underline      |
| `inverse`       | 7        | 27        | Swap fg/bg     |
| `hidden`        | 8        | 28        | Hidden         |
| `strikethrough` | 9        | 29        | Strikethrough  |

### Foreground colors

Standard ANSI 16:

| Property        | Code | Color          |
|-----------------|------|----------------|
| `black`         | 30   | Black          |
| `red`           | 31   | Red            |
| `green`         | 32   | Green          |
| `yellow`        | 33   | Yellow         |
| `blue`          | 34   | Blue           |
| `magenta`       | 35   | Magenta        |
| `cyan`          | 36   | Cyan           |
| `white`         | 37   | White          |
| `blackBright`   | 90   | Bright black   |
| `gray` / `grey` | 90   | Gray (alias)   |
| `redBright`     | 91   | Bright red     |
| `greenBright`   | 92   | Bright green   |
| `yellowBright` | 93   | Bright yellow  |
| `blueBright`    | 94   | Bright blue    |
| `magentaBright` | 95   | Bright magenta |
| `cyanBright`    | 96   | Bright cyan    |
| `whiteBright`   | 97   | Bright white   |

### Background colors

Same names prefixed with `bg` — `bgRed`, `bgBlueBright`, etc.

### Arbitrary colors

```ts
s.hex("#ff6347")("Tomato")
s.bgHex("#1e1e2e")("Dark bg")
s.rgb(255, 99, 71)("Tomato")
s.bgRgb(30, 30, 46)("Dark bg")
s.ansi256(196)("Bright red")
s.bgAnsi256(17)("Navy bg")
```

## Sterling `$`-token resolution

When a Theme is supplied, any Sterling flat-token key resolves to its hex:

```ts
const s = createStyle({ theme })

s["fg-accent"]("Deploy")              // theme["fg-accent"] → hex → ANSI
s["fg-error"]("Failed!")
s["fg-success"]("Passed")
s["fg-muted"]("(3 files)")
s["fg-warning"]("Caution")
s["fg-info"]("Note")
s["bg-accent"]("     ")               // background from bg-accent
s.bold["fg-accent"]("DEPLOY")         // chain modifiers with tokens
```

### Fallbacks without a Theme

Each Sterling token has a sensible ANSI fallback when no Theme is set:

| Token          | Without theme (fallback)   | With theme                      |
|----------------|-----------------------------|----------------------------------|
| `fg-accent`    | yellow (33)                 | `theme["fg-accent"]` as hex      |
| `fg-info`      | cyan (36)                   | `theme["fg-info"]` as hex        |
| `fg-success`   | green (32)                  | `theme["fg-success"]` as hex     |
| `fg-warning`   | yellow (33)                 | `theme["fg-warning"]` as hex     |
| `fg-error`     | red (31)                    | `theme["fg-error"]` as hex       |
| `fg-muted`     | dim (SGR 2)                 | `theme["fg-muted"]` as hex       |
| `border-default`| gray (90)                  | `theme["border-default"]` as hex |
| `border-focus` | blue (34)                   | `theme["border-focus"]` as hex   |

CLI tools get reasonable colors even without configuring a theme.

### `resolve()`

Programmatically resolve a token:

```ts
const s = createStyle({ theme })

s.resolve("fg-accent")             // "#EBCB8B"
s.resolve("$fg-accent")            // same ($ prefix accepted)
s.resolve("$color0")               // theme.palette[0]
s.resolve("$bg-surface-subtle")    // theme["bg-surface-subtle"]
```

## Color level degradation

| Level       | Hex / RGB handling                                |
|-------------|----------------------------------------------------|
| `truecolor` | `38;2;R;G;B` — exact color                         |
| `256`       | `38;5;N` — nearest in 6×6×6 cube                   |
| `basic`     | `30`–`37` / `90`–`97` — nearest ANSI slot          |
| `null`      | All styling stripped, plain text                   |

Truecolor → 256 uses the 6×6×6 color cube (indices 16–231) and the 24-shade gray ramp (232–255). 256 → basic uses Euclidean distance in RGB against ANSI 16.

### Forcing a level

```ts
createStyle({ level: "truecolor" })
createStyle({ level: null })          // no color (tests, file output)
createStyle({ level: "basic" })       // force ANSI 16
```

### Chalk-compatible `level`

```ts
const s = createStyle()
s.level                                // 0=none, 1=basic, 2=256, 3=truecolor
s.level = 0                            // disable color
s.level = 3                            // force truecolor
```

## Palette primitives

Direct access to the OKLCH math and derivation primitives:

```ts
import { bakeFlat, pickColorLevel, quantizeHex } from "@silvery/ansi"
```

### `bakeFlat(theme, rule?)`

Write flat-form keys alongside a nested Theme. DesignSystem authors wire this in via `defineDesignSystem()`; you only call it directly for tooling or custom pipelines.

```ts
bakeFlat(nestedTheme)                    // Sterling default rule
bakeFlat(nestedTheme, customRule)        // custom FlattenRule
```

See [Custom Tokens](/guide/custom-tokens#designsystem-contract) for `FlattenRule`.

### `pickColorLevel(theme, tier)`

Pre-quantize a whole Theme for a target tier:

```ts
pickColorLevel(theme, "truecolor")     // pass-through
pickColorLevel(theme, "256")           // every leaf → nearest 256
pickColorLevel(theme, "basic")         // every leaf → nearest ANSI-16 name
```

Use when mounting: quantize once, render many times.

### `quantizeHex(hex, tier)`

Single-color tier quantization:

```ts
quantizeHex("#88C0D0", "256")          // nearest 256
quantizeHex("#88C0D0", "basic")        // nearest ANSI name
```

## Template literals

```ts
const name = "world"
s.bold`Hello, ${name}!`                 // bold "Hello, world!"
s.red`Error: ${code}`                   // red with interpolation
```

## Examples

### CLI progress

```ts
import { style } from "@silvery/ansi"

console.log(style.bold("Building..."))
console.log(style["fg-success"]("  ✓ Compiled 42 files"))
console.log(style["fg-warning"]("  ⚠ 3 warnings"))
console.log(style["fg-error"]("  ✗ 1 error"))
console.log(style.dim("  Duration: 1.2s"))
```

### Theme-aware status line

```ts
import { createStyle } from "@silvery/ansi"
import { design, schemes } from "silvery"

const theme = design.deriveFromScheme(schemes.nord)
const s = createStyle({ theme })

function statusLine(branch: string, files: number, errors: number) {
  const parts = [
    s["fg-accent"](` ${branch} `),
    s["fg-muted"](` ${files} files`),
    errors > 0
      ? s["fg-error"](` ${errors} errors`)
      : s["fg-success"](" clean"),
  ]
  return parts.join(s["fg-muted"](" | "))
}
```

### Migrating from chalk

`@silvery/ansi` is a drop-in replacement for most chalk usage:

```ts
// Before (chalk)
import chalk from "chalk"
chalk.bold.red("Error!")
chalk.hex("#818cf8")("Indigo")

// After
import { createStyle } from "@silvery/ansi"
const s = createStyle()
s.bold.red("Error!")
s.hex("#818cf8")("Indigo")
```

The main differences: `createStyle()` returns a new instance each time (no global state) and Sterling tokens are available as chainable properties.

## See also

- [Theming](/guide/theming) — how to set up a Theme for CLI output.
- [Styling](/guide/styling) — the ten principles for silvery UI.
- [Sterling](/guide/sterling) — default design system.
- [`@silvery/design` reference](/reference/theme) — Theme type + DesignSystem.
- [Migrate from Chalk](/getting-started/migrate-from-chalk).

<!-- TODO: verify after 0.19.0 ships — confirm `s["fg-accent"]` bracket notation works (vs camelCased `fgAccent`), exact fallback table, `bakeFlat` / `pickColorLevel` export paths. -->
