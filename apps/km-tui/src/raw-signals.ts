/**
 * Raw stdin signal handling for Ctrl+C and Ctrl+Z.
 *
 * In raw mode, the terminal does not generate SIGINT/SIGTSTP for Ctrl+C/Z.
 * Instead we intercept the raw bytes (\x03 / \x1a) on stdin and handle them
 * ourselves: clean exit for Ctrl+C, suspend/resume for Ctrl+Z.
 */

import { writeSync } from "fs"

/** Terminal escape sequences to restore normal terminal state */
const RESTORE_SEQUENCES = [
  "\x1b[0m", // Reset text attributes
  "\x1b[?1007l\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l", // Disable mouse
  "\x1b[?1l", // Disable application cursor keys
  "\x1b[?2004l", // Disable bracketed paste
  "\x1b[?25h", // Show cursor
  "\x1b[?1049l", // Exit alternate screen
].join("")

/** Sequences to re-enter TUI mode after resume */
const RESUME_SEQUENCES = "\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l"

/**
 * Restore terminal to normal state after crash or exit.
 * Disables raw mode, resets text attributes, disables mouse, shows cursor,
 * exits alternate screen.
 */
export function restoreTerminal(): void {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    try {
      process.stdin.setRawMode(false)
    } catch {
      // Ignore errors during cleanup
    }
  }

  try {
    writeSync(process.stdout.fd, RESTORE_SEQUENCES)
  } catch {
    process.stdout.write(RESTORE_SEQUENCES)
  }
}

/**
 * Process dependencies that can be injected for testing.
 */
export interface SignalHandlerDeps {
  exit: (code: number) => void
  kill: (pid: number, signal: string) => void
  once: (event: string, handler: () => void) => void
  stdin: {
    isTTY: boolean
    isRaw: boolean
    setRawMode: (mode: boolean) => void
  }
  stdout: {
    write: (data: string) => void
    emit: (event: string) => void
  }
}

/** Default deps wired to the real process object */
function defaultDeps(): SignalHandlerDeps {
  return {
    exit: (code) => process.exit(code),
    kill: (pid, signal) => process.kill(pid, signal),
    once: (event, handler) => process.once(event, handler),
    stdin: {
      get isTTY() {
        return !!process.stdin.isTTY
      },
      get isRaw() {
        return !!process.stdin.isRaw
      },
      setRawMode: (mode) => process.stdin.setRawMode(mode),
    },
    stdout: {
      write: (data) => process.stdout.write(data),
      emit: (event) => process.stdout.emit(event),
    },
  }
}

/**
 * Create a raw stdin data handler for Ctrl+C (\x03) and Ctrl+Z (\x1a).
 *
 * - Ctrl+C: restores terminal, exits with code 130
 * - Ctrl+Z: restores terminal, registers one-time SIGCONT to resume,
 *   then sends SIGTSTP to self
 *
 * @param deps - Injectable process dependencies (defaults to real process)
 * @returns Handler function suitable for `process.stdin.on("data", handler)`
 */
export function createRawSignalHandler(deps?: SignalHandlerDeps): (data: Buffer) => void {
  const d = deps ?? defaultDeps()

  return (data: Buffer) => {
    if (data[0] === 0x03) {
      // Ctrl+C -> clean exit
      restoreTerminal()
      d.exit(130)
    }
    if (data[0] === 0x1a) {
      // Ctrl+Z -> suspend (SIGTSTP)
      restoreTerminal()
      d.once("SIGCONT", () => {
        // Re-enter raw mode and TUI on resume
        if (d.stdin.isTTY) {
          try {
            d.stdin.setRawMode(true)
          } catch {
            // Ignore
          }
        }
        d.stdout.write(RESUME_SEQUENCES)
        d.stdout.emit("resize")
      })
      d.kill(process.pid, "SIGTSTP")
    }
  }
}
