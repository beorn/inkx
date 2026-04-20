# `@silvery/design` — Theme type & DesignSystem contract

Sterling is silvery's default design system. It lives in `@silvery/design` and ships with `silvery` (re-exported as `design`). This page is the type + API reference; for how to use it, see [Sterling](/guide/sterling) and [Theming](/guide/theming).

## Pipeline

```
ColorScheme (22 slots)
        │
        │  design.deriveFromScheme(scheme)
        ▼
      Theme  ←── flat hyphen keys + nested role objects, same strings
        │
        │  resolveThemeColor("$fg-accent", theme)
        ▼
   hex string  →  ANSI output (colorLevel-quantized at render time)
```

Components never reference raw colors. They use `$`-token strings (`color="$fg-accent"`) that resolve against the active Theme at render time. UI code is decoupled from any specific palette.

## `Theme`

Sterling Theme is an intersection of **flat tokens** and **nested role objects** on the same frozen object.

### Flat form — the everyday surface

About 50 hyphen-keyed string-valued properties:

```ts
interface FlatTokens {
  // fg-*
  "fg": string
  "fg-muted": string
  "fg-disabled": string
  "fg-accent": string
  "fg-accent-hover": string
  "fg-accent-active": string
  "fg-info": string
  "fg-success": string
  "fg-warning": string
  "fg-error": string
  "fg-on-accent": string
  "fg-on-info": string
  "fg-on-success": string
  "fg-on-warning": string
  "fg-on-error": string

  // bg-*
  "bg": string
  "bg-surface-subtle": string
  "bg-surface-raised": string
  "bg-surface-overlay": string
  "bg-surface-subtle-hover": string
  "bg-surface-raised-hover": string
  "bg-accent": string
  "bg-accent-hover": string
  "bg-accent-active": string
  "bg-info": string
  "bg-info-hover": string
  "bg-info-active": string
  "bg-success": string
  "bg-success-hover": string
  "bg-success-active": string
  "bg-warning": string
  "bg-warning-hover": string
  "bg-warning-active": string
  "bg-error": string
  "bg-error-hover": string
  "bg-error-active": string

  // border-*
  "border-default": string
  "border-muted": string
  "border-input": string
  "border-focus": string

  // cursor-*
  "cursor-fg": string
  "cursor-bg": string
}
```

### Nested form — programmatic, typed

About 8 role / category objects, same object as the flat form:

```ts
interface Roles {
  accent:  { fg: string; bg: string; fgOn: string; hover: { fg: string; bg: string }; active: { fg: string; bg: string } }
  info:    { fg: string; bg: string; fgOn: string; hover: { bg: string }; active: { bg: string } }
  success: { fg: string; bg: string; fgOn: string; hover: { bg: string }; active: { bg: string } }
  warning: { fg: string; bg: string; fgOn: string; hover: { bg: string }; active: { bg: string } }
  error:   { fg: string; bg: string; fgOn: string; hover: { bg: string }; active: { bg: string } }
  muted:   { fg: string }
  surface: { default: string; subtle: string; raised: string; overlay: string; hover?: { subtle: string; raised: string } }
  border:  { default: string; muted: string; input: string; focus: string }
  cursor:  { fg: string; bg: string }

  // 16 raw ANSI palette passthrough
  palette: readonly string[]
}
```

### Same object, same strings

```ts
type Theme = FlatTokens & Roles & { readonly name: string }

theme["bg-accent"] === theme.accent.bg          // true — identical reference
theme["bg-accent-hover"] === theme.accent.hover.bg
theme["fg-on-error"] === theme.error.fgOn
Object.keys(theme).length                       // ≈ 58 (50 flat + 8 role + name + palette)
```

Frozen at derive time. No Proxy — plain JS object, works with `structuredClone`, DevTools, JSON serialization.

## `DesignSystem<Input>`

```ts
export interface DesignSystem<Input = unknown> {
  readonly name: string
  readonly shape: ThemeShape

  /**
   * Framework flatten rule:
   *   - true        → Sterling-style rule (bg-accent, fg-on-error)
   *   - FlattenRule → custom (Material's onPrimary, camelCase, …)
   *   - false / omit → nested-only
   */
  readonly flatten?: boolean | FlattenRule

  /** Raw defaults, no input required. */
  defaults(mode?: "light" | "dark"): Theme

  /** Fill partial values + defaults. */
  theme(partial: Partial<Theme>): Theme

  /** Optional derivation methods. */
  deriveFromScheme?(scheme: ColorScheme, options?: DeriveOptions): Theme
  deriveFromColor?(color: string, options?: DeriveOptions): Theme
  deriveFromPair?(light: ColorScheme, dark: ColorScheme): { light: Theme; dark: Theme }
  deriveFromSchemeWithBrand?(scheme: ColorScheme, brand: string): Theme
}
```

### `defineDesignSystem(impl)`

Wraps every derivation method in auto-`bakeFlat` per the `flatten` flag — system authors never call `bakeFlat` themselves.

```ts
import { defineDesignSystem } from "@silvery/design"

export const sterling = defineDesignSystem({
  name: "sterling",
  shape: STERLING_SHAPE,
  flatten: true,                                   // Sterling's default rule
  defaults(mode) { return buildDefaults(mode) },
  theme(partial) { return fillPartial(partial) },
  deriveFromScheme(scheme, options) { return derive(scheme, options) },
  deriveFromColor(color) { return derive(inferSchemeFromColor(color)) },
})
```

### `FlattenRule`

For alternate systems whose conventions differ:

```ts
type FlattenRule = (path: string[]) => string | null
// returns the flat key to write, or null to skip the leaf
```

Example — Material-style `onPrimary` / camelCase:

```ts
const materialRule: FlattenRule = (path) => {
  const last = path[path.length - 1]!
  if (last === "fgOn")             return `on${cap(path[0]!)}`
  if (last === "fg" || last === "bg")
    return `${last === "fg" ? "text" : "surface"}${cap(path[0]!)}`
  return null
}
```

### `ColorScheme`

22-color terminal palette. Full definition in [`@silvery/ansi` reference](/reference/style); summary:

```ts
interface ColorScheme {
  name?: string
  dark?: boolean
  primary?: string

  // 16 ANSI
  black: string; red: string; green: string; yellow: string
  blue: string; magenta: string; cyan: string; white: string
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string
  brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string

  // 6 semantic
  foreground: string; background: string
  cursorColor: string; cursorText: string
  selectionBackground: string; selectionForeground: string
}
```

### `DeriveOptions`

```ts
interface DeriveOptions {
  /** Strict: hard-fail below WCAG AA (for catalog tests). Auto: silent auto-lift (default). */
  mode?: "strict" | "auto-lift"

  /** Optional sink to collect contrast adjustments for debugging. */
  adjustments?: ThemeAdjustment[]

  /** Token pack — extend Sterling with app-specific tokens. */
  extend?: TokenExtensions
}

interface ThemeAdjustment {
  token: string
  from: string
  to: string
  against: string
  target: number
  ratioBefore: number
  ratioAfter: number
}
```

## Sterling — the default export

Shipped from `@silvery/design` as the default, also re-exported from `silvery` as `design`:

```ts
import { design } from "silvery"
// same as:
import { sterling as design } from "@silvery/design"

const theme = design.deriveFromScheme(nordScheme)
```

### Default hex values

Sterling is **preservative** — tokens are derived from the scheme, not hard-coded. There is no "default hex for `$fg-accent`" independent of a scheme. The default Theme (when no scheme is provided) uses `silvery-dark` or `silvery-light`:

```ts
import { design } from "silvery"

const dark  = design.defaults("dark")    // derived from silvery-dark scheme
const light = design.defaults("light")   // derived from silvery-light scheme
```

## Derivation rules

Every Theme produced by `design.deriveFromScheme()` follows these rules. Full rationale in [Color Schemes](/guide/color-schemes#derivation-rules-default-preservative).

| Token                    | Derivation                                       |
|--------------------------|--------------------------------------------------|
| `fg-error`               | `scheme.red`                                     |
| `fg-warning`             | `scheme.yellow`                                  |
| `fg-success`             | `scheme.green`                                   |
| `fg-info`                | `scheme.primary`                                 |
| `fg-accent`              | `scheme.primary`                                 |
| `bg-accent`              | `scheme.primary`                                 |
| `bg-accent-hover`        | OKLCH +0.04L on `bg-accent` (adaptive direction) |
| `bg-accent-active`       | OKLCH +0.08L on `bg-accent`                      |
| `fg-on-accent`           | contrast-pick(fg, bg) against `bg-accent` at 4.5:1 |
| `fg-muted`               | blend(fg, bg, 0.5)                               |
| `bg-surface-subtle`      | blend(bg, fg, 0.05)                              |
| `bg-surface-raised`      | blend(bg, fg, 0.08)                              |
| `bg-surface-overlay`     | blend(bg, fg, 0.12)                              |
| `border-focus`           | `scheme.primary`                                 |
| `cursor-bg`              | `scheme.cursorColor`                             |
| `cursor-fg`              | `scheme.cursorText`                              |

### Contrast targets

`deriveFromScheme()` enforces minimum WCAG ratios via OKLCH lightness lift (preserving hue + chroma):

| Pair                                                    | Target    |
|---------------------------------------------------------|-----------|
| `fg` on `bg` / `bg-surface-*`                          | 4.5:1 (AA)|
| `fg-muted` on `bg` / `bg-surface-subtle`               | 4.5:1     |
| `fg-disabled` on `bg`                                   | 3.0:1     |
| `fg-<role>` on `bg`                                     | 4.5:1     |
| `fg-on-<role>` on `bg-<role>`                           | 4.5:1     |
| `border-default` on `bg`                                | 1.5:1     |
| `border-input` on `bg`                                  | 3.0:1     |

## `resolveThemeColor()`

Resolves a `$`-token string against a Theme.

```ts
import { resolveThemeColor } from "@silvery/design"

function resolveThemeColor(color: string | undefined, theme: Theme): string | undefined
```

| Input                      | Behavior                                      | Example            |
|----------------------------|-----------------------------------------------|--------------------|
| `undefined`                | Returns `undefined`                           | —                  |
| `"$fg-accent"`             | Theme lookup                                  | `"#EBCB8B"`        |
| `"$bg-surface-subtle"`     | Theme lookup (flat form)                      | `"#3B4252"`        |
| `"$color0"`–`"$color15"`   | Index into `theme.palette`                    | `"#2E3440"`        |
| `"#ff0000"`                | Pass through                                  | `"#ff0000"`        |
| `"red"`                    | Pass through                                  | `"red"`            |
| Unknown `$`-token          | Pass through as-is                            | `"$unknown"`       |

## `ThemeProvider`

See [`components/ThemeProvider`](/components/ThemeProvider).

## `useTheme()`

```tsx
import { useTheme } from "silvery"

function StatusLine() {
  const theme = useTheme()
  return <Text color="$fg-accent">{theme.name}</Text>
}
```

Returns the default Theme when no `<ThemeProvider>` is in scope.

## Per-subtree override via `<Box theme>`

```tsx
<Box theme={lightTheme} borderStyle="single">
  {/* All $ tokens resolve against lightTheme here */}
  <Text color="$fg-accent">Themed content</Text>
</Box>
```

The nearest ancestor `Box` with a `theme` prop determines token resolution for its descendants. Cost: ~2 ns per lookup during the render-phase tree walk (no React re-renders).

## `bakeFlat()`

Direct access to the flat-projection primitive from `@silvery/ansi`:

```ts
import { bakeFlat } from "@silvery/ansi"

bakeFlat(nestedTheme)                    // Sterling default rule
bakeFlat(nestedTheme, customRule)        // custom FlattenRule
```

Input: nested-only Theme. Output: same object with flat keys written and frozen.

DesignSystem authors don't call this — `defineDesignSystem()` wires it in.

## `pickColorLevel()`

Pre-quantize a Theme for a target tier:

```ts
import { pickColorLevel } from "@silvery/ansi"

const themeAt256 = pickColorLevel(theme, "256")
const themeAtBasic = pickColorLevel(theme, "basic")
```

Returns a structurally-identical Theme with hex leaves quantized for the tier.

## Alternative design systems

Each is a separate package with the same contract:

| Package                    | What                                                 |
|----------------------------|------------------------------------------------------|
| `@silvery/design`          | Sterling (default)                                   |
| `@silvery/design-material` | Material 3 tokens + generative HCT derivation         |
| `@silvery/design-primer`   | Primer verbatim (`danger` / `attention` / `severe`)   |
| `@silvery/design-polaris`  | Polaris (`critical` / `caution` / `subdued`)          |

Writing your own: see [Custom Tokens](/guide/custom-tokens).

## See also

- [Sterling](/guide/sterling) — the default design system.
- [Styling](/guide/styling) — ten principles.
- [Theming](/guide/theming) — ThemeProvider + runtime swap.
- [Token Taxonomy](/guide/token-taxonomy) — every Sterling token.
- [Color Schemes](/guide/color-schemes) — 22-slot scheme model.
- [`@silvery/ansi` reference](/reference/style) — CLI styling + `bakeFlat` + `pickColorLevel`.

<!-- TODO: verify after 0.19.0 ships — confirm exact DeriveOptions shape, whether ThemeShape is exported, `extend:` token-pack vs separate `defineTokens` API, whether `name` / `palette` are on the Theme root. -->
