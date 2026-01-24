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

    // Import step runner and ANSI helpers first (small, fast)
    const [{ steps }, { CURSOR_TO_START, CLEAR_LINE_END }] = await Promise.all([
      import("@beorn/inkx-ui/progress"),
      import("@beorn/inkx-ui/cli"),
    ]);

    // Clear the "Loading..." line from bootstrap.ts
    process.stdout.write(CURSOR_TO_START + CLEAR_LINE_END);

    // Modules loaded by tasks
    let tuiModule: typeof import("@km/tui");
    let storageModule: typeof import("@km/storage");
    let cliModule: typeof import("../index.ts");

    // Run loading steps with declarative API
    // loadVault() handles both memory and disk modes with unified progress
    const results = await steps({
      loadModules: async () => {
        [tuiModule, storageModule, cliModule] = await Promise.all([
          import("@km/tui"),
          import("@km/storage"),
          import("../index.ts"),
        ]);
      },

      createVault: function* () {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees sequential execution
        const vaultRoot = storageModule!.resolvePathArg(
          root,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cliModule!.getRootPath(),
        ).vaultRoot;
        // Set vault root for debug path formatting
        setDebugVaultRoot(vaultRoot);
        // km-fast-md.7: Use discoverOnly for interactive mode (instant render)
        // For non-interactive mode, we need full parsing before rendering
        const interactive = options.interactive !== false;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return yield* storageModule!.createVault(vaultRoot, {
          searchAncestors: false,
          discoverOnly: interactive,
        });
      },

      buildView: function* () {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees sequential execution
        const resolved = storageModule!.resolvePathArg(
          root,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cliModule!.getRootPath(),
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const state = yield* tuiModule!.initBoardStateGenerator(
          resolved.nodeRef ?? undefined,
        );
        if (state) {
          state.rootPath = resolved.vaultRoot;
        }
        return { state, resolved };
      },
    }).run({ clear: true });

    // Extract results (generator return types need double assertion)
    const { state, resolved } = results.buildView as unknown as {
      state: import("@km/tui").BoardState | null;
      resolved: ReturnType<typeof storageModule.resolvePathArg>;
    };

    // km-fast-md.7: Extract deferred files for background parsing
    const vault = results.createVault as unknown as import("@km/storage").Vault;
    const deferredFiles = vault.deferredFiles;

    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards";
    const interactive = options.interactive !== false;

    // Watch options: CLI flag > config > default (true)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees module is loaded
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

    // km-fast-md.7: Parse files and resolve links in background after board starts
    // This keeps startup instant while eventually completing content parsing
    let aborted = false;

    if (deferredFiles.length > 0) {
      debug("scheduling background parsing for %d files", deferredFiles.length);
      void (async () => {
        // Small delay to let the board render first
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
        if (aborted) return;

        try {
          const { parsed, pendingLinks } =
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees module is loaded
            await storageModule!.parseDeferredAsync(
              deferredFiles,
              () => aborted, // Check abort on each batch
            );
          debug("background parsing complete: %d parsed", parsed);

          if (aborted) return;

          // Now resolve links from the parsed content
          if (pendingLinks.length > 0) {
            const resolved =
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              await storageModule!.resolveLinksAsync(pendingLinks);
            debug("background link resolution complete: %d resolved", resolved);
          }
        } catch (err) {
          if (!aborted) {
            debug("background parsing/resolution failed: %s", err);
          }
        }
      })();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees module is loaded
    await tuiModule!.runBoard(state, {
      interactive,
      initialViewMode: viewMode as ViewMode,
      watch: watchEnabled,
      watchWorker,
      vault,
    });

    // Signal background task to stop (don't wait - causes Bun crash on cleanup)
    aborted = true;
    // Background task will check `aborted` and exit cleanly on next yield
  });
