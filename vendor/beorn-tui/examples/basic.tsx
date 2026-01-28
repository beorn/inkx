/**
 * basic.tsx - Basic TUI Application
 *
 * Demonstrates the minimal setup for a @beorn/tui app:
 * - Creating a Term instance for terminal detection
 * - Rendering a React component to the terminal
 * - Handling keyboard input with useInput
 * - Clean exit with useApp
 *
 * Run with: bun run examples/basic.tsx
 */

import { createTerm, render, Box, Text, useApp, useInput } from '../src/index.js'

/**
 * Simple App component that displays a welcome message
 * and exits when 'q' or Escape is pressed.
 */
function App() {
  // useApp provides control over the application lifecycle
  const { exit } = useApp()

  // useInput handles keyboard input
  // The callback receives the input character and a key object with modifiers
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Welcome to @beorn/tui!</Text>
      <Text>Press 'q' to quit</Text>
    </Box>
  )
}

// Main entry point using Explicit Resource Management (using keyword)
// This ensures proper cleanup of terminal state even if an error occurs
{
  // Create a Term instance - handles terminal detection and capabilities
  // The 'using' keyword ensures term[Symbol.dispose]() is called on exit
  using term = createTerm()

  // Render the App component to the terminal
  // Returns a RenderInstance that is also Disposable
  using app = await render(term, <App />)

  // Wait for the app to exit (blocks until exit() is called)
  await app.run()
}
