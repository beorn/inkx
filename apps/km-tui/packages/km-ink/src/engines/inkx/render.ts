/**
 * InkX Engine Render
 *
 * Uses inkx's built-in alternateScreen and double-buffering.
 */

import type React from "react";
import { render as inkxRender } from "inkx";
import type { RenderOptions, RenderResult, TuiEngineApi } from "../types.ts";

/**
 * Exit alternate buffer manually (cleanup on crash)
 */
function exitAlternateBuffer(): void {
  process.stdout.write("\x1b[?1049l");
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
    exitAlternateBuffer();
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
      exitAlternateBuffer();
      process.removeListener("uncaughtException", handleError);
    },
  };
}

export const inkxEngine: TuiEngineApi = {
  render,
  name: "inkx",
};
