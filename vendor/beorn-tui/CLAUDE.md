# @beorn/tui - Terminal UI Framework

React-based terminal UI combining inkx and @beorn/term.

## Imports

```tsx
// Components
import { Box, Text, Newline, Spacer, Static, Console } from '@beorn/tui'

// Hooks
import { useInput, useApp, useTerm, useConsole, useContentRect } from '@beorn/tui'

// Render functions
import { render, renderString, createTerm, patchConsole } from '@beorn/tui'
```

## Common Patterns

### Basic App with Term

```tsx
import { createTerm, render, Box, Text, useApp, useTerm } from '@beorn/tui'

function App() {
  const { exit } = useApp()
  const term = useTerm()

  return (
    <Box>
      <Text>{term.green('Hello!')}</Text>
      <Text>{term.cols}x{term.rows}</Text>
    </Box>
  )
}

// Using Disposables
{
  using term = createTerm()
  using app = await render(term, <App />)
  await app.run()
}
```

### Console Capture

```tsx
import { createTerm, patchConsole, render, Box, Console } from '@beorn/tui'

function App({ console: patched }: { console: PatchedConsole }) {
  return (
    <Box flexDirection="column">
      <Console console={patched} />
      <Text>Status: running</Text>
    </Box>
  )
}

{
  using term = createTerm()
  using patched = patchConsole(console)
  using app = await render(term, <App console={patched} />)

  // Console.log calls now appear in <Console />
  console.log('This appears above the status line')

  await app.run()
}
```

### Custom Console Rendering

```tsx
<Console console={patched}>
  {(entry, i) => (
    <Text key={i} color={entry.stream === 'stderr' ? 'red' : 'gray'}>
      [{entry.method}] {entry.args.join(' ')}
    </Text>
  )}
</Console>
```

### Static Output (renderString)

```tsx
import { createTerm, renderString, Box, Text } from '@beorn/tui'

// With Term - respects color/unicode capabilities
const term = createTerm()
const output = renderString(term, <Summary stats={stats} />)
term.write(output)

// Without Term - plain text
const plain = renderString(<Summary stats={stats} />, { plain: true })
```

### Access Term in Components

```tsx
import { useTerm } from '@beorn/tui'

function ColoredOutput() {
  const term = useTerm()

  // Use term's capabilities
  if (term.hasColor()) {
    return <Text>{term.green('✓')} Passed</Text>
  }
  return <Text>[OK] Passed</Text>
}
```

## API Differences from inkx

| inkx | @beorn/tui |
|------|------------|
| `render(<App />)` | `render(term, <App />)` |
| `{ alternateScreen: true }` | `{ fullscreen: true }` |
| `waitUntilExit()` | `run()` (alias available) |
| Manual cleanup | Disposable (`using`) |

## Key Exports

| Export | Source | Description |
|--------|--------|-------------|
| `render` | tui | `render(term, element)` |
| `renderString` | tui | Static render to string |
| `Console` | tui | Console output component |
| `useTerm` | tui | Access Term in components |
| `useConsole` | tui | Subscribe to console entries |
| `createTerm` | term | Create Term instance |
| `patchConsole` | term | Intercept console methods |
| `Box`, `Text`, etc | inkx | UI components |
| `useInput`, etc | inkx | Input/lifecycle hooks |
