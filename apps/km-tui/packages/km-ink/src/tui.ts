/**
 * Board TUI
 *
 * Terminal interaction layer using Ink (React for CLI)
 */

import { EventEmitter } from "events";
import chalk from "chalk";
import createDebug from "debug";
import type { BoardState, TuiEngine, TuiOptions } from "./types.ts";
import { initBoardState } from "./state.ts";
import { renderBoardStatic } from "./render.ts";
import { renderInkxBoard, renderDeferredBoard } from "./views/index.ts";
import { setFsSync, SyncManager } from "@km/storage";

const debug = createDebug("km:tui");

/**
 * Global event emitter for TUI refresh events
 * Board components can subscribe to this to refresh when filesystem changes
 */
export const tuiEvents = new EventEmitter();

/**
 * Run the interactive board TUI using the specified engine
 * Returns when the user quits
 */
export async function runBoardTUI(
  initialState: BoardState,
  options?: TuiOptions,
): Promise<void> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  // Check if we're in a TTY - if not, fall back to static mode
  // FORCE_TTY=1 bypasses TTY check for headless testing (ttyd + Playwright)
  const forceTTY = process.env.FORCE_TTY === "1";
  if (!forceTTY && (!stdin.isTTY || !stdout.isTTY)) {
    console.log(chalk.yellow("Not running in a TTY, using static mode"));
    const width = process.stdout.columns || 80;
    console.log(renderBoardStatic(initialState, width));
    return;
  }

  const engine: TuiEngine = options?.engine ?? "inkx";

  // Supported TUI engines:
  // - inkx: Custom Ink fork with double-buffering and native overflow="scroll" support
  // - inkx-flexx: inkx with pure JS flexbox (replaces yoga-wasm)

  await renderInkxBoard(initialState, options?.initialViewMode, engine);
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
  debug("runBoard start");

  // For interactive mode, use deferred loading to show spinner while vault loads
  if (interactive) {
    // Initialize filesystem sync if we have a vault path
    let syncManager: SyncManager | null = null;
    if (rootPath) {
      debug("Creating SyncManager for: %s", rootPath);
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
      debug("Starting syncManager...");
      syncManager.start();
      debug("syncManager started");
    }

    try {
      debug("Starting interactive TUI with deferred loading");
      // Pass the loader function so UI can show spinner while loading
      // This includes both ensureState (sync vault) and initBoardState (build tree)
      const loadBoardState = () => {
        // First, initialize database state if callback provided (this is the slow part)
        if (options?.initializeState) {
          debug("Calling initializeState callback");
          options.initializeState();
          debug("initializeState callback complete");
        }
        // Then build the board state from the database
        const state = initBoardState(rootId);
        if (state && rootPath) {
          state.rootPath = rootPath;
        }
        return state;
      };
      await renderDeferredBoard(loadBoardState, options?.initialViewMode, options?.engine);
    } finally {
      // Clean up sync manager
      if (syncManager) {
        setFsSync(null);
        await syncManager.stop();
      }
    }
    return;
  }

  // Non-interactive mode: load state synchronously
  const state = initBoardState(rootId);
  debug("initBoardState complete");

  if (!state) {
    console.error(
      chalk.red("No board found. Create a board node or specify a root ID."),
    );
    process.exit(1);
  }

  if (rootPath) {
    state.rootPath = rootPath;
  }

  runBoardStatic(state);
}
