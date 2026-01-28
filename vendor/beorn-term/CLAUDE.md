# @beorn/term - Terminal Detection, Styling, and Primitives

Terminal abstraction with Disposable pattern support.

## Imports

```ts
// Main API
import { createTerm, patchConsole, chalk } from '@beorn/term'

// Types
import type { Term, StyleChain, PatchedConsole, ColorLevel, ConsoleEntry } from '@beorn/term'

// Utilities
import { stripAnsi, displayLength, hyperlink, curlyUnderline } from '@beorn/term'

// Detection (usually accessed via term instance)
import { detectColor, detectCursor, detectInput, detectUnicode } from '@beorn/term'
```

## Common Patterns

### Basic Usage

```ts
import { createTerm } from '@beorn/term'

// Create term (Disposable)
using term = createTerm()

// Detection
term.hasCursor()    // boolean - can reposition cursor?
term.hasInput()     // boolean - can read raw keystrokes?
term.hasColor()     // 'basic' | '256' | 'truecolor' | null
term.hasUnicode()   // boolean - can render unicode?

// Dimensions
term.cols           // number | undefined
term.rows           // number | undefined

// Output
term.write('hello')
term.writeLine('world')
```

### Flattened Styling

```ts
// term IS the style chain - no .chalk prefix
term.red('error')
term.bold.green('success')
term.rgb(255, 100, 0).bold('orange bold')
term.bgBlue.white('inverted')

// Combine with write
term.write(term.red.bold('Error: '))
term.writeLine(term.dim('details here'))
```

### Console Patching

```ts
import { patchConsole } from '@beorn/term'

// Patch console - Disposable
using patched = patchConsole(console)

// All console calls are captured
console.log('hello')
console.error('oops')

// Read captured entries
patched.getSnapshot()  // ConsoleEntry[]

// Subscribe to changes (useSyncExternalStore compatible)
const unsubscribe = patched.subscribe(() => {
  const entries = patched.getSnapshot()
  // react to new entries
})
```

### Testing with Overrides

```ts
// Force specific capabilities for testing
using term = createTerm({ color: null })        // No colors
using term = createTerm({ color: 'truecolor' }) // Force truecolor
using term = createTerm({ unicode: false })     // Force ASCII
using term = createTerm({ cursor: false })      // No cursor control

// Custom streams
using term = createTerm({ stdout: mockStream, stdin: mockStdin })
```

### Extended Underlines

```ts
import { curlyUnderline, dottedUnderline, hyperlink } from '@beorn/term'

// Wavy underline (spell-check style)
curlyUnderline('misspelled')

// Hyperlinks
hyperlink('Click here', 'https://example.com')

// Combined with term styling
term.red(curlyUnderline('error'))
```

## Anti-Patterns

### Wrong: Using chalk separately

```ts
// WRONG - loses color level synchronization
import chalk from 'chalk'
import { createTerm } from '@beorn/term'

using term = createTerm({ color: null })
chalk.red('still colored!')  // chalk doesn't know about term's color setting

// RIGHT - use term's styling
term.red('properly no-color')
```

### Wrong: Forgetting Disposable cleanup

```ts
// WRONG - leaks resources
const term = createTerm()
const patched = patchConsole(console)
// ... console stays patched forever

// RIGHT - use 'using' or manual dispose
using term = createTerm()
using patched = patchConsole(console)
// automatically cleaned up

// OR
const term = createTerm()
try {
  // ... use term
} finally {
  term[Symbol.dispose]()
}
```

## Key Types

| Type | Description |
|------|-------------|
| `Term` | Main terminal interface with detection, styling, I/O |
| `StyleChain` | Chainable styling methods (bold, red, rgb, etc) |
| `PatchedConsole` | Console interceptor with getSnapshot/subscribe |
| `ColorLevel` | `'basic' \| '256' \| 'truecolor'` |
| `ConsoleEntry` | `{ method, args, stream }` |

## Detection Details

| Method | What it checks |
|--------|----------------|
| `hasCursor()` | `stdout.isTTY && TERM !== 'dumb'` |
| `hasInput()` | `stdin.isTTY && setRawMode available` |
| `hasColor()` | NO_COLOR, FORCE_COLOR, COLORTERM, TERM |
| `hasUnicode()` | LANG, TERM_PROGRAM, KITTY_WINDOW_ID |
