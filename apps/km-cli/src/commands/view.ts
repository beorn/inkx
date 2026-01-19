/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports multiple view modes.
 * Press 'v' to cycle between views interactively.
 */

import { Command } from "commander";
import { runBoard, type ViewMode } from "@km/ink";
import { getRootPath } from "../index.ts";
import { resolvePathArg, ensureState } from "@km/storage";

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"];

export const viewCommand = new Command("view")
  .description("Interactive TUI view (press 'v' to cycle modes)")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option("--no-tui", "Non-interactive mode, just print")
  .option(
    "--as <mode>",
    `Initial view mode: ${VIEW_MODES.join(", ")} (default: cards)`,
    "cards",
  )
  .action(async (root, options) => {
    // Resolve path argument - handles directory paths, file paths, and node IDs
    const resolved = resolvePathArg(root, getRootPath());

    // Initialize database state (replay events) before accessing nodes
    ensureState(resolved.vaultRoot, false);

    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards";

    await runBoard(
      resolved.nodeRef ?? undefined,
      options.tui !== false,
      resolved.vaultRoot,
      {
        initialViewMode: viewMode as ViewMode,
      },
    );
  });
