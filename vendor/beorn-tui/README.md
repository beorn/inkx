# @beorn/tui

[![npm version](https://img.shields.io/npm/v/@beorn/tui.svg)](https://www.npmjs.com/package/@beorn/tui)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

**React-based terminal UI framework** built on [inkx](https://github.com/beorn/inkx) with explicit terminal control, disposable resources, and console capture.

```tsx
import { createTerm, render, Box, Text, useApp, useInput, useTerm } from '@beorn/tui'

function App() {
  const { exit } = useApp()
  const term = useTerm()

  useInput((input) => {
    if (input === 'q') exit()
  })

  return (
    <Box>
      <Text>{term.green('Hello TUI!')} Press q to exit</Text>
    </Box>
  )
}

// Automatic cleanup with Disposables
{
  using term = createTerm()
  using app = await render(term, <App />)
  await app.run()
}
```

## Why @beorn/tui?

- **Explicit terminal binding** - `render(term, element)` makes it clear where you're rendering
- **Disposable pattern** - Resources clean up automatically with `using`
- **Console capture** - Intercept `console.log` and render it in your TUI
- **Progressive enhancement** - Graceful fallback based on terminal capabilities
- **Static rendering** - Generate terminal output strings for non-interactive use

## Installation

```bash
bun add @beorn/tui
# or
npm install @beorn/tui
```

Peer dependencies:
```bash
bun add react yoga-wasm-web
```

## Features

### Basic Rendering

The `render()` function takes an explicit `Term` instance, making it clear where output goes:

```tsx
import { createTerm, render, Box, Text } from '@beorn/tui'

async function main() {
  using term = createTerm()
  using app = await render(term, (
    <Box padding={1}>
      <Text bold>Welcome to my app!</Text>
    </Box>
  ))

  await app.run()
}

main()
```

### Console Capture

Capture `console.log/warn/error` output and display it within your TUI:

```tsx
import { createTerm, patchConsole, render, Box, Text, Console } from '@beorn/tui'
import type { PatchedConsole } from '@beorn/tui'

function App({ console: patched }: { console: PatchedConsole }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Log Output:</Text>
      <Console console={patched} />
      <Text dimColor>---</Text>
      <Text>Status: Running</Text>
    </Box>
  )
}

async function main() {
  using term = createTerm()
  using patched = patchConsole(console)
  using app = await render(term, <App console={patched} />)

  // These appear in the <Console /> component
  console.log('Starting process...')
  console.log('Processing items...')
  console.error('Warning: low memory')

  await app.run()
}
```

### Custom Console Rendering

Use a render prop to customize how console entries appear:

```tsx
<Console console={patched}>
  {(entry, index) => (
    <Box key={index}>
      <Text color="gray">[{entry.method}]</Text>
      <Text color={entry.stream === 'stderr' ? 'red' : 'white'}>
        {' '}{entry.args.join(' ')}
      </Text>
    </Box>
  )}
</Console>
```

The `ConsoleEntry` type provides:
- `method` - The console method called (`'log'`, `'warn'`, `'error'`, etc.)
- `args` - Array of arguments passed to the method
- `stream` - Either `'stdout'` or `'stderr'`
- `timestamp` - When the entry was created

### Static Output with renderString

Generate terminal-styled strings without an interactive app:

```tsx
import { createTerm, renderString, Box, Text } from '@beorn/tui'

// With Term - respects terminal color/unicode capabilities
const term = createTerm()
const output = renderString(term, (
  <Box>
    <Text color="green">Success!</Text>
    <Text> Operation completed</Text>
  </Box>
))
term.write(output + '\n')

// Without Term - explicit options
const plain = renderString(
  <Box><Text>Plain text output</Text></Box>,
  { plain: true }
)

const colored = renderString(
  <Box><Text color="red">Colored output</Text></Box>,
  { color: 'truecolor', width: 120 }
)
```

### Using useTerm in Components

Access terminal capabilities and styling within any component:

```tsx
import { useTerm, Box, Text } from '@beorn/tui'

function StatusLine() {
  const term = useTerm()

  // Access terminal dimensions
  const width = term.cols ?? 80
  const height = term.rows ?? 24

  // Use term's styling methods
  const checkmark = term.hasColor() ? term.green('✓') : '[OK]'

  return (
    <Box width={width}>
      <Text>{checkmark} Connected ({width}x{height})</Text>
    </Box>
  )
}

function ProgressBar({ progress }: { progress: number }) {
  const term = useTerm()

  // Conditional styling based on capabilities
  const filled = term.hasColor()
    ? term.bgGreen(' ')
    : '#'
  const empty = term.hasColor()
    ? term.bgGray(' ')
    : '-'

  const width = 20
  const filledCount = Math.round(progress * width)

  return (
    <Text>
      [{filled.repeat(filledCount)}{empty.repeat(width - filledCount)}]
    </Text>
  )
}
```

### Fullscreen Mode

Use the alternate screen buffer for full-screen applications:

```tsx
import { createTerm, render, Box, Text, useApp, useInput } from '@beorn/tui'

function FullscreenApp() {
  const { exit } = useApp()

  useInput((input, key) => {
    if (key.escape || input === 'q') exit()
  })

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box borderStyle="single" padding={1}>
        <Text bold>Fullscreen Application</Text>
      </Box>
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <Text>Press ESC or Q to exit</Text>
      </Box>
    </Box>
  )
}

async function main() {
  using term = createTerm()
  using app = await render(term, <FullscreenApp />, { fullscreen: true })
  await app.run()
}
```

### Progressive Enhancement

Detect terminal capabilities and adapt your UI:

```tsx
import { createTerm, useTerm, Box, Text } from '@beorn/tui'

function AdaptiveUI() {
  const term = useTerm()

  // Check color support level
  if (!term.hasColor()) {
    return <Text>[INFO] Running in plain text mode</Text>
  }

  // Check unicode support
  const bullet = term.hasUnicode?.() ? '•' : '*'
  const check = term.hasUnicode?.() ? '✓' : '[x]'

  // Check cursor support (for animations)
  if (!term.hasCursor()) {
    return (
      <Box flexDirection="column">
        <Text>{bullet} Feature A: {check}</Text>
        <Text>{bullet} Feature B: {check}</Text>
      </Box>
    )
  }

  // Full interactive mode
  return (
    <Box flexDirection="column">
      <Text color="cyan">{bullet} Feature A: </Text>
      <Text color="green">{check}</Text>
    </Box>
  )
}
```

## Component Reference

### Box

Flexbox container for layout. Re-exported from inkx.

```tsx
<Box
  flexDirection="column"    // 'row' | 'column' | 'row-reverse' | 'column-reverse'
  justifyContent="center"   // 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
  alignItems="center"       // 'flex-start' | 'center' | 'flex-end' | 'stretch'
  width={50}               // number | string (percentage)
  height={10}              // number | string (percentage)
  padding={1}              // number | { top, right, bottom, left }
  margin={1}               // number | { top, right, bottom, left }
  borderStyle="single"     // 'single' | 'double' | 'round' | 'bold' | 'classic'
  borderColor="cyan"       // color name or hex
  flexGrow={1}             // number
  flexShrink={0}           // number
>
  {children}
</Box>
```

### Text

Text rendering with styling. Re-exported from inkx.

```tsx
<Text
  color="green"           // color name, hex, or rgb
  backgroundColor="black" // color name, hex, or rgb
  bold                    // boolean
  italic                  // boolean
  underline               // boolean
  strikethrough           // boolean
  dimColor                // boolean
  inverse                 // boolean
  wrap="truncate"         // 'wrap' | 'truncate' | 'truncate-end' | 'truncate-middle' | 'truncate-start'
>
  Hello World
</Text>
```

### Console

Renders captured console output from a `PatchedConsole`.

```tsx
import { Console } from '@beorn/tui'
import type { PatchedConsole, ConsoleEntry } from '@beorn/tui'

// Default rendering (stderr in red)
<Console console={patchedConsole} />

// Custom rendering
<Console console={patchedConsole}>
  {(entry: ConsoleEntry, index: number) => (
    <Text key={index}>{entry.args.join(' ')}</Text>
  )}
</Console>
```

### Other Components

- `Newline` - Renders a newline character
- `Spacer` - Flexible spacer that fills available space
- `Static` - Renders content that won't be re-rendered (for logs/history)

## Hooks Reference

### useTerm

Access the `Term` instance within components.

```tsx
const term = useTerm()

// Terminal dimensions
term.cols  // number | undefined
term.rows  // number | undefined

// Capability detection
term.hasColor()   // boolean
term.hasCursor()  // boolean
term.hasUnicode?.() // boolean | undefined

// Styling (chalk-compatible)
term.green('text')
term.bold.red('text')
term.bgBlue.white('text')
```

### useConsole

Subscribe to console entries with `useSyncExternalStore`:

```tsx
import { useConsole } from '@beorn/tui'

function LogViewer({ console: patched }: { console: PatchedConsole }) {
  const entries = useConsole(patched)

  return (
    <Box flexDirection="column">
      {entries.map((entry, i) => (
        <Text key={i}>{entry.args.join(' ')}</Text>
      ))}
    </Box>
  )
}
```

### useInput

Handle keyboard input:

```tsx
import { useInput, useApp } from '@beorn/tui'

function App() {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q') exit()
    if (key.upArrow) moveCursorUp()
    if (key.downArrow) moveCursorDown()
    if (key.return) selectItem()
  })

  return <Text>Press q to quit</Text>
}
```

The `key` object includes: `upArrow`, `downArrow`, `leftArrow`, `rightArrow`, `return`, `escape`, `tab`, `backspace`, `delete`, `ctrl`, `meta`, `shift`.

### useApp

Access app lifecycle controls:

```tsx
const { exit } = useApp()

// Exit with optional code
exit()      // exit code 0
exit(1)     // exit code 1
```

### useContentRect / useScreenRect

Get element or screen dimensions:

```tsx
import { useContentRect, useScreenRect, Box, Text } from '@beorn/tui'

function ResponsiveBox() {
  const { width, height } = useScreenRect()

  return (
    <Box width={Math.min(width, 80)}>
      <Text>Window: {width}x{height}</Text>
    </Box>
  )
}
```

### useFocus / useFocusManager

Manage keyboard focus:

```tsx
import { useFocus, Box, Text } from '@beorn/tui'

function FocusableItem({ label }: { label: string }) {
  const { isFocused } = useFocus()

  return (
    <Box borderStyle={isFocused ? 'double' : 'single'}>
      <Text color={isFocused ? 'cyan' : undefined}>{label}</Text>
    </Box>
  )
}
```

## Comparison to Ink

| Feature | Ink | @beorn/tui |
|---------|-----|------------|
| Render API | `render(<App />)` | `render(term, <App />)` |
| Terminal binding | Implicit (process.stdout) | Explicit (Term instance) |
| Resource cleanup | Manual `instance.unmount()` | Disposable with `using` |
| Console capture | Not built-in | `<Console />` component |
| Fullscreen option | `{ alternateScreen: true }` | `{ fullscreen: true }` |
| Wait for exit | `waitUntilExit()` | `run()` (alias) |
| Static rendering | `render()` with `{ stdout: ... }` | `renderString()` |
| Term access | Not available | `useTerm()` hook |
| Capability detection | Manual | Built into Term |

### Migration from Ink

```tsx
// Ink
import { render, Box, Text } from 'ink'

const { waitUntilExit, unmount } = render(<App />)
await waitUntilExit()
unmount()

// @beorn/tui
import { createTerm, render, Box, Text } from '@beorn/tui'

using term = createTerm()
using app = await render(term, <App />)
await app.run()
// Automatic cleanup!
```

## API Reference

### render(term, element, options?)

Renders a React element to the terminal.

**Parameters:**
- `term: Term` - Terminal instance from `createTerm()`
- `element: ReactElement` - React element to render
- `options?: RenderOptions`
  - `fullscreen?: boolean` - Use alternate screen buffer (default: `false`)
  - `exitOnCtrlC?: boolean` - Exit on Ctrl+C (default: `true`)

**Returns:** `Promise<RenderInstance>`
- `rerender(element)` - Update with new element
- `unmount()` - Clean up and unmount
- `run()` - Wait for app to exit
- `clear()` - Clear terminal output
- `dispose()` - Alias for unmount (Disposable pattern)

### renderSync(term, element, options?)

Synchronous version when layout engine is already initialized.

### renderString(term, element, options?)
### renderString(element, options?)

Render to a string for static output.

**With Term:**
- Respects terminal color/unicode capabilities
- `options?: { width?: number }`

**Without Term:**
- `options?: { width?: number, plain?: boolean, color?: ColorLevel }`

### createTerm(options?)

Create a `Term` instance. Re-exported from `@beorn/term`.

### patchConsole(console)

Intercept console methods. Re-exported from `@beorn/term`.

## License

MIT
