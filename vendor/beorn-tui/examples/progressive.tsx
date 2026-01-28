/**
 * progressive.tsx - Progressive Enhancement
 *
 * Demonstrates how to detect terminal capabilities and choose
 * the appropriate rendering mode:
 * - Full interactive TUI when cursor control and input are available
 * - Static output when running non-interactively (pipes, CI, etc.)
 *
 * This pattern is useful for CLI tools that should:
 * - Show rich interactive UI in a real terminal
 * - Degrade gracefully to plain output in CI/pipes
 * - Respect user preferences (NO_COLOR, etc.)
 *
 * Run with: bun run examples/progressive.tsx
 * Try also: bun run examples/progressive.tsx | cat
 */

import {
  createTerm,
  render,
  renderString,
  Box,
  Text,
  useTerm,
  useApp,
  useInput,
} from '../src/index.js'

interface StatusProps {
  ok: boolean
  message: string
}

/**
 * Status indicator that adapts to terminal capabilities.
 * Uses unicode checkmarks when available, falls back to +/-.
 */
function Status({ ok, message }: StatusProps) {
  // useTerm() accesses the Term from TermContext
  const term = useTerm()

  // Check if terminal supports unicode for fancy icons
  const icon = term.hasUnicode() ? (ok ? '\u2713' : '\u2717') : ok ? '+' : '-'

  return (
    <Text color={ok ? 'green' : 'red'}>
      {icon} {message}
    </Text>
  )
}

/**
 * Interactive app for full TUI mode.
 */
function InteractiveApp() {
  const { exit } = useApp()
  const term = useTerm()

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>System Status (Interactive Mode)</Text>
      <Text dim>
        Terminal: {term.cols}x{term.rows}
      </Text>
      <Text />
      <Status ok={true} message="Database connected" />
      <Status ok={true} message="Cache warmed" />
      <Status ok={false} message="External API degraded" />
      <Status ok={true} message="Background jobs running" />
      <Text />
      <Text dim>Press 'q' to exit</Text>
    </Box>
  )
}

/**
 * Static output component (same data, simpler layout).
 */
function StaticReport() {
  return (
    <Box flexDirection="column">
      <Text bold>System Status</Text>
      <Status ok={true} message="Database connected" />
      <Status ok={true} message="Cache warmed" />
      <Status ok={false} message="External API degraded" />
      <Status ok={true} message="Background jobs running" />
    </Box>
  )
}

// Main entry point with progressive enhancement
const term = createTerm()

try {
  // Check if we have full terminal capabilities
  const hasCursor = term.hasCursor() // Can reposition cursor?
  const hasInput = term.hasInput() // Can read raw keystrokes?

  if (hasCursor && hasInput) {
    // Full interactive TUI mode
    // Use fullscreen (alternate screen) for a clean exit
    using app = await render(term, <InteractiveApp />, { fullscreen: true })
    await app.run()
  } else {
    // Non-interactive mode (piped output, CI environment, etc.)
    // Use renderString for static output
    const output = renderString(term, <StaticReport />)
    term.writeLine(output)

    // Optionally indicate why we're in static mode
    if (!hasCursor) {
      term.writeLine(term.dim('\n(Running in non-interactive mode: no cursor control)'))
    } else if (!hasInput) {
      term.writeLine(term.dim('\n(Running in non-interactive mode: no raw input)'))
    }
  }
} finally {
  // Always clean up the term
  term[Symbol.dispose]()
}
