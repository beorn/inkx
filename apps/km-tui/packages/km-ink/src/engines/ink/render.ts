/**
 * Stock Ink Engine Render
 *
 * Uses fullscreen-ink to provide fullscreen support for stock ink components.
 * All view components in this engine import from "ink" (not "inkx").
 */

import type React from "react";
import { withFullScreen } from "fullscreen-ink";
import type { RenderOptions, RenderResult, TuiEngineApi } from "../types.ts";

/**
 * Exit alternate buffer manually (cleanup on crash)
 */
function exitAlternateBuffer(): void {
  process.stdout.write("\x1b[?1049l");
}

/**
 * Render using stock ink with fullscreen-ink wrapper.
 * Components import from "ink" package (not inkx).
 */
async function render(
  element: React.ReactElement,
  options?: RenderOptions,
): Promise<RenderResult> {
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

  // Use fullscreen-ink for proper fullscreen support
  const ink = withFullScreen(element, {
    exitOnCtrlC: options?.exitOnCtrlC ?? true,
    patchConsole: options?.patchConsole ?? true,
  });

  // Start must be awaited before instance is available
  await ink.start();

  return {
    waitUntilExit: () => ink.waitUntilExit(),
    cleanup: () => {
      exitAlternateBuffer();
      process.removeListener("uncaughtException", handleError);
    },
  };
}

export const inkEngine: TuiEngineApi = {
  render,
  name: "ink",
};
