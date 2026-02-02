/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports multiple view modes.
 * Press 'v' to cycle between views interactively.
 */

import createDebug from "debug"
import { Command } from "@commander-js/extra-typings"
import { createLogger } from "@km/core"
import { setDebugRepoRoot } from "../debug-log.ts"
import { getRootPath } from "../program.ts"

const debug = createDebug("km:cli:view")
const log = createLogger("km")

type ViewMode = "cards" | "columns" | "list" | "tabs"

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"]

export const viewCommand = new Command("view")
  .description("Interactive TUI view (press 'v' to cycle modes)")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option("--no-interactive", "Non-interactive mode, just print")
  .option(
    "--as <mode>",
    `Initial view mode: ${VIEW_MODES.join(", ")} (default: cards)`,
    "cards",
  )
  .option("--no-watch", "Disable file watching (faster startup on large repos)")
  .action(async (root, options) => {
    using startup = log.span("startup", { path: root })
    debug("view command", { root, as: options.as, watch: options.watch })

    // Clear the "Loading..." line from bootstrap.ts
    const { CURSOR_TO_START, CLEAR_LINE_END } =
      await import("@beorn/inkx-ui/cli")
    process.stdout.write(CURSOR_TO_START + CLEAR_LINE_END)

    // Import modules
    let storageModule: typeof import("@km/storage")
    let tuiModule: typeof import("@km/tui")
    let loadRepo: (typeof import("../load-repo.ts"))["loadRepo"]
    {
      using _ = startup.span("import-modules")
      ;[storageModule, tuiModule, { loadRepo }] = await Promise.all([
        import("@km/storage"),
        import("@km/tui"),
        import("../load-repo.ts"),
      ])
    }

    // Resolve path and set debug root
    const resolved = storageModule.resolvePathArg(root, getRootPath())
    setDebugRepoRoot(resolved.repoRoot)

    // km-fast-md.7: Use discoverOnly for interactive mode (instant render)
    const interactive = options.interactive !== false

    // Load repo with progress display
    let createdRepo: Awaited<ReturnType<typeof loadRepo>>
    {
      using _ = startup.span("repo-load")
      createdRepo = await loadRepo(resolved.repoRoot, {
        showProgress: true,
        discoverOnly: interactive,
      })
    }

    // Resolve nodeRef to actual node ID
    let rootNodeId: string | undefined
    if (resolved.nodeRef) {
      const node = createdRepo.resolveNode(resolved.nodeRef)
      rootNodeId = node?.id

      // km-view-stub: If targeting a stub file, parse it eagerly
      // Stub files have data._stub = true and no children until parsed
      if (node?.type === "file" && interactive) {
        const data = node.data as { _stub?: boolean } | undefined
        if (data?._stub && node.fs_path) {
          debug("parsing stub file eagerly: %s", node.fs_path)
          storageModule.parseStubFile(
            createdRepo.database,
            node.id,
            node.fs_path,
          )
        }
      }
    } else {
      // No specific node requested - use repo root folder node
      const repoRootNode = createdRepo.getRepoRootNode()
      rootNodeId = repoRootNode?.id
    }

    // Build view state
    const state = (() => {
      using _ = startup.span("build-state")
      const result = storageModule.runGenerator(
        tuiModule.initBoardStateGenerator(createdRepo, rootNodeId),
      )
      if (result) {
        result.rootPath = resolved.repoRoot
      }
      return result
    })()

    // km-fast-md.7: Extract deferred files for background parsing
    const deferredFiles = createdRepo.deferredFiles

    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards"

    // Watch options: CLI flag > config > default (true)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees module is loaded
    const tuiConfig = storageModule!.getTuiConfig(resolved.repoRoot)
    const watchEnabled = options.watch !== false ? tuiConfig.watch : false
    const watchWorker = tuiConfig.watchWorker
    debug("watch config", {
      watchEnabled,
      watchWorker,
      cli: options.watch,
      config: tuiConfig.watch,
    })

    // Run board - TUI takes over from here
    debug("launching board", { viewMode, interactive, watchEnabled })

    // km-fast-md.7: Parse files and resolve links in background after board starts
    // This keeps startup instant while eventually completing content parsing
    let aborted = false

    if (deferredFiles.length > 0) {
      debug("scheduling background parsing for %d files", deferredFiles.length)
      void (async () => {
        // Small delay to let the board render first
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100)
        })
        if (aborted) return

        try {
          const { parsed, pendingLinks } =
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees module is loaded
            await storageModule!.parseDeferredAsync(
              createdRepo.database,
              deferredFiles,
              () => aborted, // Check abort on each batch
            )
          debug("background parsing complete: %d parsed", parsed)

          if (aborted) return

          // Now resolve links from the parsed content
          if (pendingLinks.length > 0) {
            const resolved =
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              await storageModule!.resolveLinksAsync(
                createdRepo.database,
                pendingLinks,
              )
            debug("background link resolution complete: %d resolved", resolved)
          }
        } catch (err) {
          if (!aborted) {
            debug("background parsing/resolution failed: %s", err)
          }
        }
      })()
    }

    // End startup span before runBoard (TUI takes over interactively)
    startup.end()

    await tuiModule.runBoard(state, {
      interactive,
      initialViewMode: viewMode as ViewMode,
      watch: watchEnabled,
      watchWorker,
      repo: createdRepo,
    })

    // Signal background task to stop (don't wait - causes Bun crash on cleanup)
    aborted = true
    // Background task will check `aborted` and exit cleanly on next yield
  })
