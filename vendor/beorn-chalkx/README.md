# @beorn/chalkx

[![npm version](https://img.shields.io/npm/v/@beorn/chalkx.svg)](https://www.npmjs.com/package/@beorn/chalkx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Extended chalk with modern terminal features that chalk doesn't support: curly/dotted/dashed underlines, independent underline color, and OSC 8 hyperlinks.

## Quick Start

```typescript
import { curlyUnderline, hyperlink, chalk } from "@beorn/chalkx";

// Spell-check style wavy underline
console.log(curlyUnderline("mispelled"));

// Clickable terminal link
console.log(hyperlink("Open docs", "https://example.com/docs"));

// Combine with chalk colors
console.log(chalk.red(curlyUnderline("Error: typo detected")));
```

## Features

- **Extended underline styles** - curly (wavy), dotted, dashed, double
- **Independent underline color** - set underline color separately from text color
- **Hyperlinks** - clickable OSC 8 terminal hyperlinks
- **InkX compatibility** - `bgOverride()` for safe chalk bg usage with inkx
- **Graceful fallback** - degrades to regular underlines on unsupported terminals
- **ANSI utilities** - `stripAnsi()`, `displayLength()`

## Installation

```bash
bun add @beorn/chalkx
# or
npm install @beorn/chalkx
```

## Usage

```typescript
import {
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  hyperlink,
  chalk,
} from "@beorn/chalkx";

// Extended underline styles
console.log(curlyUnderline("spelling error")); // wavy underline
console.log(dottedUnderline("embedded content")); // dotted underline
console.log(dashedUnderline("draft text")); // dashed underline
console.log(doubleUnderline("important")); // double underline

// Independent underline color
console.log(underlineColor(255, 0, 0, "error")); // red underline
console.log(underlineColor(255, 165, 0, "warn")); // orange underline

// Style + color combined
console.log(styledUnderline("curly", [255, 0, 0], "critical error"));

// Hyperlinks (clickable in terminal)
console.log(hyperlink("Click me", "https://example.com"));

// Works with chalk for text color
console.log(chalk.red(curlyUnderline("red text, wavy underline")));
```

## InkX Background Override

When using chalk with [inkx](https://github.com/beorn/inkx) (a React terminal UI framework), mixing chalk backgrounds with inkx `backgroundColor` props causes visual artifacts. InkX detects this and throws by default.

Use `bgOverride()` to explicitly allow this when you know what you're doing:

```tsx
import { bgOverride, chalk } from "@beorn/chalkx";
import { Box, Text } from "inkx";

// Without bgOverride - throws by default!
<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack("text")}</Text>  // Error: background conflict
</Box>

// With bgOverride - explicitly allowed
<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack("text"))}</Text>  // OK
</Box>
```

The `bgOverride()` function wraps text with a private SGR marker that inkx recognizes, suppressing the conflict detection for that text.

Control inkx detection via `INKX_BG_CONFLICT` env var: `throw` (default), `warn`, or `ignore`.

## Run the Storybook

Visual demo of all features:

```bash
bun ./src/storybook.ts
```

---

# Terminal Technology Landscape

## Overview of ANSI/VT Standards

The ANSI escape code ecosystem is a layered set of standards that evolved over decades:

| Standard                 | Year    | Description                                              |
| ------------------------ | ------- | -------------------------------------------------------- |
| **ECMA-48 / ANSI X3.64** | 1976    | Core escape sequences, CSI (Control Sequence Introducer) |
| **VT100**                | 1978    | DEC's implementation, became de facto standard           |
| **VT220/VT320**          | 1983-87 | 8-bit characters, more CSI sequences                     |
| **xterm**                | 1984+   | Extended sequences, 256 colors, true color               |
| **ISO 8613-6**           | 1994    | ITU T.416 - defines SGR 58/59 for underline color        |
| **Kitty**                | 2017+   | Extended keyboard protocol, underline styles             |
| **OSC 8**                | 2017+   | Hyperlinks (egmontkob proposal)                          |

## SGR (Select Graphic Rendition) Codes

SGR codes control text styling via `\x1b[<params>m`:

### Basic Attributes (ECMA-48)

| Code | Effect           | Code | Reset            |
| ---- | ---------------- | ---- | ---------------- |
| 1    | Bold             | 22   | Normal intensity |
| 2    | Dim/faint        | 22   | Normal intensity |
| 3    | Italic           | 23   | Not italic       |
| 4    | Underline        | 24   | Not underlined   |
| 5    | Slow blink       | 25   | Not blinking     |
| 7    | Reverse/inverse  | 27   | Not reversed     |
| 8    | Hidden/invisible | 28   | Visible          |
| 9    | Strikethrough    | 29   | Not struck       |

### Standard Colors (8 colors + bright variants)

| Foreground | Background | Color           |
| ---------- | ---------- | --------------- |
| 30         | 40         | Black           |
| 31         | 41         | Red             |
| 32         | 42         | Green           |
| 33         | 43         | Yellow          |
| 34         | 44         | Blue            |
| 35         | 45         | Magenta         |
| 36         | 46         | Cyan            |
| 37         | 47         | White           |
| 90-97      | 100-107    | Bright variants |

### Extended Colors (256-color and True Color)

```
\x1b[38;5;<n>m       # Foreground (256-color palette)
\x1b[48;5;<n>m       # Background (256-color palette)
\x1b[38;2;<r>;<g>;<b>m  # Foreground (24-bit RGB)
\x1b[48;2;<r>;<g>;<b>m  # Background (24-bit RGB)
```

### Extended Underline Styles (Kitty extension)

Uses colon-separated parameters per ISO 8613-6:

```
\x1b[4:0m   # No underline
\x1b[4:1m   # Single underline (standard)
\x1b[4:2m   # Double underline
\x1b[4:3m   # Curly/wavy underline
\x1b[4:4m   # Dotted underline
\x1b[4:5m   # Dashed underline
```

### Underline Color (ISO 8613-6 / ITU T.416)

```
\x1b[58:2::<r>:<g>:<b>m   # Set underline color (RGB)
\x1b[58:5:<n>m            # Set underline color (256-color)
\x1b[59m                  # Reset underline color
```

Note: The double colon `::` skips the color space ID (always assumed to be 2 for RGB).

## OSC (Operating System Command) Sequences

OSC sequences control terminal features beyond text styling:

| OSC Code | Purpose                                       |
| -------- | --------------------------------------------- |
| 0        | Set window title and icon name                |
| 1        | Set icon name                                 |
| 2        | Set window title                              |
| 4        | Define color palette entry                    |
| 7        | Set working directory (for shell integration) |
| **8**    | **Hyperlinks** (our focus)                    |
| 9        | Desktop notifications (iTerm2)                |
| 10-19    | Query/set default colors                      |
| 52       | Clipboard access                              |
| 133      | Shell integration (prompt marking)            |
| 1337     | iTerm2 proprietary (images, etc.)             |

### OSC 8 Hyperlinks

```
\x1b]8;;<url>\x1b\\<text>\x1b]8;;\x1b\\
```

- `\x1b]8;;` - Start hyperlink, followed by URL
- `\x1b\\` - String terminator (ST)
- Text displayed to user (clickable)
- `\x1b]8;;\x1b\\` - End hyperlink (empty URL)

Optional parameters between the semicolons:

```
\x1b]8;id=myid;<url>\x1b\\<text>\x1b]8;;\x1b\\
```

The `id=` parameter groups multiple hyperlink segments as one logical link.

---

# Package Comparison

## Existing Packages

| Package                 | Stars | Extended Underlines | Underline Color | Hyperlinks | Notes                                   |
| ----------------------- | ----- | ------------------- | --------------- | ---------- | --------------------------------------- |
| **chalk**               | 21k   | No                  | No              | No         | Industry standard, no extended features |
| **kleur**               | 1.6k  | No                  | No              | No         | Lightweight chalk alternative           |
| **colorette**           | 800   | No                  | No              | No         | Fastest, minimal                        |
| **ansi-colors**         | 500   | No                  | No              | No         | No dependencies                         |
| **picocolors**          | 1.5k  | No                  | No              | No         | Tiny, fast                              |
| **ansi-styles**         | 8k    | No                  | No              | No         | Low-level, used by chalk                |
| **terminal-link**       | 600   | N/A                 | N/A             | Yes        | Hyperlinks only                         |
| **supports-hyperlinks** | 200   | N/A                 | N/A             | Detection  | Detection only                          |

**No mainstream package supports extended underline styles or independent underline color.**

## Why chalkx?

1. **Extends chalk** - Uses chalk for standard features, adds what's missing
2. **Graceful fallback** - Unsupported terminals get regular underlines
3. **Modern terminal focus** - Targets Ghostty, Kitty, WezTerm, iTerm2
4. **Minimal** - Only adds what's needed, re-exports chalk

---

# Terminal Support Matrix

## Extended Underline Styles

| Terminal             | Curly | Dotted | Dashed | Double | Notes                                  |
| -------------------- | ----- | ------ | ------ | ------ | -------------------------------------- |
| **Ghostty**          | ✅    | ✅     | ✅     | ✅     | Full support                           |
| **Kitty**            | ✅    | ✅     | ✅     | ✅     | Originated these extensions            |
| **WezTerm**          | ✅    | ✅     | ✅     | ✅     | Full support                           |
| **iTerm2**           | ✅    | ✅     | ✅     | ✅     | v3.4+                                  |
| **Alacritty**        | ⚠️    | ⚠️     | ⚠️     | ⚠️     | Partial (curly only, no dotted/dashed) |
| **Terminal.app**     | ❌    | ❌     | ❌     | ❌     | Falls back to single underline         |
| **GNOME Terminal**   | ❌    | ❌     | ❌     | ❌     | Falls back to single underline         |
| **Windows Terminal** | ⚠️    | ⚠️     | ⚠️     | ⚠️     | Partial support                        |
| **VS Code Terminal** | ❌    | ❌     | ❌     | ❌     | Falls back to single underline         |

## Underline Color

| Terminal             | RGB Color | 256-Color | Notes         |
| -------------------- | --------- | --------- | ------------- |
| **Ghostty**          | ✅        | ✅        | Full support  |
| **Kitty**            | ✅        | ✅        | Full support  |
| **WezTerm**          | ✅        | ✅        | Full support  |
| **iTerm2**           | ✅        | ✅        | Full support  |
| **Alacritty**        | ⚠️        | ⚠️        | Partial       |
| **Terminal.app**     | ❌        | ❌        | Color ignored |
| **VS Code Terminal** | ❌        | ❌        | Color ignored |

## Hyperlinks (OSC 8)

| Terminal             | Clickable | Hover Preview | Notes                 |
| -------------------- | --------- | ------------- | --------------------- |
| **Ghostty**          | ✅        | ✅            | Full support          |
| **Kitty**            | ✅        | ✅            | Full support          |
| **WezTerm**          | ✅        | ✅            | Full support          |
| **iTerm2**           | ✅        | ✅            | Full support          |
| **Alacritty**        | ✅        | ❌            | Click works, no hover |
| **Terminal.app**     | ✅        | ❌            | Click works           |
| **GNOME Terminal**   | ✅        | ✅            | VTE 0.50+             |
| **Windows Terminal** | ✅        | ✅            | Full support          |
| **VS Code Terminal** | ✅        | ✅            | Full support          |

---

# Roadmap

## v0.1.0 (Current)

- [x] Extended underline styles (curly, dotted, dashed, double)
- [x] Independent underline color (RGB)
- [x] Combined style + color
- [x] OSC 8 hyperlinks
- [x] Terminal capability detection
- [x] Graceful fallback system
- [x] `stripAnsi()` and `displayLength()` utilities
- [x] Storybook for visual testing

## v0.2.0 (Planned)

### Enhanced Hyperlinks

- [ ] `hyperlink()` with optional `id` parameter for grouped links
- [ ] `hyperlinkWithFallback()` - show URL in parentheses on unsupported terminals
- [ ] Detection function `supportsHyperlinks()`

### File and Custom Protocol Links

- [ ] `fileLink(path, text)` - create `file://` links
- [ ] `vscodeLink(path, line?, column?)` - create `vscode://` links
- [ ] `customLink(protocol, path, text)` - arbitrary protocols

### Improved Detection

- [ ] Per-feature detection (not just boolean)
- [ ] Runtime terminal capability query (OSC 4/10/11)
- [ ] SSH session detection (graceful degradation)
- [ ] tmux/screen passthrough mode

## v0.3.0 (Planned)

### Extended Attributes

- [ ] `overline(text)` - SGR 53/55
- [ ] `superscript(text)` - terminal-dependent
- [ ] `subscript(text)` - terminal-dependent

### Cursor Styles

- [ ] `hideCursor()` / `showCursor()` - CSI ?25l/?25h
- [ ] `saveCursor()` / `restoreCursor()` - CSI s/u
- [ ] Cursor shape control (block, underline, bar)

### Text Decoration Stacking

- [ ] Multiple decoration styles on same text
- [ ] Proper nesting and reset handling

## v0.4.0 (Future)

### Images (Kitty Graphics Protocol)

- [ ] Inline image support for Kitty/iTerm2
- [ ] Base64 image embedding
- [ ] Image sizing and placement

### Notifications

- [ ] Desktop notifications via OSC 9 (iTerm2) / OSC 777 (urxvt)

### Clipboard

- [ ] Read/write clipboard via OSC 52

### Advanced Unicode

- [ ] Proper width calculation for CJK, emoji
- [ ] Grapheme cluster handling

## Fallback Strategy

chalkx implements a tiered fallback approach:

| Feature          | Modern Terminal     | Basic Terminal | No Color  |
| ---------------- | ------------------- | -------------- | --------- |
| Curly underline  | `\x1b[4:3m`         | `\x1b[4m`      | (none)    |
| Underline color  | `\x1b[58:2::r:g:bm` | (ignored)      | (none)    |
| Hyperlink        | Full OSC 8          | Text only      | Text only |
| Bold + underline | Both applied        | Both applied   | (none)    |

Detection happens once at startup and caches the result. Override with:

```typescript
import { setExtendedUnderlineSupport } from "@beorn/chalkx";

setExtendedUnderlineSupport(true); // Force extended mode
setExtendedUnderlineSupport(false); // Force fallback mode
setExtendedUnderlineSupport(null); // Re-detect
```

---

# References

- [ECMA-48 Standard](https://www.ecma-international.org/publications-and-standards/standards/ecma-48/) - Control Functions for Coded Character Sets
- [Kitty Underlines Documentation](https://sw.kovidgoyal.net/kitty/underlines/) - Extended underline styles
- [OSC 8 Hyperlinks Proposal](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda) - Terminal hyperlinks spec
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) - Comprehensive reference
- [ITU T.416](https://www.itu.int/rec/T-REC-T.416/en) - ISO 8613-6, defines underline color
- [Terminal Feature Detection](https://github.com/termstandard/colors) - Color/feature detection methods
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) - Inline images

---

## Documentation

- [Design Document](docs/design.md) - Architecture decisions and rationale
- [Chalk Comparison](docs/chalk-comparison.md) - Feature comparison with other libraries

## Examples

Run the examples to see chalkx in action:

```bash
bun examples/basic/index.ts           # Basic feature demo
bun examples/spelling-checker/index.ts  # IDE-style error highlighting
```

## Contributing

Contributions are welcome! Please ensure:

1. Tests pass: `bun test`
2. Types check: `bun run typecheck`
3. Code follows existing patterns

## License

MIT
