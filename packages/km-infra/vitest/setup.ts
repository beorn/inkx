/**
 * Vitest test quality enforcement setup
 *
 * Enforces that tests must be silent on success - fail if ANY output to stdout/stderr.
 * This is the vitest equivalent of fail-on-console.ts (for bun:test).
 *
 * To allow specific console output in a test, spy on the method:
 *   const spy = vi.spyOn(console, "log").mockImplementation(() => {})
 *   // ... test code ...
 *   expect(spy).toHaveBeenCalledWith("expected message")
 *   spy.mockRestore()
 */

/* eslint-disable promise/prefer-await-to-callbacks -- Implements Node.js stream.write() API which requires callback support */

import { beforeEach, afterEach, vi } from "vitest"

// Register custom TUI testing matchers
import "../../../apps/km-tui/tests/helpers/matchers.js"

// Disable TTY detection to prevent spinner/progress output during tests
process.stdout.isTTY = false
process.stderr.isTTY = false

// Suppress React act() warnings: inkx test renderer handles state updates
// synchronously without act() wrapping. React's act() detection causes
// spurious "not wrapped in act(...)" warnings on every press() call.
globalThis.IS_REACT_ACT_ENVIRONMENT = false

// INKX_STRICT: Opt-in incremental vs fresh render comparison.
// Enable with: INKX_STRICT=1 bun vitest run
// This catches rendering bugs where incremental rendering differs from fresh.
// Not enabled by default until all known incremental bugs are fixed.
// See: km-inkx.incremental-* beads for known issues.

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
// stdout/stderr Interception
// =============================================================================

let stdoutCalls: string[] = []
let stderrCalls: string[] = []

// Store original methods
const originalStdoutWrite = process.stdout.write.bind(process.stdout)
const originalStderrWrite = process.stderr.write.bind(process.stderr)

// =============================================================================
// Lifecycle Hooks
// =============================================================================

beforeEach(() => {
  // Reset tracking
  consoleCalls = []
  stdoutCalls = []
  stderrCalls = []

  // Spy on console methods
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      // Suppress React act() warnings — inkx test renderer handles state
      // updates synchronously; React's act() detection is a false positive.
      if (
        method === "error" &&
        typeof args[0] === "string" &&
        args[0].includes("was not wrapped in act(...)")
      ) {
        return
      }
      consoleCalls.push({ method, args })
    })
  }

  // Intercept stdout.write
  process.stdout.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void,
  ): boolean => {
    stdoutCalls.push(String(chunk))
    const cb =
      typeof encodingOrCallback === "function" ? encodingOrCallback : callback
    if (cb) cb()
    return true
  }) as typeof process.stdout.write

  // Intercept stderr.write
  process.stderr.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void,
  ): boolean => {
    stderrCalls.push(String(chunk))
    const cb =
      typeof encodingOrCallback === "function" ? encodingOrCallback : callback
    if (cb) cb()
    return true
  }) as typeof process.stderr.write
})

afterEach(() => {
  // Restore console spies
  vi.restoreAllMocks()

  // Restore stdout/stderr
  process.stdout.write = originalStdoutWrite
  process.stderr.write = originalStderrWrite

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

  // Check stdout/stderr
  // Filter pure control sequences (ANSI codes with no meaningful content)
  const isPureControlSequence = (s: string) => {
    const stripped = s
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "") // ANSI CSI sequences
      .replace(/\x1b\][^\x07]*\x07/g, "") // OSC sequences
      .replace(/\x07/g, "") // Bell
      .replace(/\r/g, "") // CR
      .trim()
    return stripped.length === 0
  }

  const allOutput = [...stdoutCalls, ...stderrCalls].filter(
    (s) => s.trim().length > 0 && !isPureControlSequence(s),
  )

  if (allOutput.length > 0) {
    const summary = allOutput.map((s) => `  ${JSON.stringify(s)}`).join("\n")
    throw new Error(`Test produced stdout/stderr output:\n${summary}`)
  }
})
