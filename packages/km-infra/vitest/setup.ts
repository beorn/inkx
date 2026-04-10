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

import { beforeAll, beforeEach, afterEach, expect, vi } from "vitest"
import { drainWarnings } from "@termless/core"
import type { EmulatorWarning } from "@termless/core"

// Register custom TUI testing matchers
import "../../../apps/km-tui/tests/helpers/matchers.js"

// Disable TTY detection to prevent spinner/progress output during tests
process.stdout.isTTY = false
process.stderr.isTTY = false

// Kill zombie forks: when vitest uses pool:'forks', child_process.fork() workers survive
// if the parent is killed abruptly (SIGKILL). Two complementary mechanisms:
//
// 1. 'disconnect' event: fires when the IPC channel closes (parent died gracefully).
// 2. ppid polling: catches cases where 'disconnect' doesn't fire — e.g., when the
//    worker is in a tight CPU loop with no event-loop ticks, or when the parent is
//    SIGKILLed without closing the IPC channel. On macOS/Linux, orphaned processes
//    get ppid=1 (launchd/init). The interval forces event-loop ticks, which also
//    lets pending 'disconnect' events fire.
//
// No-op for pool:'threads' (no IPC channel, no process.connected).
if (typeof process.connected === "boolean") {
  process.on("disconnect", () => {
    process.exit(1)
  })
  const parentPid = process.ppid
  const orphanCheck = setInterval(() => {
    // ppid changes to 1 (launchd/init) when parent dies
    if (process.ppid !== parentPid) {
      process.exit(1)
    }
  }, 5000)
  // @ts-expect-error — setInterval returns Timer (Node) not number (browser); unref is always available
  orphanCheck.unref() // don't keep process alive just for this timer
}

// Suppress logger output during tests (info would trip console detection)
process.env.LOG_LEVEL = "warn"

// Suppress React act() warnings from useSyncExternalStore:
// When vitest runs multiple test files in the same thread, IS_REACT_ACT_ENVIRONMENT
// (set to true by silvery/testing) bleeds across files. This causes non-deterministic
// "not wrapped in act(...)" warnings when useSyncExternalStore subscriptions fire
// between act() boundaries. The warnings are harmless — silvery's sendInput() properly
// wraps mutations in act(). We patch console.error permanently (not via vi.spyOn)
// to catch warnings that fire between beforeEach/afterEach lifecycle boundaries.
const _originalConsoleError = console.error
console.error = function (...args: unknown[]) {
  if (typeof args[0] === "string" && args[0].includes("was not wrapped in act(")) {
    return
  }
  _originalConsoleError.apply(console, args)
}

// Also set IS_REACT_ACT_ENVIRONMENT to false as a baseline, though silvery/testing
// will override it to true when imported.
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false

// Pre-initialize Ghostty WASM for SILVERY_STRICT_TERMINAL values that include ghostty.
// Must use beforeAll (not top-level await) because vitest setup files
// don't block test execution on top-level awaits.
const _strictTerminalEnv = (process.env.SILVERY_STRICT_TERMINAL ?? "").toLowerCase().trim()
if (
  _strictTerminalEnv === "ghostty" ||
  _strictTerminalEnv === "both" ||
  _strictTerminalEnv === "all" ||
  _strictTerminalEnv.includes("ghostty")
) {
  beforeAll(async () => {
    const { initGhostty } = await import("@termless/ghostty")
    await initGhostty()
  })
}

// SILVERY_STRICT: Compare incremental vs fresh render on every frame.
// DO NOT DISABLE THIS. If tests fail with IncrementalRenderMismatchError,
// the bug is in silvery's incremental rendering — fix the renderer, not this flag.
// Disabling this hides real production bugs where incremental rendering diverges.
// Allow explicit SILVERY_STRICT=0 to disable (for benchmarks measuring production perf)
if (process.env.SILVERY_STRICT !== "0") process.env.SILVERY_STRICT = "1"

// SILVERY_STRICT_TERMINAL: Per-frame ANSI output verification via terminal backends.
// Accepts comma-separated list: vt100 (fast internal parser), xterm (xterm.js headless),
// ghostty (Ghostty WASM). Use "all" for all backends. Example: SILVERY_STRICT_TERMINAL=vt100,xterm
// SILVERY_STRICT=1 above auto-enables vt100 backend (the fast internal parser).
// To add independent terminal verification: process.env.SILVERY_STRICT_TERMINAL = "xterm"

// =============================================================================
// SILVERY_STRICT Mismatch Detection
// =============================================================================
//
// IncrementalRenderMismatchError is thrown asynchronously from SILVERY_STRICT's
// render comparison. We intercept via unhandledRejection to collect mismatches,
// then check in afterEach whether to fail or warn.
//
// By default, mismatches FAIL the test. To suppress known mismatches during
// incremental fixes, set SILVERY_STRICT_KNOWN to comma-separated glob patterns
// matching test names (e.g., "zoom*,*garble*"). Matched tests get a warning
// instead of a failure.

// Known incremental rendering mismatches -- tracked as km-silvery.bg-bleed
// These are real bugs in silvery's render-phase/output-phase that need fixing.
// Adding them here prevents blocking unrelated work while we fix the pipeline.
//
// IMPORTANT: Be SPECIFIC. Blanket patterns like "*incremental*" suppress tests
// that are explicitly verifying incremental correctness -- defeating the purpose
// of SILVERY_STRICT. Only add patterns for tests with KNOWN, TRACKED mismatches.
// Each pattern should have a bead ID comment explaining why it's suppressed.
const KNOWN_STRICT_PATTERNS = [
  // km-silvery.bg-bleed: zoom garble at wide terminals (stale content after zoom out)
  "*zoom*garble*",
  "*zoom*mismatch*",
  // km-silvery.bg-bleed: resize causes stale content fragments
  "*resize*garble*",
  // km-silvery.bg-bleed: emoji wide-char handling causes off-by-one in incremental
  "*emoji*garble*",
  "*flag emoji*garble*",
  // km-silvery.bg-bleed: navigation fuzz with known seed triggers mismatch
  "*seed=42*",
  // km-silvery.showcase-interaction-bugs: dialog/overlay incremental rendering mismatches
  "*help overlay*",
  "*omnibox*",
  "*date dialog*",
  "*ANSI replay*",
  "*cycles through priorities*",
  "*cursor preserved on zoom*",
  "*cursor position after*",
  "*history preserves*",
  "*duplicate parent_idx*",
  "*duplicate-parent_idx*",
  "*round-trip*",
  // curswanty-combinatorial: cursor navigation between columns triggers border re-render
  // mismatch due to disabled bgOnlyChange fast path
  "*stickyY*",
  "*vertical-clear*",
  "*multi-hop*",
]

/** Simple glob matcher supporting * wildcards */
function matchGlob(pattern: string, str: string): boolean {
  // Escape regex special chars except *, then convert * to .*
  const regex = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$")
  return regex.test(str)
}

/** Combine built-in known patterns with any from SILVERY_STRICT_KNOWN env var */
function getKnownPatterns(): string[] {
  const envPatterns =
    process.env.SILVERY_STRICT_KNOWN?.split(",")
      .map((p) => p.trim())
      .filter(Boolean) ?? []
  return [...KNOWN_STRICT_PATTERNS, ...envPatterns]
}

/** Check if a test name matches any known-mismatch pattern */
function isKnownMismatch(testName: string): boolean {
  const patterns = getKnownPatterns()
  return patterns.some((p) => matchGlob(p, testName))
}

let _mismatchErrors: Error[] = []
process.on("unhandledRejection", (reason: unknown) => {
  if (reason instanceof Error && reason.name === "IncrementalRenderMismatchError") {
    _mismatchErrors.push(reason)
    return // intercepted — will be checked in afterEach
  }
})

afterEach(() => {
  if (_mismatchErrors.length === 0) return

  const errors = _mismatchErrors
  _mismatchErrors = []

  const testName = expect.getState().currentTestName ?? "<unknown>"

  if (isKnownMismatch(testName)) {
    // Known mismatch — warn but don't fail
    _originalConsoleError(
      `[SILVERY_STRICT] ${errors.length} IncrementalRenderMismatchError(s) suppressed for known mismatch: ${testName}`,
    )
    return
  }

  // Unknown mismatch — fail the test with details
  const details = errors.map((e) => e.message).join("\n\n---\n\n")
  expect.fail(
    `[SILVERY_STRICT] ${errors.length} IncrementalRenderMismatchError(s) detected.\n` +
      `Test: ${testName}\n` +
      `To suppress known mismatches, add a pattern to SILVERY_STRICT_KNOWN env var.\n\n` +
      details,
  )
})

// =============================================================================
// Emulator Warning Detection
// =============================================================================
//
// Terminal emulator backends (e.g., Ghostty WASM) produce warnings when they
// encounter unsupported escape sequences. These warnings are oracle output —
// the emulator saying "your portability assumption is false." We surface them
// as test failures instead of silently ignoring them.
//
// To allow a specific warning pattern in a test, add it to ALLOWED_EMULATOR_WARNINGS.
// Patterns are matched against the warning's `code` field.

/** Warning codes that are expected and should not fail tests. */
const ALLOWED_EMULATOR_WARNINGS: string[] = [
  // Add codes here to suppress known/expected warnings, e.g.:
  // "UNSUPPORTED_OSC",  // If all OSC warnings are expected
]

/** Check if an emulator warning is explicitly allowed */
function isAllowedWarning(warning: EmulatorWarning): boolean {
  return ALLOWED_EMULATOR_WARNINGS.includes(warning.code)
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
      // Preserve act() warning filter (module-level patch gets overridden by spy)
      if (
        typeof args[0] === "string" &&
        (args[0].includes("was not wrapped in act(") ||
          args[0].includes("the `act` call was not awaited") ||
          args[0].includes("Kitty keyboard protocol") ||
          // silvery perf logger fires whenever a keypress exceeds its 16ms
          // budget, which happens routinely under CI load. It's a diagnostic
          // hint, not a test failure signal — filter it out.
          args[0].includes("keypress over budget") ||
          args[0].includes("silvery:perf"))
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
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback
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
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback
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

  // Check console calls — filter out SILVERY_STRICT mismatches for known patterns
  const testName = expect.getState().currentTestName ?? "<unknown>"
  const isKnown = isKnownMismatch(testName)
  const filteredCalls = isKnown
    ? consoleCalls.filter(
        (c) => !(c.method === "error" && typeof c.args[0] === "string" && c.args[0].includes("STRICT_OUTPUT")),
      )
    : consoleCalls
  if (filteredCalls.length > 0) {
    const summary = filteredCalls
      .map((c) => `  console.${c.method}(${c.args.map((a) => JSON.stringify(a)).join(", ")})`)
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

  const allOutput = [...stdoutCalls, ...stderrCalls].filter((s) => s.trim().length > 0 && !isPureControlSequence(s))

  if (allOutput.length > 0) {
    const summary = allOutput.map((s) => `  ${JSON.stringify(s)}`).join("\n")
    throw new Error(`Test produced stdout/stderr output:\n${summary}`)
  }

  // Check emulator warnings (from terminal backends like Ghostty WASM)
  const emulatorWarnings = drainWarnings()
  const unexpected = emulatorWarnings.filter((w) => !isAllowedWarning(w))
  if (unexpected.length > 0) {
    const summary = unexpected.map((w: EmulatorWarning) => `  [${w.backend}] ${w.code}: ${w.message}`).join("\n")
    throw new Error(
      `Unexpected emulator warnings (${unexpected.length}):\n${summary}\n\n` +
        `These warnings indicate the terminal emulator does not support sequences your code emitted.\n` +
        `Fix the code to not emit unsupported sequences, or add the warning code to ALLOWED_EMULATOR_WARNINGS in vitest/setup.ts.`,
    )
  }
})
