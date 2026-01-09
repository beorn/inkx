/**
 * Board Command
 *
 * CLI entry point for the boardliner TUI
 */

import { existsSync, statSync } from "fs";
import { Command } from "commander";
import { runBoard } from "./tui.ts";

/**
 * Check if argument is a filesystem path (used for store initialization)
 * vs a node ID (used for board root)
 */
function isFilesystemPath(arg: string): boolean {
  if (arg.startsWith("/") || arg.startsWith("./") ||
      arg.startsWith("~/") || arg.startsWith("..")) {
    const expanded = arg.startsWith("~")
      ? arg.replace("~", process.env.HOME || "")
      : arg;
    return existsSync(expanded) && statSync(expanded).isDirectory();
  }
  return false;
}

export const boardCommand = new Command("board")
  .description("Display interactive boardliner TUI view")
  .argument("[root]", "Root node ID or directory path for board")
  .option("--no-tui", "Non-interactive mode, just print board")
  .action(async (root, options) => {
    // If root is a filesystem path, it's used for store init (handled by CLI preAction)
    // The board should show root-level nodes, not try to look up the path as a node ID
    const nodeId = root && !isFilesystemPath(root) ? root : undefined;
    await runBoard(nodeId, options.tui !== false);
  });

// Re-export for testing
export * from "./types.ts";
export * from "./state.ts";
export * from "./render.ts";
export * from "./tui.ts";
