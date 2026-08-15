# @silvery/ansi

Everything terminal -- styling (chalk replacement), color detection, theme derivation, SGR codes, NO_COLOR/FORCE_COLOR support, terminal capability profiling, OSC queries, and string helpers. Used internally by Silvery but works independently in any Node.js or Bun project.

See also: [Terminal Styling](/reference/style) for the chainable `createStyle()` API and theme tokens.

## Installation

::: code-group

```bash [npm]
npm install @silvery/ansi
```

```bash [bun]
bun add @silvery/ansi
```

```bash [pnpm]
pnpm add @silvery/ansi
```

```bash [yarn]
yarn add @silvery/ansi
```

:::

## Terminal Profile

Resolve the terminal profile (color tier + capability flags) in one call, respecting `FORCE_COLOR` and `NO_COLOR`:

```typescript
import { createTerminalProfile } from "@silvery/ansi"

const profile = createTerminalProfile()
// profile.colorLevel: "mono" | "ansi16" | "256" | "truecolor"
// profile.caps: full TerminalCaps — colorLevel, kittyKeyboard, osc52, …
// profile.capabilityProvenance.kittyGraphics:
//   "explicit" | "live" | "live-da1-barrier" | "corpus" | "default"
```

Precedence (highest wins):

1. `FORCE_COLOR` env var -- `0` = mono, `1` = ansi16, `2` = 256, `3` = truecolor
2. `NO_COLOR` env var -- forces `mono` ([no-color.org](https://no-color.org))
3. Explicit `colorLevel` option (includes `null` alias for `mono`)
4. `caps.colorLevel` from caller-supplied partial caps
5. Auto-detect from `COLORTERM`, `TERM`, `TERM_PROGRAM`, CI vars — otherwise `ansi16` if TTY, `mono` if piped

### Color Tiers

| Tier          | Colors | SGR Format         |
| ------------- | ------ | ------------------ |
| `"mono"`      | None   | No ANSI codes      |
| `"ansi16"`    | 16     | `\x1b[31m` etc.    |
| `"256"`       | 256    | `\x1b[38;5;Nm`     |
| `"truecolor"` | 16M    | `\x1b[38;2;R;G;Bm` |

## Terminal Capability Detection

`createTerminalProfile()` also resolves a full `TerminalCaps` — the structural capability bag every entry point threads through:

```typescript
import { createTerminalProfile } from "@silvery/ansi"

const { caps } = createTerminalProfile()

if (caps.kittyKeyboard) {
  /* use enhanced key reporting */
}
if (caps.hyperlinks) {
  /* emit OSC 8 links */
}
if (caps.underlineStyles) {
  /* use curly underlines for errors */
}
```

For async probe-based detection (adds `profile.theme`), use `probeTerminalProfile()`. In a live Silvery session it sends Kitty graphics, XTVERSION, and DA1 as one bounded `term.input` transaction. The DA1 response is the completion barrier. A timeout is no evidence. A completed DA1 without a preceding Kitty acknowledgement is live negative evidence for the effective terminal path; provenance records this as `live-da1-barrier`. DA1 parameter 4 is positive Sixel evidence, while DA1 without parameter 4 leaves the existing Sixel decision unchanged because DA1's self-declared attribute list can under-report.

Capability decisions follow one precedence order: caller/environment explicit values, positive or explicit-negative live evidence, terminal corpus heuristics, then framework defaults. `profile.capabilityProvenance` records the winning channel for every field in `profile.caps`. Pass both `caps` and `capabilityProvenance` when re-resolving an existing profile; otherwise supplied caps are intentionally treated as explicit caller choices.

Every entry point (`run`, `createApp().run()`, `render`, `createTerm`) accepts a pre-built `profile` option so the whole session flows from one resolved value.

Profiles are two-layer: `profile.emulator` carries identity (program/version/TERM) and `profile.caps` carries protocol flags + low-confidence `maybe*` heuristics.

`profile.emulator` (`TerminalEmulator`):

| Property  | Type     | Description                                            |
| --------- | -------- | ------------------------------------------------------ |
| `program` | `string` | Terminal program name (from `TERM_PROGRAM`)            |
| `version` | `string` | Terminal program version (from `TERM_PROGRAM_VERSION`) |
| `TERM`    | `string` | Value of the `TERM` env var                            |

`profile.caps` (`TerminalCaps`):

| Property              | Type                                     | Description                                      |
| --------------------- | ---------------------------------------- | ------------------------------------------------ |
| `cursor`              | `boolean`                                | Cursor control (TTY stdout + `TERM != dumb`)     |
| `input`               | `boolean`                                | Raw keystroke input (TTY stdin + `setRawMode`)   |
| `colorLevel`          | `ColorLevel`                             | `"mono"` / `"ansi16"` / `"256"` / `"truecolor"`  |
| `colorForced`         | `boolean`                                | Env or override forced the tier                  |
| `colorProvenance`     | `ColorProvenance`                        | Which rung resolved the tier                     |
| `kittyKeyboard`       | `boolean`                                | Kitty keyboard protocol                          |
| `kittyGraphics`       | `boolean`                                | Kitty graphics protocol (inline images)          |
| `sixel`               | `boolean`                                | Sixel graphics                                   |
| `osc52`               | `boolean`                                | OSC 52 clipboard access                          |
| `hyperlinks`          | `boolean`                                | OSC 8 hyperlinks                                 |
| `notifications`       | `"osc9" \| "osc777" \| "osc99" \| false` | Proven desktop-notification protocol             |
| `bracketedPaste`      | `boolean`                                | Bracketed paste mode                             |
| `mouse`               | `boolean`                                | SGR mouse tracking                               |
| `syncOutput`          | `boolean`                                | Synchronized output (DEC 2026)                   |
| `unicode`             | `boolean`                                | Unicode/emoji support                            |
| `underlineStyles`     | `readonly UnderlineStyle[]`              | Supported SGR 4:x styles (empty = SGR 4 only)    |
| `underlineColor`      | `boolean`                                | SGR 58 underline color                           |
| `textSizing`          | `boolean`                                | OSC 66 text sizing (Kitty 0.40+)                 |
| `maybeDarkBackground` | `boolean`                                | Guess: dark background likely (env sniff)        |
| `maybeNerdFont`       | `boolean`                                | Guess: Nerd Font likely installed                |
| `maybeWideEmojis`     | `boolean`                                | Guess: text-presentation emoji render at 2 cells |

`maybe*` fields are low-confidence heuristics, not hard protocol guarantees. They normally come from the terminal corpus; bounded live identity evidence can refine them unless an explicit caller/environment value already decided the field. The prefix keeps that uncertainty visible inline.

Use `defaultCaps()` for a sensible default (assumes modern terminal with truecolor).

## SGR Color Codes

Generate the shortest SGR code string for foreground and background colors:

```typescript
import { fgColorCode, bgColorCode } from "@silvery/ansi"

fgColorCode(1) // "31"              (basic red)
fgColorCode(196) // "38;5;196"        (256-color)
fgColorCode({ r: 255, g: 0, b: 0 }) // "38;2;255;0;0"   (truecolor)

bgColorCode(4) // "44"              (basic blue)
bgColorCode({ r: 0, g: 0, b: 0 }) // "48;2;0;0;0"     (truecolor black)
```

## String Utilities

### `stripAnsi(text)`

Remove all ANSI escape codes from a string. Handles CSI SGR sequences, OSC 8 hyperlinks, and C1 variants:

```typescript
import { stripAnsi } from "@silvery/ansi"

stripAnsi("\x1b[31mred\x1b[0m") // "red"
stripAnsi("\x1b[4:3mwavy\x1b[4:0m") // "wavy"
```

### `displayLength(text)`

Get the display width of a string in terminal columns, excluding ANSI codes. Handles CJK and emoji-presentation characters:

```typescript
import { displayLength } from "@silvery/ansi"

displayLength("\x1b[31mhello\x1b[0m") // 5
displayLength("hello") // 5
displayLength("\u97D3\u8A9E") // 4 (2 chars x 2 cells each)
```

::: warning Not the renderer's measurement

`displayLength` is raw `string-width` over the ANSI-stripped text. It does **not** apply the text-presentation-emoji correction that the render pipeline applies, so it disagrees with what silvery actually paints for characters like `\u26A0` (U+26A0) and `\u2611` (U+2611), which most terminals draw two columns wide:

```typescript
displayLength("\u26A0") // 1  \u2014 raw Unicode East Asian Width
displayWidth("\u26A0") // 2  \u2014 what the renderer paints
```

Use it for ANSI-aware string bookkeeping in low-level code. **For anything whose result must line up with rendered output \u2014 layout, wrapping, column allocation, cursor math \u2014 use `displayWidth` from `@silvery/ag-term/unicode`**, which is the one home for width as the renderer measures it (cache, emoji correction, private-use-area handling, and per-`Measurer` scoping).

The two exist separately because `@silvery/ansi` sits _below_ `@silvery/ag-term` in the dependency graph and cannot import it. Consolidating them means moving the corrected primitive down into `@silvery/ansi`; tracked under `@si/apportion-consolidation`.

:::

### `ANSI_REGEX`

The regex pattern used by `stripAnsi()`, exported for custom use:

```typescript
import { ANSI_REGEX } from "@silvery/ansi"
```

## Underline & Hyperlink Constants

Constants and builders for extended underline styles (ISO 8613-6) and OSC 8 hyperlinks:

```typescript
import {
  UNDERLINE_CODES, // { none, single, double, curly, dotted, dashed, reset }
  buildUnderlineColorCode, // (r, g, b) => SGR 58 escape string
  buildHyperlink, // (text, url) => OSC 8 wrapped string
} from "@silvery/ansi"

UNDERLINE_CODES.curly // "\x1b[4:3m"
buildUnderlineColorCode(255, 0, 0) // "\x1b[58:2::255:0:0m"
buildHyperlink("click me", "https://example.com")
```

## Type Exports

```typescript
import type {
  ColorLevel, // "ansi16" | "256" | "truecolor"
  RGB, // [r: number, g: number, b: number]
  AnsiColorName, // "red" | "green" | "cyan" | ... (16 standard names)
  Color, // AnsiColorName | "#hex" | "rgb(...)" | "$token" | string
  UnderlineStyle, // "single" | "double" | "curly" | "dotted" | "dashed"
  TerminalCaps, // Full terminal capability profile
} from "@silvery/ansi"
```
