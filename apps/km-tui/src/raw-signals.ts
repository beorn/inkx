/**
 * Emergency terminal restore for uncaughtException / unhandledRejection.
 *
 * Ctrl+C and Ctrl+Z are now handled by silvery's terminal lifecycle system
 * (see vendor/silvery/src/runtime/terminal-lifecycle.ts). This module
 * only provides the emergency fallback for crash handlers.
 */

import { writeSync } from "fs"

/** Terminal escape sequences to restore normal terminal state */
const RESTORE_SEQUENCES = [
  "\x1b[0m", // Reset text attributes
  "\x1b[?1007l\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l", // Disable mouse
  "\x1b[<u", // Disable Kitty keyboard protocol (CSI < u)
  "\x1b[?2004l", // Disable bracketed paste
  "\x1b[?25h", // Show cursor
  "\x1b[?1049l", // Exit alternate screen
].join("")

/**
 * Restore terminal to normal state after crash or exit.
 * Disables raw mode, resets text attributes, disables mouse, shows cursor,
 * exits alternate screen.
 *
 * This is an emergency fallback — normal exit/suspend cleanup is handled
 * by silvery's terminal lifecycle system.
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
