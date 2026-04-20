# Theming

_Pass a Theme, nest them, swap them at runtime, plug in a different design system._

Silvery auto-detects your terminal's color scheme at startup and builds a Sterling Theme from it — your app matches whatever the user has configured (Dracula, Nord, Catppuccin, …) with zero work on your end. This guide shows you how to take control when you need to.

For the Theme shape + derivation rules, see the [`@silvery/design` reference](/reference/theme). For token names, see [Token Taxonomy](./token-taxonomy).

## Theme is a value

Themes are plain JS values — computed outside `run()` and passed in. Testable, cacheable, swappable.

```ts
import { run, design, detectTermScheme } from "silvery"

const theme = design.deriveFromScheme(detectTermScheme())
await run(<App />, { theme })
```

`design` is **Sterling** — silvery's default. Most apps skip this step and let `run()` do it internally:

```ts
import { run } from "silvery"
await run(<App />)                           // auto-detect + Sterling
```

## `ThemeProvider` — the scoping primitive

`run({ theme })` is sugar for wrapping your root with `<ThemeProvider>`. Everything below is the same primitive.

### Basic

```tsx
import { ThemeProvider, Box, Text } from "silvery"
import { schemes, design } from "silvery"

const theme = design.deriveFromScheme(schemes.catppuccinMocha)

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Box borderStyle="single">
        <Text color="$fg-accent">Deploy complete</Text>
        <Text color="$fg-muted">3 files changed</Text>
      </Box>
    </ThemeProvider>
  )
}
```

### Nested — pin a subtree

`<ThemeProvider>` nests. Innermost wins.

```tsx
<ThemeProvider theme={appTheme}>
  <Header />                                        {/* app theme */}
  <ThemeProvider theme={nordTheme}>
    <Sidebar />                                     {/* nord */}
  </ThemeProvider>
  <Main />                                          {/* app theme again */}
  <ThemeProvider theme={material.deriveFromColor("#FF6A00")}>
    <Modal />                                       {/* material orange */}
  </ThemeProvider>
</ThemeProvider>
```

Real uses: theme pickers, per-pane theming, multi-tenant branding, modal highlighting, high-contrast preview panes.

### Runtime swap

Store the theme in state, change it on demand:

```tsx
import { useState } from "react"
import { ThemeProvider, Text } from "silvery"
import { schemes, design } from "silvery"

const presets = {
  nord:     design.deriveFromScheme(schemes.nord),
  dracula:  design.deriveFromScheme(schemes.dracula),
  "rose-pine": design.deriveFromScheme(schemes.rosePine),
}

function App() {
  const [name, setName] = useState<keyof typeof presets>("nord")

  return (
    <ThemeProvider theme={presets[name]}>
      <Text color="$fg-accent">Current: {name}</Text>
      {/* wire t/T to cycle */}
    </ThemeProvider>
  )
}
```

Swaps are cheap — every styled cell invalidates, but the Theme itself is a frozen object, not a React re-resolve of tokens.

## Two shapes, one object

A Sterling Theme carries **both** the flat `$`-keyed form and the nested role form — on the same object, referencing the same strings.

```ts
theme["bg-accent"] === theme.accent.bg          // true
theme["bg-accent-hover"] === theme.accent.hover.bg
theme["fg-on-error"] === theme.error.fgOn
```

Write JSX with the flat form; iterate programmatically with the nested form.

```tsx
<Text color="$fg-accent">accent text</Text>
<Box backgroundColor="$bg-surface-subtle">panel</Box>
```

```ts
for (const [state, pair] of Object.entries(theme.accent)) {
  // "fg", "bg", "fgOn", "hover", "active"
}
```

No Proxy magic. `Object.keys(theme)` iterates ~50 flat keys + ~8 role objects. The whole Theme is frozen at derive time.

Full form comparison in the [`@silvery/design` reference](/reference/theme#two-shapes).

## Input variants — pick by what you have

Sterling exposes several `deriveFrom*` methods on the default `design` export:

```ts
import { design, schemes } from "silvery"

const t1 = design.deriveFromScheme(schemes.nord)
const t2 = design.deriveFromColor("#FF6A00")                       // single seed color
const t3 = design.deriveFromSchemeWithBrand(schemes.nord, "#FF6A00") // scheme + brand overlay
const t4 = design.deriveFromPair(lightScheme, darkScheme)          // { light, dark }
const t5 = design.theme({                                          // explicit values + fill
  accent: { bg: "#FF6A00" },
  error:  { bg: "#B00020" },
})
```

All return a complete Theme — missing fields filled by defaults. Full derivation rules in [Color Schemes](./color-schemes).

## Swap the design system

Design systems are packages. Sterling is the default from `@silvery/design`; alternatives are drop-in replacements with the same `DesignSystem` contract.

```ts
import { run } from "silvery"
import { material } from "@silvery/design-material"

const theme = material.deriveFromColor("#FF6A00")
await run(<App />, { theme })
```

Officially-maintained:

| Package                      | Vocabulary + derivation                                   |
|------------------------------|-----------------------------------------------------------|
| `@silvery/design`            | **Sterling** (default) — Primer grammar, preservative     |
| `@silvery/design-material`   | Material 3 — generative HCT from seed color                |
| `@silvery/design-primer`     | Primer verbatim — `danger` / `attention` / `severe` vocab  |
| `@silvery/design-polaris`    | Polaris — `critical` / `caution` / `subdued` vocab         |

Community packages: `@silvery-community/*`. Writing your own: publish a package that exports a `DesignSystem` object — see [Custom Tokens](./custom-tokens).

::: warning Cross-system mixing

Silvery UI components are wired to Sterling's token shape. Placing `@silvery/ui` inside a `ThemeProvider` whose theme came from `@silvery/design-material` fails fast with a clear error — tokens don't match. Write an explicit adapter (`materialToSterling(theme)`) if you need to mix.

Design systems are swappable **per `ThemeProvider` scope**; adapters live at the boundary.
:::

## `useTheme()` — read the active Theme

From any component:

```tsx
import { useTheme } from "silvery"

function StatusLine() {
  const theme = useTheme()
  // theme["bg-accent"], theme.accent.bg, theme.error.fgOn, etc.
  return <Text color="$fg-accent">{theme.name}</Text>
}
```

Returns the default Theme when no `<ThemeProvider>` is present.

## CLI-side token resolution

For non-React CLI output (spinners, progress lines, log messages), use `@silvery/ansi` — same token resolution, no React.

```ts
import { createStyle } from "@silvery/ansi"
import { design, schemes } from "silvery"

const theme = design.deriveFromScheme(schemes.nord)
const s = createStyle({ theme })

console.log(s["fg-accent"]("deploy") + " " + s["fg-muted"]("starting..."))
console.log(s["fg-success"]("done") + " " + s["fg-muted"]("(3 files)"))
console.log(s.bold["fg-error"]("FAIL") + " missing dependency")
```

Without a theme, token names fall back to sensible ANSI defaults:

```ts
const s = createStyle()
s["fg-accent"]("text")   // yellow (ANSI 33)
s["fg-error"]("text")    // red (ANSI 31)
s.bold.red("text")        // standard chalk-style chaining still works
```

Full chainable API in [`@silvery/ansi` reference](/reference/style).

## Color level degradation

Silvery detects the terminal's color capability and adapts automatically. Same code, different fidelity.

| Level       | Colors | When                                      | Token resolution                  |
|-------------|--------|-------------------------------------------|-----------------------------------|
| `truecolor` | 16M    | Modern terminals (Ghostty, Kitty, iTerm2) | Hex                               |
| `256`       | 256    | Older terminals, some SSH sessions        | Hex → nearest 256-color cube      |
| `basic`     | 16     | Legacy terminals, CI, pipes               | Hex → nearest ANSI slot           |
| `mono`      | 0      | Monochrome terminals, NO_COLOR            | Attribute-only (bold / underline / reverse) |

Detection is automatic. Override via env:

```bash
FORCE_COLOR=1    # basic (16)
FORCE_COLOR=2    # 256
FORCE_COLOR=3    # truecolor
NO_COLOR=1       # no color
```

Or pass `colorLevel` to `run()`:

```ts
await run(<App />, { colorLevel: "basic" })
```

### Pre-quantizing a Theme

`pickColorLevel()` (from `@silvery/ansi`) returns a structurally-identical Theme with quantized leaves — useful when you want to pre-compute the tier-appropriate Theme once at mount instead of quantizing at every cell:

```ts
import { pickColorLevel } from "@silvery/ansi"

const themeAt256 = pickColorLevel(theme, "256")
```

Both branches of the Theme (nested + flat) are quantized identically.

## Terminal palette detection

Silvery reads the terminal's actual colors at startup via OSC 10/11 (fg/bg), OSC 4 (ANSI palette), and OSC 12 (cursor). Dracula user → Dracula colors. Nord user → Nord colors. No config.

```ts
import { detectTermScheme, design } from "silvery"
import { schemes } from "silvery"

const scheme = await detectTermScheme({ fallback: schemes.nord })
const theme = design.deriveFromScheme(scheme)
```

Supported terminals: Ghostty, Kitty, WezTerm, iTerm2, foot, Alacritty, xterm. Falls back gracefully in tmux, CI, and pipes.

## Dark / light mode detection

Mode 2031 is a terminal protocol where the terminal self-reports its color scheme (`dark` / `light`). Cross-platform, unlike macOS-only `AppleInterfaceStyle`.

```ts
import { createBgModeDetector } from "@silvery/ansi"

using detector = createBgModeDetector({
  write: (data) => process.stdout.write(data),
  onData: (handler) => {
    process.stdin.on("data", handler)
    return () => process.stdin.off("data", handler)
  },
  fallback: () => "dark",
})

detector.start()
detector.scheme                // "dark" | "light" | "unknown"
detector.subscribe((scheme) => {
  // user toggled system dark mode
})
```

**How it works:** sends `\x1b[?2031h`, parses the response within a timeout (default 200 ms). Terminals that don't support Mode 2031 → `fallback` is used. Dispose sends `\x1b[?2031l`.

Supported: Contour, foot, WezTerm 1.0+, and growing.

## Debugging theme derivation

Pass an `adjustments` array to see every WCAG contrast lift Sterling applied:

```ts
import { design, schemes } from "silvery"
import type { ThemeAdjustment } from "@silvery/design"

const adjustments: ThemeAdjustment[] = []
const theme = design.deriveFromScheme(schemes.nord, { adjustments })

for (const adj of adjustments) {
  console.log(
    `${adj.token}: ${adj.from} -> ${adj.to} ` +
    `(${adj.ratioBefore.toFixed(1)} -> ${adj.ratioAfter.toFixed(1)} against ${adj.against})`,
  )
}
```

Useful when a token looks different from the raw palette color — Sterling adjusts OKLCH L (preserving hue and chroma) to meet WCAG minimums.

## See also

- [Sterling](./sterling) — the default design system (grammar, vocabulary, derivation).
- [Styling](./styling) — the ten principles for shiny apps.
- [Token Taxonomy](./token-taxonomy) — every token Sterling ships.
- [Color Schemes](./color-schemes) — 22-slot scheme model, catalog, auto-detect.
- [Custom Tokens](./custom-tokens) — writing your own DesignSystem.
- [`@silvery/design` reference](/reference/theme) — Theme type and DesignSystem contract.
- [Theme Explorer](/themes) — browse all 84 bundled schemes interactively.

<!-- TODO: verify after 0.19.0 ships — confirm `detectTermScheme` export name, `schemes` barrel, `@silvery/design-polaris` package existence, `pickColorLevel` import path. -->
