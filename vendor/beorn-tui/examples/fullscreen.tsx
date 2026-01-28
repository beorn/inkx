/**
 * fullscreen.tsx - Fullscreen Alternate Screen Mode
 *
 * Demonstrates the fullscreen option which uses the terminal's
 * alternate screen buffer. This:
 * - Clears the screen and provides a blank canvas
 * - Preserves the user's scroll history
 * - Restores the original screen when the app exits
 *
 * This is the standard mode for full-screen TUI applications like:
 * - Text editors (vim, nano)
 * - File managers (mc, ranger)
 * - Dashboard applications
 *
 * Run with: bun run examples/fullscreen.tsx
 */

import {
  createTerm,
  render,
  Box,
  Text,
  useTerm,
  useApp,
  useInput,
  useScreenRect,
} from '../src/index.js'
import { useState, useEffect } from 'react'

/**
 * A simple fullscreen dashboard that fills the terminal.
 */
function Dashboard() {
  const { exit } = useApp()
  const term = useTerm()

  // useScreenRect provides the actual terminal dimensions
  const rect = useScreenRect()

  // Track keypresses for display
  const [lastKey, setLastKey] = useState<string>('(none)')

  // Simple clock that updates every second
  const [time, setTime] = useState(new Date().toLocaleTimeString())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
    } else {
      // Display what was pressed
      const parts: string[] = []
      if (key.ctrl) parts.push('Ctrl')
      if (key.meta) parts.push('Meta')
      if (key.shift) parts.push('Shift')
      if (input) {
        parts.push(input === ' ' ? 'Space' : input)
      } else if (key.return) {
        parts.push('Enter')
      } else if (key.upArrow) {
        parts.push('Up')
      } else if (key.downArrow) {
        parts.push('Down')
      } else if (key.leftArrow) {
        parts.push('Left')
      } else if (key.rightArrow) {
        parts.push('Right')
      } else if (key.tab) {
        parts.push('Tab')
      } else if (key.backspace) {
        parts.push('Backspace')
      } else if (key.delete) {
        parts.push('Delete')
      }
      setLastKey(parts.join('+') || '(unknown)')
    }
  })

  return (
    <Box
      flexDirection="column"
      width={rect?.width ?? term.cols ?? 80}
      height={rect?.height ?? term.rows ?? 24}
    >
      {/* Header bar */}
      <Box
        width="100%"
        justifyContent="space-between"
        paddingX={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
      >
        <Text bold>Fullscreen Dashboard</Text>
        <Text>{time}</Text>
      </Box>

      {/* Main content area */}
      <Box flexDirection="column" flexGrow={1} padding={2}>
        <Text bold>Terminal Information</Text>
        <Text />
        <Box gap={4}>
          <Box flexDirection="column">
            <Text dimColor>Size:</Text>
            <Text dimColor>Color:</Text>
            <Text dimColor>Unicode:</Text>
            <Text dimColor>Cursor:</Text>
            <Text dimColor>Input:</Text>
          </Box>
          <Box flexDirection="column">
            <Text>
              {rect?.width ?? term.cols ?? '?'}x{rect?.height ?? term.rows ?? '?'}
            </Text>
            <Text>{term.hasColor() ?? 'none'}</Text>
            <Text>{term.hasUnicode() ? 'yes' : 'no'}</Text>
            <Text>{term.hasCursor() ? 'yes' : 'no'}</Text>
            <Text>{term.hasInput() ? 'yes' : 'no'}</Text>
          </Box>
        </Box>

        <Text />
        <Text bold>Keyboard Test</Text>
        <Text>
          Last key: <Text color="cyan">{lastKey}</Text>
        </Text>
        <Text dim>Press any key to see it displayed</Text>
      </Box>

      {/* Footer bar */}
      <Box width="100%" paddingX={1} borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false}>
        <Text dim>Press 'q' or Esc to exit</Text>
      </Box>
    </Box>
  )
}

// Main entry point
{
  using term = createTerm()

  // fullscreen: true switches to alternate screen buffer
  // The screen will be restored when the app exits
  using app = await render(term, <Dashboard />, {
    fullscreen: true,
  })

  await app.run()
}
