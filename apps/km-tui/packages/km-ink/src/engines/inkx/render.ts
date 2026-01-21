/**
 * InkX Engine Render
 *
 * Uses inkx's built-in alternateScreen and double-buffering.
 */

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
 */
function restoreTerminal(): void {
  // Reset text attributes first
  process.stdout.write("\x1b[0m");

  // Disable mouse tracking (reverse order of enablement)
  // Any-event tracking, button-event tracking, SGR extended mode
  process.stdout.write("\x1b[?1003l\x1b[?1002l\x1b[?1006l");

  // Show cursor (was hidden with \x1b[?25l)
  process.stdout.write("\x1b[?25h");

  // Exit alternate screen buffer
  process.stdout.write("\x1b[?1049l");

  // Restore stdin to cooked mode (if it's a TTY and in raw mode)
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
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

  process.on("uncaughtException", handleError);
  process.on("unhandledRejection", (reason) => {
    handleError(reason instanceof Error ? reason : new Error(String(reason)));
  });

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
    },
  };
}

export const inkxEngine: TuiEngineApi = {
  render,
  name: "inkx",
};
