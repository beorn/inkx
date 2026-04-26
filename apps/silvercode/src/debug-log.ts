/**
 * Debug Log Support — silvercode-specific overrides on top of silvery's
 * console-hygiene defaults.
 *
 * silvery's run() now buffers debug() / console.* / raw stderr writes
 * during alt-screen and replays them to the normal terminal on exit
 * (km-silvery.console-hygiene-default). For most cases, that's enough —
 * no per-app debug-log.ts boilerplate needed.
 *
 * What silvercode adds on top:
 *   - DEBUG_LOG also routes loggily's structured writer to the same file
 *     (silvery's Output handles the stderr/console mirror; this hooks
 *     loggily's separate writer pipeline).
 *   - setSuppressConsole(true) when DEBUG_LOG is set so loggily's console
 *     sink doesn't double-emit.
 *
 * Must be imported as a side-effect BEFORE any debug() call fires.
 */

// loggily re-exports addWriter/setSuppressConsole from ./core.js, but TypeScript
// can't resolve them under verbatimModuleSyntax + bundler moduleResolution.
// They exist at runtime; cast through unknown to satisfy the type checker.
import * as _loggily from "loggily"
const { addWriter, setSuppressConsole } = _loggily as unknown as {
  addWriter: (writer: (formatted: string, level: string) => void) => () => void
  setSuppressConsole: (value: boolean) => void
}
import { appendFileSync } from "node:fs"

// Strip ANSI escape sequences for clean file output
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "")
}

const logPath = process.env.DEBUG_LOG
if (logPath) {
  // loggily's structured writer goes to the same file silvery's Output
  // device redirects stderr/console to. Combined output: every log line
  // (loggily, debug(), console.*, process.stderr.write) lands in DEBUG_LOG.
  addWriter((formatted) => appendFileSync(logPath, stripAnsi(formatted) + "\n"))
  setSuppressConsole(true)
}
