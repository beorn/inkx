/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports multiple view modes.
 * Press 'v' to cycle between views interactively.
 */

import createDebug from "debug";
import { Command } from "commander";

const debug = createDebug("km:cli:view");
import { runBoard, type ViewMode, type TuiEngine } from "@km/ink";
import { getRootPath } from "../index.ts";
import { resolvePathArg, ensureState, getTuiConfig } from "@km/storage";

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"];
const TUI_ENGINES: TuiEngine[] = ["inkx", "inkx-flexx"];

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
    "--tui <engine>",
    `TUI rendering engine: ${TUI_ENGINES.join(", ")} (default: inkx-flexx)`,
    "inkx-flexx",
  )
  .option("--no-watch", "Disable file watching (faster startup on large vaults)")
  .action(async (root, options) => {
    debug("view command: root=%s, as=%s, tui=%s, watch=%s", root, options.as, options.tui, options.watch);

    // Resolve path argument - handles directory paths, file paths, and node IDs
    const resolved = resolvePathArg(root, getRootPath());
    debug("resolved: vaultRoot=%s, nodeRef=%s", resolved.vaultRoot, resolved.nodeRef);

    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards";
    const engine = TUI_ENGINES.includes(options.tui) ? options.tui : "inkx";

    // Watch option: CLI flag > config > default (true)
    // --no-watch flag sets options.watch to false
    const tuiConfig = getTuiConfig(resolved.vaultRoot);
    const watchEnabled = options.watch !== false ? tuiConfig.watch : false;
    debug("watchEnabled=%s (cli=%s, config=%s)", watchEnabled, options.watch, tuiConfig.watch);

    // For interactive mode, pass ensureState as callback so TUI can show loading indicator
    // For non-interactive mode, ensure state synchronously before rendering
    if (options.interactive !== false) {
      debug("launching TUI with deferred state initialization: mode=%s, engine=%s, watch=%s", viewMode, engine, watchEnabled);
      await runBoard(
        resolved.nodeRef ?? undefined,
        true,
        resolved.vaultRoot,
        {
          initialViewMode: viewMode as ViewMode,
          engine: engine as TuiEngine,
          watch: watchEnabled,
          // Deferred loading: TUI will call this and show spinner while it runs
          initializeState: () => ensureState(resolved.vaultRoot, false),
        },
      );
    } else {
      // Non-interactive mode: load state first, then render
      ensureState(resolved.vaultRoot, false);
      debug("launching static view: mode=%s", viewMode);
      await runBoard(
        resolved.nodeRef ?? undefined,
        false,
        resolved.vaultRoot,
        {
          initialViewMode: viewMode as ViewMode,
          engine: engine as TuiEngine,
        },
      );
    }
  });
