/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports multiple view modes.
 * Press 'v' to cycle between views interactively.
 */

import createDebug from "debug";
import { Command } from "commander";
import { setDebugVaultRoot } from "../debug-log.ts";

const debug = createDebug("km:cli:view");

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

    // Import task runner and ANSI helpers first (small, fast)
    const [{ tasks }, { CURSOR_TO_START, CLEAR_LINE_END }] = await Promise.all([
      import("@beorn/inkx-ui/progress"),
      import("@beorn/inkx-ui/cli"),
    ]);

    // Clear the "Loading..." line from bootstrap.ts
    process.stdout.write(CURSOR_TO_START + CLEAR_LINE_END);

    // Modules loaded by tasks
    let inkModule: typeof import("@km/ink");
    let storageModule: typeof import("@km/storage");
    let cliModule: typeof import("../index.ts");

    // Run loading tasks with fluent API
    // loadVault() handles both memory and disk modes with unified progress
    const results = await tasks()
      .add("Loading modules", async () => {
        [inkModule, storageModule, cliModule] = await Promise.all([
          import("@km/ink"),
          import("@km/storage"),
          import("../index.ts"),
        ]);
      })
      .add("Loading vault", function* () {
        const vaultRoot = storageModule!.resolvePathArg(
          root,
          cliModule!.getRootPath(),
        ).vaultRoot;
        // Set vault root for debug path formatting
        setDebugVaultRoot(vaultRoot);

        // loadVault handles both memory and disk modes:
        // - Memory mode: discover → parse → apply → resolve → materialize
        // - Disk mode: discover → apply → materialize
        yield* storageModule!.loadVault(vaultRoot, { searchAncestors: false });
      })
      .add("Building view", function* () {
        const resolved = storageModule!.resolvePathArg(
          root,
          cliModule!.getRootPath(),
        );
        const state = yield* inkModule!.initBoardStateGenerator(
          resolved.nodeRef ?? undefined,
        );
        if (state) {
          state.rootPath = resolved.vaultRoot;
        }
        return { state, resolved };
      })
      .run({ clear: true });

    // Extract results
    const { state, resolved } = results["Building view"] as {
      state: import("@km/ink").BoardState | null;
      resolved: ReturnType<typeof storageModule.resolvePathArg>;
    };

    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards";
    const interactive = options.interactive !== false;

    // Watch options: CLI flag > config > default (true)
    const tuiConfig = storageModule!.getTuiConfig(resolved.vaultRoot);
    const watchEnabled = options.watch !== false ? tuiConfig.watch : false;
    const watchWorker = tuiConfig.watchWorker;
    debug("watch config", {
      watchEnabled,
      watchWorker,
      cli: options.watch,
      config: tuiConfig.watch,
    });

    // Run board - TUI takes over from here
    debug("launching board", { viewMode, interactive, watchEnabled });
    await inkModule!.runBoard(state, {
      interactive,
      initialViewMode: viewMode as ViewMode,
      watch: watchEnabled,
      watchWorker,
    });
  });
