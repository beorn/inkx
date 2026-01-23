/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports multiple view modes.
 * Press 'v' to cycle between views interactively.
 */

import createDebug from "debug";
import { Command } from "commander";

const debug = createDebug("km:cli:view");

// Heavy modules are imported dynamically - spinner shows while they load

type ViewMode = "cards" | "columns" | "list" | "tabs";

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"];

export const viewCommand = new Command("view")
  .description("Interactive TUI view (press 'v' to cycle modes)")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option("--no-interactive", "Non-interactive mode, just print")
  .option(
    "--as <mode>",
    `Initial view mode: ${VIEW_MODES.join(", ")} (default: cards)`,
    "cards",
  )
  .option(
    "--no-watch",
    "Disable file watching (faster startup on large vaults)",
  )
  .action(async (root, options) => {
    debug("view command", { root, as: options.as, watch: options.watch });

    // Dynamic imports - "Loading..." already visible while they load
    const [
      { runBoard, initBoardState },
      { resolvePathArg, ensureState, getTuiConfig, runWithProgress },
      { getRootPath },
      { createSpinner, CURSOR_TO_START, CLEAR_LINE_END },
      { REBUILD_PHASES },
    ] = await Promise.all([
      import("@km/ink"),
      import("@km/storage"),
      import("../index.ts"),
      import("@beorn/progressx/cli"),
      import("../utils/progress-phases.ts"),
    ]);

    // Resolve path argument - handles directory paths, file paths, and node IDs
    const resolved = resolvePathArg(root, getRootPath());
    debug("resolved", resolved);

    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards";
    const interactive = options.interactive !== false;

    // Watch options: CLI flag > config > default (true)
    const tuiConfig = getTuiConfig(resolved.vaultRoot);
    const watchEnabled = options.watch !== false ? tuiConfig.watch : false;
    const watchWorker = tuiConfig.watchWorker;
    debug("watch config", {
      watchEnabled,
      watchWorker,
      cli: options.watch,
      config: tuiConfig.watch,
    });

    // Load state with spinner - keeps running through board initialization
    // Clear the "Loading..." line from index.ts before showing spinner
    process.stdout.write(CURSOR_TO_START + CLEAR_LINE_END);
    const spinner = createSpinner({ style: "dots" });
    try {
      let lastPhase: string | undefined;
      const phases = REBUILD_PHASES as Record<string, string>;
      runWithProgress(ensureState(resolved.vaultRoot, false), (info) => {
        const label = phases[info.phase ?? ""] ?? info.phase ?? "Loading";
        // When phase changes, print completed phase on its own line
        if (lastPhase && lastPhase !== info.phase) {
          const prevLabel = phases[lastPhase] ?? lastPhase;
          spinner.succeed(prevLabel);
        }
        lastPhase = info.phase;
        spinner(`${label}: ${info.current}/${info.total}`);
      });
      // Print final phase completion
      if (lastPhase) {
        const finalLabel = phases[lastPhase] ?? lastPhase;
        spinner.succeed(finalLabel);
      }

      // Build board state (covered by spinner)
      spinner("Building view...");
      const state = initBoardState(resolved.nodeRef ?? undefined);
      if (state) {
        state.rootPath = resolved.vaultRoot;
      }

      // Run board - it will stop the spinner when TUI is ready
      debug("launching board", { viewMode, interactive, watchEnabled });
      await runBoard(state, {
        interactive,
        initialViewMode: viewMode as ViewMode,
        watch: watchEnabled,
        watchWorker,
        spinner,
      });
    } finally {
      spinner.stop(); // Ensure cleanup on error
    }
  });
