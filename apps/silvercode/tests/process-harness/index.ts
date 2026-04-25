/**
 * silvercode test process-harness — spawn the real CLI in a PTY subprocess
 * so tests can drive it through alt-screen ANSI exactly as a user would.
 *
 * Why a process harness when we already have `createTermless` for in-process
 * tests:
 *
 *   - In-process renders go through silvery's emulator-backed run(), which
 *     resolves `nonTTYMode` to "line-by-line" because the internal stdout
 *     doesn't report `isTTY: true`. In line-by-line mode the scheduler
 *     suppresses cursor-positioning ANSI (scheduler.ts:568), so xterm.js
 *     never sees the move and `term.getCursor()` reflects the post-write
 *     stream position rather than silvery's intent.
 *   - Alt-screen / DECRPM probe sequences silvercode emits at startup
 *     reach the real path here; in-process they're routed through
 *     a different write surface.
 *   - The PTY is a real TTY from the child's perspective: `process.stdout
 *     .isTTY === true`, `setRawMode()` works, the stdin owner can probe.
 *
 * Architecture
 *
 *   spawnSilvercode()
 *     ├─ allocates DEBUG_LOG temp file (stderr-equivalent for silvercode;
 *     │   PTY merges actual stderr into the same stream as stdout, so we
 *     │   route loggily / debug() output to a file instead)
 *     ├─ creates a termless Terminal with the xtermjs backend
 *     ├─ term.spawn(["bun", entryPath, ...argv]) — bun is the runtime
 *     │   silvercode requires (bin: "./src/bootstrap.ts") and the entry
 *     │   defaults to tests/process-harness/test-entry.tsx so the
 *     │   subprocess uses fake AgentSession + fake account boundaries
 *     │   (no claude binary, no API key, fully offline)
 *     └─ exposes screen / press / type / waitFor / dispose to the test
 *
 * The handle implements `Symbol.asyncDispose` so tests can write:
 *
 *   await using harness = await spawnSilvercode({ argv: ["--bare"] })
 *   await harness.waitFor((screen) => screen.includes("Silver Code"))
 *   await harness.press("h")
 *   expect(harness.screen.text).toContain("history")
 *
 * Tracking bead: km-silvercode.test-process-harness
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createTerminal, type RegionView, type Terminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"

// ── Paths ──

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ENTRY = resolve(HARNESS_DIR, "./test-entry.tsx")
/** km repo root — tests/process-harness/ → apps/silvercode/ → apps/ → km/ */
const REPO_ROOT = resolve(HARNESS_DIR, "../../../..")

// ── Types ──

export type Cols = number
export type Rows = number

export interface StderrView {
  /** The DEBUG_LOG file path (so tests can tail it externally if they need). */
  readonly path: string
  /** Read all bytes written so far, decoded as UTF-8. */
  text(): string
  /** Lines (split on `\n`, trailing empty line trimmed). */
  lines(): readonly string[]
  /** Convenience matcher: throw if `needle` is not present. */
  toContain(needle: string): void
}

export interface SilvercodeProcessHandle extends AsyncDisposable {
  /** Live region view of the alt-screen buffer (viewport). */
  readonly screen: RegionView
  /** Underlying termless Terminal — exposed for advanced selectors. */
  readonly term: Terminal
  /** Captured DEBUG_LOG output (silvercode's stderr-equivalent). */
  readonly stderr: StderrView
  /** Process ID of the spawned silvercode child, or null after dispose. */
  readonly pid: number | null
  /** Whether the child is still running. */
  readonly alive: boolean
  /** Exit info string (e.g. "exit=0") when child has exited, null otherwise. */
  readonly exitInfo: string | null

  /** Write raw bytes to the child's stdin (pre-encoded ANSI / typed text). */
  write(input: string): void
  /** Type literal characters (no key parsing). */
  type(text: string): void
  /**
   * Press a single key by name (Enter, Escape, ArrowDown, "Ctrl+c", "h").
   * See `parseKey()` in @termless/core for full grammar.
   */
  press(key: string): void

  /**
   * Wait for `predicate` (or substring) to be true on the live screen text.
   * Polls every 50ms; throws on timeout.
   */
  waitFor(predicate: ((screen: string) => boolean) | string, opts?: { timeoutMs?: number }): Promise<void>

  /** Wait until the screen output stops changing for `stableMs`. */
  waitForStable(opts?: { stableMs?: number; timeoutMs?: number }): Promise<void>

  /** Capture the current screen as plain text (or ANSI-styled). */
  screenshot(format?: "text" | "ansi"): string

  /** Send SIGTERM, drain, and clean up resources. Idempotent. */
  dispose(): Promise<void>
}

export interface SpawnSilvercodeOptions {
  /**
   * Extra argv tokens appended to the silvercode invocation.
   *
   * Note: by default the harness spawns `tests/process-harness/test-entry.tsx`
   * (a fake-injected entry), not the production `bootstrap.ts`. test-entry
   * reads its config from `SILVERCODE_TEST_*` env vars rather than argv —
   * `argv` is forwarded for parity with the real CLI but most tests will
   * leave it empty and configure via the harness options below.
   */
  argv?: string[]
  /** Working directory for the child. Default: a fresh temp dir. */
  cwd?: string
  /** Extra env vars merged into the child's environment. */
  env?: Record<string, string>
  /** Terminal columns. Default: 120. */
  cols?: Cols
  /** Terminal rows. Default: 40. */
  rows?: Rows

  /** Pass `--bare` to the App (skip user CLAUDE.md / hooks / plugins). Default: true. */
  bare?: boolean
  /** Layout prop. Default: "single". */
  layout?: "single" | "grid-2" | "grid-4"
  /** Track prop. Default: "claude". */
  track?: "claude" | "sdk" | "codex"
  /** Model prop. Default: "claude-sonnet-4-6". */
  model?: string

  /**
   * Optional account scenario JSON forwarded to `installFakes` inside the
   * subprocess. `null` skips the override; `undefined` uses the default
   * account fake (test@silvercode.dev, claude_max_20x, light quotas).
   */
  fakeAccount?: import("../../src/test/fake-boundaries.ts").AccountScenario | null

  /**
   * Override the entry file. Default: `tests/process-harness/test-entry.tsx`.
   * Pass `apps/silvercode/src/bootstrap.ts` (absolute) for the real CLI —
   * but be aware it will try to spawn `claude --bare -p` and need creds.
   */
  entryPath?: string

  /**
   * Forward DEBUG / loggily output to the harness's `stderr` capture.
   * When false the child runs without DEBUG_LOG (rare; useful for negative
   * tests). Default: true.
   */
  captureStderr?: boolean
}

// ── Constants ──

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40
const DEFAULT_WAIT_TIMEOUT = 8000
const DEFAULT_STABLE_MS = 250
const POLL_INTERVAL_MS = 50

// ── Implementation ──

/**
 * Spawn silvercode in a PTY-backed subprocess and return a handle for driving
 * it through stdin + observing alt-screen ANSI on stdout.
 *
 * Cleanup: the returned handle implements `Symbol.asyncDispose`. Use
 * `await using harness = await spawnSilvercode(...)` and the child + temp
 * files are released automatically.
 */
export async function spawnSilvercode(options: SpawnSilvercodeOptions = {}): Promise<SilvercodeProcessHandle> {
  const cols = options.cols ?? DEFAULT_COLS
  const rows = options.rows ?? DEFAULT_ROWS
  const captureStderr = options.captureStderr ?? true

  // Allocate a fresh cwd if the caller didn't supply one. Avoids polluting
  // the test runner's actual CWD with controller-side disk writes.
  const allocatedCwd = options.cwd === undefined ? mkdtempSync(join(tmpdir(), "silvercode-process-")) : null
  const cwd = options.cwd ?? allocatedCwd!

  // DEBUG_LOG file for stderr-equivalent capture. The child's debug-log.ts
  // appends every loggily / debug() emission here; we read on demand.
  const stderrPath = captureStderr ? join(mkdtempSync(join(tmpdir(), "silvercode-process-stderr-")), "debug.log") : null

  const entryPath = options.entryPath ?? DEFAULT_ENTRY

  // Build the env. test-entry.tsx reads SILVERCODE_TEST_* to drive its App
  // props. NO_COLOR is intentionally NOT set — we want full ANSI through
  // the PTY for assertions. FORCE_COLOR is added by termless/spawn already.
  const env: Record<string, string> = {
    SILVERCODE_TEST_BARE: (options.bare ?? true) ? "1" : "0",
    SILVERCODE_TEST_LAYOUT: options.layout ?? "single",
    SILVERCODE_TEST_TRACK: options.track ?? "claude",
    SILVERCODE_TEST_MODEL: options.model ?? "claude-sonnet-4-6",
    SILVERCODE_TEST_CWD: cwd,
    ...(options.fakeAccount !== undefined
      ? { SILVERCODE_TEST_FAKE_ACCOUNT_JSON: JSON.stringify(options.fakeAccount) }
      : {}),
    ...(stderrPath ? { DEBUG_LOG: stderrPath } : {}),
    ...options.env,
  }

  const term = createTerminal({ backend: createXtermBackend(), cols, rows })
  let disposed = false

  // Spawn `bun <entry> [...argv]` from the repo root so workspace package
  // resolution (silvery, @termless/*, @km/*) works exactly like production.
  const argv = ["bun", entryPath, ...(options.argv ?? [])]
  await term.spawn(argv, { env, cwd: REPO_ROOT })

  // ── Stderr view ──

  const stderr: StderrView = {
    path: stderrPath ?? "",
    text(): string {
      if (!stderrPath) return ""
      try {
        return readFileSync(stderrPath, "utf8")
      } catch {
        return ""
      }
    },
    lines(): readonly string[] {
      const t = stderr.text()
      const lines = t.split("\n")
      // Drop the trailing empty line that comes from `\n`-terminated writes.
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
      return lines
    },
    toContain(needle: string): void {
      const t = stderr.text()
      if (!t.includes(needle)) {
        throw new Error(`stderr did not contain ${JSON.stringify(needle)}.\n--- stderr ---\n${t}\n--- end stderr ---`)
      }
    },
  }

  // ── Waiting ──

  async function waitFor(
    predicate: ((screen: string) => boolean) | string,
    waitOpts?: { timeoutMs?: number },
  ): Promise<void> {
    const timeoutMs = waitOpts?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT
    const check =
      typeof predicate === "string" ? (s: string) => s.includes(predicate) : (s: string) => Boolean(predicate(s))
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (check(term.getText())) return
      await sleep(POLL_INTERVAL_MS)
    }
    const label = typeof predicate === "string" ? JSON.stringify(predicate) : "predicate"
    throw new Error(
      `spawnSilvercode.waitFor: ${label} did not match within ${timeoutMs}ms.\n--- last screen ---\n${term.getText()}\n--- end screen ---`,
    )
  }

  async function waitForStable(stableOpts?: { stableMs?: number; timeoutMs?: number }): Promise<void> {
    return term.waitForStable(stableOpts?.stableMs ?? DEFAULT_STABLE_MS, stableOpts?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT)
  }

  // ── Screenshot ──

  function screenshot(format: "text" | "ansi" = "text"): string {
    if (format === "text") return term.getText()
    // ANSI form: re-emit the buffer cell-by-cell. termless's screenshotSvg
    // is for visual diffing; for an "ansi" string we use the SGR composer
    // implicit in screen.getText(). Right now the practical shape is text.
    return term.getText()
  }

  // ── Dispose ──

  async function dispose(): Promise<void> {
    if (disposed) return
    disposed = true
    try {
      await term.close()
    } catch {
      // Ignore — best-effort cleanup
    }
    if (allocatedCwd) {
      try {
        rmSync(allocatedCwd, { recursive: true, force: true })
      } catch {
        // Best-effort temp cleanup
      }
    }
    if (stderrPath) {
      try {
        rmSync(dirname(stderrPath), { recursive: true, force: true })
      } catch {
        // Best-effort temp cleanup
      }
    }
  }

  // ── Handle ──

  const handle: SilvercodeProcessHandle = {
    get screen(): RegionView {
      return term.screen
    },
    get term(): Terminal {
      return term
    },
    stderr,
    get pid(): number | null {
      // Termless doesn't expose pid directly; expose null until a future API
      // surfaces it. Tests rarely need it — alive/exitInfo cover the gap.
      return null
    },
    get alive(): boolean {
      return term.alive
    },
    get exitInfo(): string | null {
      return term.exitInfo
    },
    write(input: string): void {
      if (disposed) throw new Error("harness is disposed")
      term.type(input)
    },
    type(text: string): void {
      if (disposed) throw new Error("harness is disposed")
      term.type(text)
    },
    press(key: string): void {
      if (disposed) throw new Error("harness is disposed")
      term.press(key)
    },
    waitFor,
    waitForStable,
    screenshot,
    dispose,
    [Symbol.asyncDispose]: dispose,
  }

  return handle
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
