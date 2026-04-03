/**
 * Emergency terminal restore for uncaughtException / unhandledRejection.
 *
 * Ctrl+C and Ctrl+Z are now handled by silvery's terminal lifecycle system
 * (see vendor/silvery/src/runtime/terminal-lifecycle.ts). This module
 * only provides the emergency fallback for crash handlers.
 */

import { writeSync } from "fs"

/** Terminal escape sequences to restore normal terminal state.
 *
 * Order: disable protocols first, then reset attributes, then show cursor,
 * then exit alternate screen. Sending a disable for an inactive protocol
 * is harmless — unconditional cleanup is safer than tracking state.
 */
const RESTORE_SEQUENCES = [
  "\x1b[?1004l", // Disable focus reporting
  "\x1b[?1007l\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l", // Disable mouse (alt scroll + SGR + all modes)
  "\x1b[<u", // Disable Kitty keyboard protocol (CSI < u)
  "\x1b[?2004l", // Disable bracketed paste
  "\x1b[0m", // Reset text attributes
  "\x1b[0 q", // Reset cursor shape (DECSCUSR 0)
  "\x1b[?25h", // Show cursor
  "\x1b[?1049l", // Exit alternate screen
].join("")

/**
 * Restore terminal to normal state after crash or exit.
 * Sends protocol disable sequences first, then drains stdin, then disables
 * raw mode. This order prevents in-flight terminal events (Kitty key release,
 * SGR mouse) from leaking as garbled text on the shell prompt.
 *
 * This is an emergency fallback — normal exit/suspend cleanup is handled
 * by silvery's terminal lifecycle system.
 */
export function restoreTerminal(): void {
  // Step 1: Stop consuming stdin
  try {
    process.stdin.removeAllListeners("data")
    process.stdin.pause()
  } catch {
    // Ignore
  }

  // Step 2: Send all protocol disable sequences
  try {
    writeSync(process.stdout.fd, RESTORE_SEQUENCES)
  } catch {
    try {
      process.stdout.write(RESTORE_SEQUENCES)
    } catch {
      // Terminal may be gone
    }
  }

  // Step 3: Drain in-flight stdin bytes
  try {
    process.stdin.resume()
    while (process.stdin.read() !== null) {
      // discard
    }
    process.stdin.pause()
  } catch {
    // Ignore
  }

  // Step 4: Disable raw mode
  if (process.stdin.isTTY && process.stdin.isRaw) {
    try {
      process.stdin.setRawMode(false)
    } catch {
      // Ignore errors during cleanup
    }
  }
}
