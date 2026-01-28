/**
 * Test quality enforcement preload script
 *
 * Enforces that tests must be silent on success - fail if ANY output to stdout/stderr.
 *
 * Usage: Add to bunfig.toml: preload = ["./tests/fail-on-console.ts"]
 *
 * To allow specific console output in a test, spy on the method:
 *   const spy = spyOn(console, "log").mockImplementation(() => {})
 *   // ... test code ...
 *   expect(spy).toHaveBeenCalledWith("expected message")
 *   spy.mockRestore()
 *
 * Or set SKIP_OUTPUT_CHECK=1 to disable output checking entirely.
 */

import { afterEach, beforeEach, spyOn } from "bun:test"

// Skip output checking if explicitly disabled
const SKIP_OUTPUT_CHECK = process.env.SKIP_OUTPUT_CHECK === "1"

// Disable TTY detection to prevent spinner/progress output during tests
// Code like bootstrap.ts and load-repo.ts check isTTY before showing spinners
process.stdout.isTTY = false
process.stderr.isTTY = false

// =============================================================================
// TUI Event Emitter Cleanup
// =============================================================================

// Import tuiEvents lazily to avoid errors when not running TUI tests
let tuiEvents: import("events").EventEmitter | null = null

// Async IIFE to load tuiEvents at module load time
void (async () => {
  try {
    const tui = await import("../apps/km-tui/src/tui.ts")
    tuiEvents = tui.tuiEvents
  } catch {
    // Not in TUI test context, ignore
  }
})()

/** Clean up TUI-related event listeners that accumulate across tests */
function cleanupTuiListeners() {
  if (tuiEvents) {
    tuiEvents.removeAllListeners()
  }
  if (process.stdin.listenerCount("data") > 0) {
    process.stdin.removeAllListeners("data")
  }
}

// =============================================================================
// Capture Node Warnings (to fail tests)
// =============================================================================

// Raise limit high enough for test suites that create many Board components
// Each Board adds listeners for refresh, watcher-status, stdin data, etc.
process.setMaxListeners(200)
process.stdin.setMaxListeners(200)

// Capture warnings to fail tests (MaxListenersExceededWarning, etc.)
let capturedWarnings: Error[] = []

process.emitWarning = ((warning: string | Error): void => {
  // Convert to Error if string
  const err = typeof warning === "string" ? new Error(warning) : warning
  capturedWarnings.push(err)
  // Don't call original - we'll report in afterEach instead
}) as typeof process.emitWarning

// Also capture via 'warning' event (some warnings go this route)
process.on("warning", (warning: Error) => {
  capturedWarnings.push(warning)
})

// =============================================================================
// Console Detection
// =============================================================================

interface ConsoleCall {
  method: string
  args: unknown[]
}

let consoleCalls: ConsoleCall[] = []
let spies: Array<{ mockRestore: () => void }> = []

// Monitor all console output methods - tests must be silent on success
const CONSOLE_METHODS = ["log", "info", "debug", "warn", "error"] as const

// =============================================================================
// stdout/stderr Interception
// =============================================================================

let stdoutCalls: string[] = []
let stderrCalls: string[] = []

// Store original methods (bound to preserve context)
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
  capturedWarnings = []

  // Clean up TUI listeners before each test
  cleanupTuiListeners()

  if (!SKIP_OUTPUT_CHECK) {
    // Spy on console methods
    spies = CONSOLE_METHODS.map((method) =>
      spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoleCalls.push({ method, args })
      }),
    )

    // Intercept stdout.write
    process.stdout.write = ((
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
      callback?: (err?: Error) => void,
    ): boolean => {
      stdoutCalls.push(String(chunk))
      // Call callback if provided
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
      // Call callback if provided
      const cb =
        typeof encodingOrCallback === "function" ? encodingOrCallback : callback
      if (cb) cb()
      return true
    }) as typeof process.stderr.write
  }
})

afterEach(() => {
  // Clean up TUI listeners after each test to prevent accumulation
  cleanupTuiListeners()

  // Restore console spies
  spies.forEach((spy) => spy.mockRestore())

  // Restore stdout/stderr
  if (!SKIP_OUTPUT_CHECK) {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
  }

  // Fail if any output was produced (unless checking is disabled)
  if (!SKIP_OUTPUT_CHECK) {
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
    // Only filter pure terminal control sequences (ANSI codes with no content)
    // Real output like spinners should FAIL - tests must capture it themselves
    const isPureControlSequence = (s: string) => {
      // Strip ANSI escape sequences and check if anything meaningful remains
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

    // Check for Node warnings (MaxListenersExceededWarning, etc.)
    if (capturedWarnings.length > 0) {
      const summary = capturedWarnings
        .map((w) => `  ${w.name}: ${w.message}`)
        .join("\n")
      throw new Error(`Test triggered Node.js warning(s):\n${summary}`)
    }
  }
})
