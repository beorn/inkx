/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports multiple view modes.
 * Press 'v' to cycle between views interactively.
 */

import { Command } from "commander";
import { runBoard } from "../tui/tui.ts";
import { getRootPath } from "../index.ts";
import { getStore } from "@km/store";
import type { ViewMode } from "../tui/types.ts";

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"];

export const viewCommand = new Command("view")
  .description("Interactive TUI view (press 'v' to cycle modes)")
  .argument("[root]", "Root node ID to start view from")
  .option("--no-tui", "Non-interactive mode, just print")
  .option(
    "--as <mode>",
    `Initial view mode: ${VIEW_MODES.join(", ")} (default: cards)`,
    "cards",
  )
  .action(async (root, options) => {
    // Get the filesystem root path - prefer explicit --root, fall back to store's rootPath
    const fsPath = getRootPath() || getStore().rootPath;
    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards";
    await runBoard(root, options.tui !== false, fsPath, {
      initialViewMode: viewMode as ViewMode,
    });
  });
