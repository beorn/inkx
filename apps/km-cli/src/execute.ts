/**
 * In-process km command execution for testing
 *
 * Provides programmatic access to km CLI commands without spawning a subprocess.
 * Used by mdtest plugin for fast test execution.
 */

import { Writable } from "stream"
import type { ReplResult } from "../../../vendor/beorn-mdtest/src/types.js"

/**
 * Execute a km command in-process and capture output
 *
 * @param cmdLine - Full command line (e.g., "km list" or "km view /path/to/repo")
 * @param options - Execution options
 * @returns Promise with stdout, stderr, and exit code
 *
 * @example
 * const result = await executeKmCommand("km list", { cwd: "/tmp/repo" })
 * console.log(result.stdout) // Command output
 */
export async function executeKmCommand(
  cmdLine: string,
  options: {
    cwd?: string
    env?: Record<string, string>
  } = {},
): Promise<ReplResult> {
  // Parse command line into argv array
  const args = parseCommandLine(cmdLine)

  // Remove "km" prefix if present
  if (args[0] === "km") args.shift()

  // Capture stdout and stderr
  let stdout = ""
  let stderr = ""
  let exitCode = 0

  const stdoutStream = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString()
      callback()
    },
  })

  const stderrStream = new Writable({
    write(chunk, _encoding, callback) {
      stderr += chunk.toString()
      callback()
    },
  })

  // Save original process state
  const originalCwd = process.cwd()
  const originalArgv = process.argv
  const originalEnv = process.env
  const originalStdout = process.stdout.write
  const originalStderr = process.stderr.write
  const originalExit = process.exit
  const originalConsoleLog = console.log
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn

  try {
    // Set up test environment
    if (options.cwd) process.chdir(options.cwd)
    if (options.env) {
      process.env = { ...process.env, ...options.env }
    }

    // Intercept stdout/stderr
    process.stdout.write = stdoutStream.write.bind(
      stdoutStream,
    ) as typeof process.stdout.write
    process.stderr.write = stderrStream.write.bind(
      stderrStream,
    ) as typeof process.stderr.write

    // Intercept console methods (commands use console.log, not process.stdout.write)
    console.log = (...args: unknown[]) => {
      const message = args.map((arg) => String(arg)).join(" ") + "\n"
      stdout += message
    }
    console.error = (...args: unknown[]) => {
      const message = args.map((arg) => String(arg)).join(" ") + "\n"
      stderr += message
    }
    console.warn = (...args: unknown[]) => {
      const message = args.map((arg) => String(arg)).join(" ") + "\n"
      stderr += message
    }

    // Intercept process.exit
    process.exit = ((code?: number) => {
      exitCode = code ?? 0
      // Don't actually exit - throw to break out of execution
      throw new ExitSignal(exitCode)
    }) as typeof process.exit

    // Set up argv for Commander to parse
    process.argv = ["bun", "km", ...args]

    // Get a fresh program instance (configureProgram() doesn't call parse())
    const { configureProgram } = await import("./program.js")
    const program = configureProgram()

    try {
      await program.parseAsync(process.argv)
    } catch (err) {
      if (err instanceof ExitSignal) {
        exitCode = err.code
      } else {
        // Real error - capture in stderr and set exit code
        stderr += String(err) + "\n"
        exitCode = 1
      }
    }
  } finally {
    // Restore original process state
    process.chdir(originalCwd)
    process.env = originalEnv
    process.argv = originalArgv
    process.stdout.write = originalStdout
    process.stderr.write = originalStderr
    process.exit = originalExit
    console.log = originalConsoleLog
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  }

  return {
    stdout: stdout.trimEnd(),
    stderr: stderr.trimEnd(),
    exitCode,
  }
}

/**
 * Parse command line string into argv array
 * Handles quoted arguments properly
 */
function parseCommandLine(cmdLine: string): string[] {
  const args: string[] = []
  let current = ""
  let inQuotes = false
  let quoteChar = ""

  for (let i = 0; i < cmdLine.length; i++) {
    const char = cmdLine[i]!
    const nextChar = cmdLine[i + 1]

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true
      quoteChar = char
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false
      quoteChar = ""
    } else if (char === " " && !inQuotes) {
      if (current) {
        args.push(current)
        current = ""
      }
    } else if (char === "\\" && nextChar && inQuotes) {
      // Handle escape sequences in quotes
      i++
      current += cmdLine[i]
    } else {
      current += char
    }
  }

  if (current) args.push(current)

  return args
}

/**
 * Signal thrown to break out of command execution
 * Used to intercept process.exit() calls
 */
class ExitSignal extends Error {
  constructor(public code: number) {
    super(`Exit ${code}`)
    this.name = "ExitSignal"
  }
}
