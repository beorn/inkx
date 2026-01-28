/**
 * Vitest test quality enforcement setup
 *
 * Enforces that tests must be silent on success - fail on any console.* output.
 * This is the vitest equivalent of fail-on-console.ts (for bun:test).
 *
 * NOTE: We only intercept console methods, not stdout/stderr directly.
 * The custom KmReporter (infra/vitest-reporter.ts) uses process.stdout.write
 * for its output, so we can't intercept that without breaking reporter output.
 * Test code should use console.* methods anyway, not raw stdout/stderr.
 *
 * To allow specific console output in a test, spy on the method:
 *   const spy = vi.spyOn(console, "log").mockImplementation(() => {})
 *   // ... test code ...
 *   expect(spy).toHaveBeenCalledWith("expected message")
 *   spy.mockRestore()
 */

import { beforeEach, afterEach, vi } from "vitest"

// Disable TTY detection to prevent spinner/progress output during tests
process.stdout.isTTY = false
process.stderr.isTTY = false

// =============================================================================
// Filter Terminal Escape Sequences
// =============================================================================

// Some child processes (via Bun.spawn) emit terminal control sequences even with
// TERM=dumb. Filter out common offenders that pollute test output.
// This preserves color codes (used by reporter) but removes mode-switching sequences.

const originalStdoutWrite = process.stdout.write.bind(process.stdout)
const originalStderrWrite = process.stderr.write.bind(process.stderr)

// Sequences to filter: bracketed paste mode, cursor visibility, etc.
// These appear as raw escape codes in non-TTY output from child processes
const FILTER_SEQUENCES = [
  "\x1b[?2004h", // Enable bracketed paste mode
  "\x1b[?2004l", // Disable bracketed paste mode
  "\x1b[?25h", // Show cursor
  "\x1b[?25l", // Hide cursor
]

function filterEscapeSequences(data: unknown): unknown {
  if (typeof data === "string") {
    let filtered = data
    for (const seq of FILTER_SEQUENCES) {
      filtered = filtered.replaceAll(seq, "")
    }
    return filtered
  }
  if (Buffer.isBuffer(data)) {
    let str = data.toString()
    for (const seq of FILTER_SEQUENCES) {
      str = str.replaceAll(seq, "")
    }
    return str
  }
  return data
}

// @ts-expect-error - overloaded signature
process.stdout.write = (chunk: unknown, ...args: unknown[]) => {
  const filtered = filterEscapeSequences(chunk)
  return originalStdoutWrite(filtered, ...args)
}

// @ts-expect-error - overloaded signature
process.stderr.write = (chunk: unknown, ...args: unknown[]) => {
  const filtered = filterEscapeSequences(chunk)
  return originalStderrWrite(filtered, ...args)
}

// =============================================================================
// Console Detection
// =============================================================================

interface ConsoleCall {
  method: string
  args: unknown[]
}

let consoleCalls: ConsoleCall[] = []
const CONSOLE_METHODS = ["log", "info", "debug", "warn", "error"] as const

// =============================================================================
// Lifecycle Hooks
// =============================================================================

beforeEach(() => {
  // Reset tracking
  consoleCalls = []

  // Spy on console methods
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push({ method, args })
    })
  }
})

afterEach(() => {
  // Restore console spies
  vi.restoreAllMocks()

  // Check console calls
  if (consoleCalls.length > 0) {
    const summary = consoleCalls
      .map(
        (c) =>
          `  console.${c.method}(${c.args.map((a) => JSON.stringify(a)).join(", ")})`,
      )
      .join("\n")
    throw new Error(`Test produced console output:\n${summary}`)
  }
})
