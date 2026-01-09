/**
 * Board Command
 *
 * CLI entry point for the boardliner TUI
 */

import { Command } from "commander";
import { runBoard } from "./tui.ts";
import { getRootPath } from "../../index.ts";
import { getStore } from "../../../node/store.ts";

export const boardCommand = new Command("board")
  .description("Display interactive boardliner TUI view")
  .argument("[root]", "Root node ID to start board from")
  .option("--no-tui", "Non-interactive mode, just print board")
  .action(async (root, options) => {
    // root argument is now always a node ID (paths are handled by global --root)
    // Get the filesystem root path - prefer explicit --root, fall back to store's rootPath
    const fsPath = getRootPath() || getStore().rootPath;
    await runBoard(root, options.tui !== false, fsPath);
  });

// Re-export for testing
export * from "./types.ts";
export * from "./state.ts";
export * from "./render.ts";
export * from "./tui.ts";
