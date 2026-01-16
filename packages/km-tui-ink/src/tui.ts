/**
 * Board TUI
 *
 * Terminal interaction layer using Ink (React for CLI)
 */

import { EventEmitter } from "events";
import chalk from "chalk";
import type { BoardState, TuiOptions, ViewMode } from "./types.ts";
import { initBoardState } from "./state.ts";
import { renderBoardStatic } from "./render.ts";
import { renderInkBoard } from "./views/index.ts";
import { setFsSync } from "@km/core";
import { SyncManager } from "@km/store";

/**
 * Global event emitter for TUI refresh events
 * Board components can subscribe to this to refresh when filesystem changes
 */
export const tuiEvents = new EventEmitter();

/**
 * Run the interactive board TUI using Ink
 * Returns when the user quits
 */
export async function runBoardTUI(
  initialState: BoardState,
  options?: TuiOptions,
): Promise<void> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  // Check if we're in a TTY - if not, fall back to static mode
  if (!stdin.isTTY || !stdout.isTTY) {
    console.log(chalk.yellow("Not running in a TTY, using static mode"));
    const width = process.stdout.columns || 80;
    console.log(renderBoardStatic(initialState, width));
    return;
  }

  // Use Ink for interactive TUI
  renderInkBoard(initialState, options?.initialViewMode);
}

/**
 * Run the board in static (non-interactive) mode
 */
export function runBoardStatic(state: BoardState): void {
  const width = process.stdout.columns || 80;
  console.log(renderBoardStatic(state, width));
}

/**
 * Entry point for the board command
 */
export async function runBoard(
  rootId?: string,
  interactive: boolean = true,
  rootPath?: string,
  options?: TuiOptions,
): Promise<void> {
  const state = initBoardState(rootId);

  if (!state) {
    console.error(
      chalk.red("No board found. Create a board node or specify a root ID."),
    );
    process.exit(1);
  }

  // Set the filesystem path for display in the TUI header
  if (rootPath) {
    state.rootPath = rootPath;
  }

  // Initialize filesystem sync if we have a vault path
  // This enables bidirectional sync:
  // - TUI changes are written back to .md files (via setFsSync)
  // - External .md changes trigger TUI refresh (via syncManager.start())
  let syncManager: SyncManager | null = null;
  if (rootPath) {
    syncManager = new SyncManager({
      vaultPath: rootPath,
      debounceFs: 2000, // Debounce external changes (2s)
      debounceApply: 100, // Small debounce for batching TUI changes
      conflictStrategy: "last_write_wins",
    });

    // Wire up TUI changes → filesystem
    setFsSync(syncManager);

    // Wire up filesystem changes → TUI refresh
    syncManager.on("state-change", (newState) => {
      // When sync manager finishes reconciling external changes, refresh TUI
      if (newState === "idle") {
        tuiEvents.emit("refresh");
      }
    });

    // Start watching for filesystem changes
    syncManager.start();
  }

  try {
    if (interactive) {
      await runBoardTUI(state, options);
    } else {
      runBoardStatic(state);
    }
  } finally {
    // Clean up sync manager
    if (syncManager) {
      setFsSync(null);
      await syncManager.stop();
    }
  }
}
