/**
 * InkX Engine Render
 *
 * Uses inkx's built-in alternateScreen and double-buffering.
 */

import { writeSync } from "fs";
import type React from "react";
import { render as inkxRender } from "inkx";
import type { RenderOptions, RenderResult, TuiEngineApi } from "../types.ts";

/**
 * Restore terminal to normal state after crash or exit.
 *
 * This must undo ALL terminal state changes made by the TUI:
 * 1. Exit alternate screen buffer (restores previous screen content)
 * 2. Show cursor (was hidden for clean rendering)
 * 3. Disable mouse tracking modes (SGR extended, button events, any-event)
 * 4. Reset all text attributes/colors
 * 5. Restore stdin from raw mode to cooked mode
 *
 * Uses writeSync to ensure writes complete even during signal handling.
 */
function restoreTerminal(): void {
  // Restore stdin to cooked mode FIRST (if it's a TTY and in raw mode)
  // This must happen before writing escape codes to avoid issues
  if (process.stdin.isTTY && process.stdin.isRaw) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Ignore errors during cleanup
    }
  }

  // Build all escape sequences into a single write for atomicity
  // Use synchronous write to ensure it completes before process exit
  const sequences = [
    // Reset text attributes
    "\x1b[0m",
    // Disable mouse tracking (reverse order of enablement, all modes)
    // 1007=alternate scroll, 1003=any-event, 1002=button-event,
    // 1000=basic mouse, 1006=SGR extended mode
    "\x1b[?1007l\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l",
    // Disable application cursor keys mode (restore normal cursor keys)
    "\x1b[?1l",
    // Disable bracketed paste mode
    "\x1b[?2004l",
    // Show cursor (was hidden with \x1b[?25l)
    "\x1b[?25h",
    // Exit alternate screen buffer
    "\x1b[?1049l",
  ].join("");

  try {
    // Use synchronous write to ensure it completes during signal handling
    writeSync(process.stdout.fd, sequences);
  } catch {
    // Fallback to regular write if sync fails (e.g., non-TTY)
    process.stdout.write(sequences);
  }
}

/**
 * Render using inkx with alternateScreen
 */
async function render(
  element: React.ReactElement,
  options?: RenderOptions,
): Promise<RenderResult> {
  // Register error handlers to clean up terminal on crash
  const handleError = (error: Error) => {
    restoreTerminal();
    console.error("\n\nTUI crashed with error:", error.message);
    console.error(error.stack);
    process.exit(1);
  };

  // Register signal handlers to restore terminal on kill
  // Use 'once' and exit immediately after restoration to prevent
  // inkx's async handlers from running and corrupting terminal state
  const handleSignal = (signal: string) => {
    restoreTerminal();
    // Exit immediately after sync restoration to prevent inkx's
    // async unmount() from running and leaving terminal corrupted
    process.exit(signal === "SIGINT" ? 130 : 143); // 128 + signal number
  };

  process.on("uncaughtException", handleError);
  process.on("unhandledRejection", (reason) => {
    handleError(reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));

  const instance = await inkxRender(element, {
    exitOnCtrlC: options?.exitOnCtrlC ?? true,
    patchConsole: options?.patchConsole ?? true,
    alternateScreen: true,
  });

  return {
    waitUntilExit: () => instance.waitUntilExit(),
    cleanup: () => {
      restoreTerminal();
      process.removeListener("uncaughtException", handleError);
      process.removeListener("SIGINT", handleSignal);
      process.removeListener("SIGTERM", handleSignal);
    },
  };
}

export const inkxEngine: TuiEngineApi = {
  render,
  name: "inkx",
};
