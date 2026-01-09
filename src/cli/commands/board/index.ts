/**
 * Board Command
 *
 * CLI entry point for the boardliner TUI
 */

import { Command } from "commander";
import { runBoard } from "./tui.ts";

export const boardCommand = new Command("board")
  .description("Display interactive boardliner TUI view")
  .argument("[root]", "Root node ID for board (default: find first board)")
  .option("--no-tui", "Non-interactive mode, just print board")
  .action(async (root, options) => {
    await runBoard(root, options.tui !== false);
  });

// Re-export for testing
export * from "./types.ts";
export * from "./state.ts";
export * from "./render.ts";
export * from "./tui.ts";
