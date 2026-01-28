# @beorn/term

[![npm version](https://img.shields.io/npm/v/@beorn/term.svg)](https://www.npmjs.com/package/@beorn/term)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)

**Terminal detection, styling, and primitives with Disposable pattern support.**

A modern terminal abstraction that unifies capability detection, chainable styling, console interception, and resource management into a single, ergonomic API.

```ts
import { createTerm } from '@beorn/term'

using term = createTerm()

if (term.hasColor()) {
  term.writeLine(term.bold.green('Ready!'))
}
```

---

## Features

- **Disposable pattern** - Clean resource management with `using` keyword
- **Unified detection** - `hasCursor()`, `hasInput()`, `hasColor()`, `hasUnicode()`
- **Flattened styling** - `term.bold.red()` with no extra imports
- **Console patching** - Intercept and subscribe to console output
- **Extended underlines** - Curly, dotted, dashed with automatic fallback
- **Hyperlinks** - OSC 8 clickable links for modern terminals
- **Zero config** - Sensible defaults, overridable for testing

---

## Installation

```bash
# bun
bun add @beorn/term

# pnpm
pnpm add @beorn/term

# npm
npm install @beorn/term
```

---

## Quick Start

```ts
import { createTerm, patchConsole } from '@beorn/term'

// Create a term instance with automatic capability detection
using term = createTerm()

// Check what the terminal supports
console.log('Color:', term.hasColor())      // 'basic' | '256' | 'truecolor' | null
console.log('Cursor:', term.hasCursor())    // Can reposition cursor?
console.log('Input:', term.hasInput())      // Can read raw keystrokes?
console.log('Unicode:', term.hasUnicode())  // Can render unicode?

// Style and output text
term.writeLine(term.bold.cyan('Hello, Terminal!'))
term.writeLine(term.red.underline('Errors shown in red'))
term.writeLine(term.rgb(255, 165, 0)('Custom orange text'))

// Intercept console output
using patched = patchConsole(console)
console.log('This is captured')
console.log('Entries:', patched.getSnapshot().length)  // 2
```

---

## API Reference

### Creating a Term

```ts
import { createTerm } from '@beorn/term'

// Auto-detect everything
using term = createTerm()

// With options
using term = createTerm({
  stdout: process.stdout,      // Custom output stream
  stdin: process.stdin,        // Custom input stream
  color: 'truecolor',          // Override: 'basic' | '256' | 'truecolor' | null
  unicode: true,               // Override unicode detection
  cursor: true,                // Override cursor detection
})
```

The term instance implements `Disposable`, so it works with the `using` keyword for automatic cleanup. You can also call `term[Symbol.dispose]()` manually.

### Detection Methods

Detection results are cached at creation time for consistency.

```ts
using term = createTerm()

// Cursor control - can reposition cursor on screen?
// false for dumb terminals and piped output
term.hasCursor()  // boolean

// Input capability - can read raw keystrokes?
// Requires stdin to be a TTY with raw mode support
term.hasInput()   // boolean

// Color level - what color depth is supported?
// Checks NO_COLOR, FORCE_COLOR, COLORTERM, TERM
term.hasColor()   // 'basic' | '256' | 'truecolor' | null

// Unicode support - can render unicode symbols?
// Checks LANG, TERM_PROGRAM, terminal-specific env vars
term.hasUnicode() // boolean
```

### Terminal Dimensions

```ts
using term = createTerm()

// Live dimensions from the stream (undefined if not a TTY)
term.cols  // number | undefined
term.rows  // number | undefined
```

### Styling

The term instance IS a style chain. No need for separate chalk imports.

```ts
using term = createTerm()

// Basic colors
term.red('error')
term.green('success')
term.yellow('warning')

// Modifiers
term.bold('important')
term.dim('subtle')
term.italic('emphasis')
term.underline('link')
term.strikethrough('deleted')

// Chainable
term.bold.red('bold red')
term.bgBlue.white.bold('inverted')
term.dim.italic.cyan('styled')

// RGB and Hex (with automatic fallback)
term.rgb(255, 100, 0)('custom orange')
term.hex('#FF6400')('hex orange')
term.bgRgb(30, 30, 30).white('dark background')

// 256 colors
term.ansi256(208)('ansi orange')
term.bgAnsi256(236)('dark bg')

// Template literals
term.red`Error: ${message}`
```

**All standard chalk styles are available:**

| Modifiers | Colors | Bright Colors | Background |
|-----------|--------|---------------|------------|
| `reset` | `black` | `blackBright` | `bgBlack` |
| `bold` | `red` | `redBright` | `bgRed` |
| `dim` | `green` | `greenBright` | `bgGreen` |
| `italic` | `yellow` | `yellowBright` | `bgYellow` |
| `underline` | `blue` | `blueBright` | `bgBlue` |
| `overline` | `magenta` | `magentaBright` | `bgMagenta` |
| `inverse` | `cyan` | `cyanBright` | `bgCyan` |
| `hidden` | `white` | `whiteBright` | `bgWhite` |
| `strikethrough` | `gray`/`grey` | | `bgGray`/`bgGrey` |
| `visible` | | | + bright variants |

### Output Methods

```ts
using term = createTerm()

// Write without newline
term.write('Loading...')

// Write with newline
term.writeLine('Done!')

// Combine with styling
term.write(term.bold('Status: '))
term.writeLine(term.green('OK'))

// Access underlying streams
term.stdout  // NodeJS.WriteStream
term.stdin   // NodeJS.ReadStream
```

### Console Patching

Intercept console methods with a subscribable store compatible with React's `useSyncExternalStore`.

```ts
import { patchConsole } from '@beorn/term'

using patched = patchConsole(console)

// Console calls are captured AND passed through to original
console.log('Hello')
console.error('Oops')
console.warn('Warning')

// Read captured entries
const entries = patched.getSnapshot()
// [
//   { method: 'log', args: ['Hello'], stream: 'stdout' },
//   { method: 'error', args: ['Oops'], stream: 'stderr' },
//   { method: 'warn', args: ['Warning'], stream: 'stderr' }
// ]

// Subscribe to changes
const unsubscribe = patched.subscribe(() => {
  const latest = patched.getSnapshot()
  console.log('New entry count:', latest.length)
})

// Cleanup restores original console methods
patched.dispose()  // or let `using` handle it
```

**Intercepted methods:** `log`, `info`, `warn`, `error`, `debug`

### Extended Underlines

Modern terminals support curly, dotted, and dashed underlines. These functions automatically fall back to regular underlines on unsupported terminals.

```ts
import {
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline
} from '@beorn/term'

// Curly/wavy underline (spell-check style)
curlyUnderline('misspelled')

// Other styles
dottedUnderline('hint')
dashedUnderline('suggestion')
doubleUnderline('important')

// Colored underlines (independent of text color)
underlineColor(255, 0, 0, 'red underline')

// Combine style and color
styledUnderline('curly', [255, 0, 0], 'red wavy error')
styledUnderline('dashed', [255, 165, 0], 'orange dashed warning')
styledUnderline('curly', null, 'default color wavy')

// Combine with term styling
using term = createTerm()
term.red(curlyUnderline('error'))
term.yellow(dottedUnderline('warning'))
```

### Hyperlinks

Create clickable links using OSC 8 escape sequences.

```ts
import { hyperlink } from '@beorn/term'

// Basic hyperlink
hyperlink('Visit website', 'https://example.com')

// With styling
using term = createTerm()
term.blue.underline(hyperlink('GitHub', 'https://github.com'))

// In output
term.writeLine(`See ${hyperlink('documentation', 'https://docs.example.com')} for details.`)
```

### Utilities

```ts
import { stripAnsi, displayLength, ANSI_REGEX } from '@beorn/term'

// Remove all ANSI escape codes
stripAnsi('\x1b[31mred text\x1b[0m')  // 'red text'

// Get display width (handles CJK, emoji, ANSI)
displayLength('\x1b[31mhello\x1b[0m')  // 5
displayLength('hello')                  // 5

// ANSI regex for custom processing
const hasAnsi = ANSI_REGEX.test(text)
```

### Standalone Detection Functions

Use these when you need detection without creating a full term instance.

```ts
import {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline
} from '@beorn/term'

detectCursor(process.stdout)    // boolean
detectInput(process.stdin)      // boolean
detectColor(process.stdout)     // ColorLevel | null
detectUnicode()                 // boolean
detectExtendedUnderline()       // boolean
```

---

## Testing

Override detection for predictable test output:

```ts
// Force no colors
using term = createTerm({ color: null })
term.red('still plain')  // No ANSI codes

// Force truecolor
using term = createTerm({ color: 'truecolor' })

// Force ASCII mode
using term = createTerm({ unicode: false })

// Mock streams
const mockStdout = new PassThrough() as unknown as NodeJS.WriteStream
using term = createTerm({ stdout: mockStdout })
```

---

## Comparison to Alternatives

| Feature | @beorn/term | chalk | supports-color |
|---------|-------------|-------|----------------|
| Styling | Built-in chainable | Separate import | N/A |
| Color detection | `hasColor()` | Via supports-color | `supportsColor()` |
| Cursor detection | `hasCursor()` | N/A | N/A |
| Input detection | `hasInput()` | N/A | N/A |
| Unicode detection | `hasUnicode()` | N/A | N/A |
| Console patching | `patchConsole()` | N/A | N/A |
| Extended underlines | Built-in | N/A | N/A |
| Hyperlinks | `hyperlink()` | N/A | N/A |
| Disposable pattern | Native | N/A | N/A |
| Test overrides | Per-instance | Global | N/A |

**Why @beorn/term?**

- **Unified API** - One import for detection + styling + utilities
- **Instance-based** - Each term can have different settings (great for testing)
- **Modern patterns** - Disposable support, `useSyncExternalStore` compatible
- **Extended features** - Curly underlines, hyperlinks, console interception

---

## Terminal Compatibility

### Color Support

| Terminal | Basic | 256 | Truecolor |
|----------|-------|-----|-----------|
| iTerm2 | Yes | Yes | Yes |
| Ghostty | Yes | Yes | Yes |
| Kitty | Yes | Yes | Yes |
| WezTerm | Yes | Yes | Yes |
| Windows Terminal | Yes | Yes | Yes |
| VS Code Terminal | Yes | Yes | Yes |
| macOS Terminal | Yes | Yes | No |
| Linux Console | Yes | No | No |

### Extended Underlines

| Terminal | Curly | Dotted | Dashed | Double |
|----------|-------|--------|--------|--------|
| iTerm2 | Yes | Yes | Yes | Yes |
| Ghostty | Yes | Yes | Yes | Yes |
| Kitty | Yes | Yes | Yes | Yes |
| WezTerm | Yes | Yes | Yes | Yes |
| macOS Terminal | No* | No* | No* | No* |
| VS Code | No* | No* | No* | No* |

*Falls back to standard underline

### Hyperlinks (OSC 8)

| Terminal | Supported |
|----------|-----------|
| iTerm2 | Yes |
| Ghostty | Yes |
| Kitty | Yes |
| WezTerm | Yes |
| Windows Terminal | Yes |
| VS Code Terminal | Yes |
| macOS Terminal | No |

---

## Environment Variables

| Variable | Effect |
|----------|--------|
| `NO_COLOR` | Disables all colors (see [no-color.org](https://no-color.org)) |
| `FORCE_COLOR=0` | Disables colors |
| `FORCE_COLOR=1` | Forces basic (16) colors |
| `FORCE_COLOR=2` | Forces 256 colors |
| `FORCE_COLOR=3` | Forces truecolor |
| `COLORTERM=truecolor` | Indicates truecolor support |
| `COLORTERM=24bit` | Indicates truecolor support |
| `TERM=dumb` | Disables cursor control and colors |

---

## Types

```ts
import type {
  Term,           // Main terminal interface
  StyleChain,     // Chainable styling methods
  PatchedConsole, // Console interceptor
  ColorLevel,     // 'basic' | '256' | 'truecolor'
  ConsoleEntry,   // { method, args, stream }
  ConsoleMethod,  // 'log' | 'info' | 'warn' | 'error' | 'debug'
  CreateTermOptions,
  UnderlineStyle, // 'single' | 'double' | 'curly' | 'dotted' | 'dashed'
  RGB,            // [r, g, b] tuple
  StyleOptions,
} from '@beorn/term'
```

---

## License

MIT
