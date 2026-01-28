/**
 * static-output.tsx - Static Output with renderString
 *
 * Demonstrates renderString() for non-interactive output.
 * Unlike render(), renderString() returns a string immediately
 * without starting an interactive session.
 *
 * Use cases:
 * - CLI tools that output formatted results
 * - Generating styled text for piping to files
 * - Testing component output
 * - One-shot displays (no interaction needed)
 *
 * Run with: bun run examples/static-output.tsx
 */

import { createTerm, renderString, Box, Text, useTerm } from '../src/index.js'

interface StatsProps {
  passed: number
  failed: number
  skipped: number
}

/**
 * Component that displays test statistics.
 * Uses useTerm() for terminal-aware rendering when Term is available.
 */
function TestStats({ passed, failed, skipped }: StatsProps) {
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Text bold>Test Results</Text>
      <Text />
      <Box gap={2}>
        <Text color="green">{passed} passed</Text>
        <Text color="red">{failed} failed</Text>
        <Text color="yellow">{skipped} skipped</Text>
      </Box>
      <Text />
      <Text dim>Total: {passed + failed + skipped} tests</Text>
    </Box>
  )
}

/**
 * Component that adapts to terminal capabilities using useTerm().
 * Falls back gracefully when unicode/color is not available.
 */
function StatusLine({ ok, message }: { ok: boolean; message: string }) {
  // useTerm() only works when rendered via render(term, ...) or renderString(term, ...)
  // It will throw if used in renderString() without a Term
  try {
    const term = useTerm()
    const icon = term.hasUnicode() ? (ok ? '\u2713' : '\u2717') : ok ? '+' : '-'
    return <Text color={ok ? 'green' : 'red'}>{icon} {message}</Text>
  } catch {
    // Fallback when no Term context (renderString without term)
    const icon = ok ? '+' : '-'
    return <Text>{icon} {message}</Text>
  }
}

function Report() {
  return (
    <Box flexDirection="column">
      <StatusLine ok={true} message="Build completed" />
      <StatusLine ok={true} message="Tests passed" />
      <StatusLine ok={false} message="Coverage below threshold" />
    </Box>
  )
}

// Example 1: renderString with Term - respects terminal capabilities
console.log('=== With Term (terminal-aware) ===')
{
  const term = createTerm()
  try {
    const output = renderString(term, <TestStats passed={42} failed={3} skipped={5} />)
    // Use term.writeLine to output (or just console.log)
    term.writeLine(output)
    term.writeLine('')

    // Report uses useTerm() for capability detection
    term.writeLine(renderString(term, <Report />))
  } finally {
    term[Symbol.dispose]()
  }
}

// Example 2: renderString without Term - plain text mode
console.log('\n=== Without Term (plain text) ===')
{
  // plain: true strips all ANSI codes for clean text output
  const plainOutput = renderString(<TestStats passed={42} failed={3} skipped={5} />, {
    plain: true,
  })
  console.log(plainOutput)
}

// Example 3: renderString with explicit width
console.log('\n=== Narrow width (40 columns) ===')
{
  const narrowOutput = renderString(<TestStats passed={42} failed={3} skipped={5} />, {
    width: 40,
  })
  console.log(narrowOutput)
}

// Example 4: renderString with color even without TTY
console.log('\n=== Forced color output ===')
{
  // color option forces ANSI codes even when not connected to a TTY
  const coloredOutput = renderString(<TestStats passed={42} failed={3} skipped={5} />, {
    color: 'truecolor',
  })
  console.log(coloredOutput)
}
