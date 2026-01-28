/**
 * custom-console.tsx - Custom Console Rendering
 *
 * Demonstrates how to customize the rendering of console entries
 * using the Console component's render prop (children function).
 *
 * This allows you to:
 * - Add timestamps or prefixes
 * - Color-code by log level (log, warn, error)
 * - Filter or transform entries
 * - Add custom formatting
 *
 * Run with: bun run examples/custom-console.tsx
 */

import {
  createTerm,
  patchConsole,
  render,
  Box,
  Text,
  Console,
  useApp,
  useInput,
  type PatchedConsole,
  type ConsoleEntry,
} from '../src/index.js'

interface AppProps {
  console: PatchedConsole
}

/**
 * Format a ConsoleEntry's args into a single string.
 */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

/**
 * Get color based on console method.
 */
function getColorForMethod(
  method: ConsoleEntry['method']
): 'red' | 'yellow' | 'blue' | 'gray' | undefined {
  switch (method) {
    case 'error':
      return 'red'
    case 'warn':
      return 'yellow'
    case 'debug':
      return 'gray'
    case 'info':
      return 'blue'
    default:
      return undefined
  }
}

/**
 * Get prefix icon based on console method.
 */
function getPrefixForMethod(method: ConsoleEntry['method']): string {
  switch (method) {
    case 'error':
      return '[ERROR]'
    case 'warn':
      return '[WARN] '
    case 'debug':
      return '[DEBUG]'
    case 'info':
      return '[INFO] '
    default:
      return '[LOG]  '
  }
}

function App({ console: patched }: AppProps) {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>
        Custom Console Rendering
      </Text>
      <Text />

      {/*
       * Console accepts a render function as children.
       * The function receives each entry and its index.
       * Return a React element to customize how each entry is displayed.
       */}
      <Console console={patched}>
        {(entry, i) => (
          <Text key={i} color={getColorForMethod(entry.method)}>
            {getPrefixForMethod(entry.method)} {formatArgs(entry.args)}
          </Text>
        )}
      </Console>

      <Text />
      <Text dim>Press 'q' to quit</Text>
    </Box>
  )
}

// Main entry point
{
  using term = createTerm()
  using patched = patchConsole(console)
  using app = await render(term, <App console={patched} />)

  // Demonstrate different log levels
  console.log('Application started')
  console.info('Connected to database')
  console.debug('Query executed in 5ms')
  console.warn('Deprecated API usage detected')
  console.error('Failed to load resource')
  console.log('Continuing with defaults...')

  await app.run()
}
