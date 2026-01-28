/**
 * console-capture.tsx - Console Capture Example
 *
 * Demonstrates how to capture console.log/error output and display it
 * within the TUI. This is useful for:
 * - Showing log output above a status bar
 * - Debugging TUI apps without breaking the display
 * - Creating log viewers or debug panels
 *
 * Run with: bun run examples/console-capture.tsx
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
} from '../src/index.js'

interface AppProps {
  console: PatchedConsole
}

/**
 * App with a console output panel and status bar.
 * Console entries appear in the Console component as they're logged.
 */
function App({ console: patched }: AppProps) {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Text bold>Console Output:</Text>

      {/* Console component renders all captured entries */}
      {/* It uses useSyncExternalStore internally to react to new entries */}
      <Console console={patched} />

      {/* Separator */}
      <Text dim>---</Text>

      {/* Status bar - always visible at bottom */}
      <Text>Status: Running (press 'q' to quit)</Text>
    </Box>
  )
}

// Main entry point
{
  // Create terminal instance
  using term = createTerm()

  // Patch the global console object to intercept all output
  // The 'using' keyword ensures the original console is restored on exit
  using patched = patchConsole(console)

  // Render with the patched console passed as a prop
  using app = await render(term, <App console={patched} />)

  // These console calls are captured and displayed in the Console component
  // They don't go directly to stdout - they're intercepted and rendered by React
  console.log('Starting application...')
  console.log('Loading configuration...')
  console.log('Connecting to server...')

  // Simulate some async activity
  setTimeout(() => console.log('Connection established!'), 500)
  setTimeout(() => console.log('Ready.'), 1000)

  // Wait for exit
  await app.run()
}
