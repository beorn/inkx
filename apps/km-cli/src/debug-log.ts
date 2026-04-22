/**
 * Debug Log Support
 *
 * Configures debug output:
 * - Single-line JSON for objects (no multi-line pretty-print)
 * - Human-readable paths (relative to cwd or ~/...)
 * - Optional file output via DEBUG_LOG env var
 *
 * Must be imported before any debug() calls.
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
import { appendFileSync, createWriteStream } from "fs"
import { relative } from "path"
import { homedir } from "os"

let stream: ReturnType<typeof createWriteStream> | null = null
let _logFilePath: string | null = null

// Strip ANSI escape sequences for clean file output
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "")
}

// Optional repo root for formatting paths relative to repo
let repoRoot: string | null = null

// Buffer for debug output before TUI is ready
let consoleBuffer: string[] = []
let consoleEnabled = false

/**
 * Enable routing debug output to console.debug (for TUI's <Console> component).
 * Call this after term.console.capture() is active. Flushes any buffered output.
 *
 * When DEBUG_LOG is set, suppresses console output from both the debug package
 * (customLog) and @beorn/logger (writeLog) to prevent Console capture → React
 * re-render → layout cascade. File output continues via writers.
 */
export function enableConsoleDebug(): void {
  consoleEnabled = true

  // When DEBUG_LOG is active, suppress @beorn/logger console output too
  if (stream) {
    setSuppressConsole(true)
  }

  // Flush buffer (only if not suppressed)
  if (!stream) {
    for (const line of consoleBuffer) {
      console.debug(line)
    }
  }
  consoleBuffer = []
}

/**
 * Set the repo root for path formatting in debug output.
 * Paths inside this root will be shown as relative.
 */
export function setDebugRepoRoot(root: string | null): void {
  repoRoot = root
}

/**
 * Format an absolute path for human readability.
 * Priority: repo-relative > cwd-relative > ~/relative > absolute
 */
function formatPath(absPath: string): string {
  // Try relative to repo root (most useful for debug output)
  if (repoRoot && absPath.startsWith(repoRoot)) {
    const rel = absPath.slice(repoRoot.length)
    return rel.startsWith("/") ? rel.slice(1) : rel
  }

  const home = homedir()
  const cwd = process.cwd()

  // Try relative to cwd
  const relPath = relative(cwd, absPath)
  if (relPath && !relPath.startsWith("..") && relPath.length < absPath.length) {
    return relPath
  }

  // Try home-relative
  if (absPath.startsWith(home)) {
    return "~" + absPath.slice(home.length)
  }

  return absPath
}

/**
 * Recursively format paths in an object for debug output.
 */
function formatPathsInObject(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 5) return obj

  if (typeof obj !== "object" || obj === null) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((v) => formatPathsInObject(v, depth + 1))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    // Format path-like string values
    if (
      typeof value === "string" &&
      value.startsWith("/") &&
      (key === "fsPath" ||
        key === "fs_path" ||
        key === "path" ||
        key === "rootPath" ||
        key === "repoRoot" ||
        key.endsWith("Path"))
    ) {
      result[key] = formatPath(value)
    } else if (typeof value === "object" && value !== null) {
      result[key] = formatPathsInObject(value, depth + 1)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Format a value for debug output as single-line JSON.
 */
function formatValue(val: unknown): string {
  if (typeof val === "string") {
    return val
  }
  if (typeof val !== "object" || val === null) {
    return String(val)
  }
  try {
    const formatted = formatPathsInObject(val)
    return JSON.stringify(formatted)
  } catch {
    // Circular reference or other error - fall back to [object Object]
    return "[object]"
  }
}

/**
 * Format a string value, detecting and formatting paths.
 */
function formatString(val: unknown): string {
  const str = String(val)
  // Detect absolute paths and format them
  if (str.startsWith("/") && (str.includes(".md") || str.includes(".km"))) {
    return formatPath(str)
  }
  return str
}

/**
 * Custom log function for single-line debug output.
 * Handles all printf-style format specifiers and appends remaining args.
 *
 * Note: The debug library passes the already-formatted namespace as part of
 * the format string, so we just need to handle the placeholders and write output.
 */
function customLog(...args: unknown[]): void {
  // First arg is the format string (includes namespace from debug)
  const formatStr = typeof args[0] === "string" ? args[0] : ""
  const rest = args.slice(1)

  // Format all printf-style placeholders
  let i = 0
  const formatted = formatStr.replace(/%([Oojs%d])/g, (match, type) => {
    if (type === "%") return "%" // Escaped %%
    if (i >= rest.length) return match // No more args

    const val = rest[i++]
    switch (type) {
      case "O":
      case "o":
      case "j":
        return formatValue(val)
      case "s":
        return formatString(val)
      case "d":
        return String(Number(val))
      default:
        return match
    }
  })

  // Remaining args after format string placeholders - append as formatted values
  const remaining = rest.slice(i).map(formatValue)
  const parts = [formatted, ...remaining].filter(Boolean)
  const line = parts.join(" ")

  if (stream) {
    stream.write(stripAnsi(line) + "\n")
  }

  if (!process.stdout.isTTY) {
    // Not in TTY (tests, scripts) - output to stderr as normal
    console.error(line)
  } else if (stream) {
    // DEBUG_LOG is set — file output only, skip console to prevent
    // Console capture → React re-render → layout cascade in TUI
  } else if (consoleEnabled) {
    // TUI mode with Console capture active - route to console.debug
    // This makes debug output appear in the <Console> component
    console.debug(line)
  } else {
    // TTY but Console capture not ready yet - buffer for later
    consoleBuffer.push(line)
  }
}

// Configure debug to use our custom formatter
createDebug.log = customLog

// Set up file output if DEBUG_LOG is set
const logPath = process.env.DEBUG_LOG

if (logPath) {
  _logFilePath = logPath
  const logStream = createWriteStream(logPath, { flags: "a" })
  stream = logStream
  // Use appendFileSync for @beorn/logger writer — stream.write() is async and
  // may not flush before process exit (especially in non-interactive mode where
  // the TUI renders once then exits immediately). appendFileSync guarantees writes
  // are committed even during blocked event loops or rapid shutdown.
  addWriter((formatted) => appendFileSync(logPath, stripAnsi(formatted) + "\n"))
  // Suppress @beorn/logger console output immediately (not just in enableConsoleDebug)
  // so startup log messages also go to file only
  setSuppressConsole(true)

  // Clean up on exit - only close stream, don't call process.exit()
  // Other signal handlers (like TUI terminal restoration) need to run first
  process.on("exit", () => stream?.end())
  process.on("SIGINT", () => stream?.end())
  process.on("SIGTERM", () => stream?.end())
}
