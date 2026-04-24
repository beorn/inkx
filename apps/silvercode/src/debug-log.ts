/**
 * Debug Log Support (mirror of apps/km-cli/src/debug-log.ts).
 *
 * Routes DEBUG / @beorn/logger output to the DEBUG_LOG file AND suppresses
 * console output when the TUI is active — so the alt-screen UI can never
 * be polluted by a stray debug() call anywhere in the dep graph.
 *
 * Must be imported as a side-effect BEFORE any debug() call fires.
 *
 * Extract to a shared package when a third consumer arrives (currently:
 * km-cli + silvercode). For now, mirrored because the module is self-
 * contained and extraction adds build coordination we don't need yet.
 */

// loggily re-exports addWriter/setSuppressConsole from ./core.js, but TypeScript
// can't resolve them under verbatimModuleSyntax + bundler moduleResolution.
// They exist at runtime; cast through unknown to satisfy the type checker.
import * as _loggily from "loggily"
const { addWriter, setSuppressConsole } = _loggily as unknown as {
  addWriter: (writer: (formatted: string, level: string) => void) => () => void
  setSuppressConsole: (value: boolean) => void
}
import createDebug from "debug"
import { appendFileSync, createWriteStream } from "node:fs"

let stream: ReturnType<typeof createWriteStream> | null = null

// Strip ANSI escape sequences for clean file output
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "")
}

function formatValue(val: unknown): string {
  if (typeof val === "string") return val
  if (typeof val !== "object" || val === null) return String(val)
  try {
    return JSON.stringify(val)
  } catch {
    return "[object]"
  }
}

function customLog(...args: unknown[]): void {
  const formatStr = typeof args[0] === "string" ? args[0] : ""
  const rest = args.slice(1)
  let i = 0
  const formatted = formatStr.replace(/%([Oojs%d])/g, (match, type) => {
    if (type === "%") return "%"
    if (i >= rest.length) return match
    const val = rest[i++]
    switch (type) {
      case "O":
      case "o":
      case "j":
        return formatValue(val)
      case "s":
        return String(val)
      case "d":
        return String(Number(val))
      default:
        return match
    }
  })
  const remaining = rest.slice(i).map(formatValue)
  const parts = [formatted, ...remaining].filter(Boolean)
  const line = parts.join(" ")

  if (stream) {
    stream.write(stripAnsi(line) + "\n")
  }

  if (!process.stdout.isTTY) {
    // Non-TTY (tests, scripts) — stderr is the natural destination.
    console.error(line)
  }
  // TTY + stream: file-only, skip console to prevent leak into alt screen.
  // TTY + no stream: the TUI is drawing and there's no log file — drop the
  // message (can't render to alt screen safely). User should set DEBUG_LOG
  // to see output.
}

createDebug.log = customLog

const logPath = process.env.DEBUG_LOG
if (logPath) {
  const logStream = createWriteStream(logPath, { flags: "a" })
  stream = logStream
  // Use appendFileSync for loggily writer — stream.write() is async and
  // may not flush before process exit. appendFileSync guarantees writes
  // land even during blocked event loops or rapid shutdown.
  addWriter((formatted) => appendFileSync(logPath, stripAnsi(formatted) + "\n"))
  setSuppressConsole(true)
  process.on("exit", () => stream?.end())
  process.on("SIGINT", () => stream?.end())
  process.on("SIGTERM", () => stream?.end())
}
