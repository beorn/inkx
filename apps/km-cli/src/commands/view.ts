/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports both board and tree view modes.
 * Press 'v' to toggle between views interactively.
 */

import { Command } from "commander";
import { runBoard } from "./board/tui.ts";
import { getRootPath } from "../index.ts";
import { getStore } from "@km/store";

export const viewCommand = new Command("view")
  .description("Interactive TUI view (board/tree, press 'v' to toggle)")
  .argument("[root]", "Root node ID to start view from")
  .option("--no-tui", "Non-interactive mode, just print")
  .option(
    "--as <mode>",
    "Initial view mode: board or tree (default: board)",
    "board",
  )
  .action(async (root, options) => {
    // Get the filesystem root path - prefer explicit --root, fall back to store's rootPath
    const fsPath = getRootPath() || getStore().rootPath;
    // TODO: Pass initial view mode to runBoard when we add that support
    await runBoard(root, options.tui !== false, fsPath);
  });
