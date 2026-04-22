/**
 * View Command - Interactive TUI View
 *
 * Unified view command that supports multiple view modes.
 * Press 'v' to cycle between views interactively.
 */

import { existsSync } from "fs"
import { join } from "path"
import { Command } from "@silvery/commander"
import { createLogger, KNode } from "@km/core"
import { enableConsoleDebug, setDebugRepoRoot } from "../debug-log.ts"
import { getRootPath } from "../program.ts"
import { restoreTerminalState } from "@silvery/ag-term/runtime"
import type { FullLogger } from "../logger-types.ts"
import { promptMemoryModeInit } from "../memory-mode-prompt.ts"
import { initKmDirectory } from "./init.ts"
import { findKmRootFromPath } from "@km/fs-mount"

const debug = createLogger("km:cli:view") as FullLogger
const log = createLogger("km") as FullLogger

type ViewMode = "cards" | "columns" | "list" | "tabs"

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"]

/**
 * Handle a fatal error by restoring the terminal, printing the error, and exiting.
 *
 * When the TUI is running in alternate screen mode, errors are invisible because
 * the alternate screen buffer is discarded on exit. This handler ensures the
 * terminal is restored to normal mode BEFORE printing the error to stderr.
 */
function handleFatalError(error: unknown): void {
  // Restore terminal to normal mode (exit alt screen, show cursor, disable raw mode).
  // Must happen BEFORE printing — alt screen buffer is discarded on exit.
  restoreTerminalState(process.stdout, process.stdin)
  const err = error instanceof Error ? error : new Error(String(error))
  process.stderr.write(`\nFatal error: ${err.message}\n`)
  process.stderr.write((err.stack ?? "") + "\n")
  log.error?.(err)
  process.exit(1)
}

export const viewCommand = new Command("view")
  .description("Interactive TUI view (press 'v' to cycle modes)")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option("--no-interactive", "Non-interactive mode, just print")
  .option("--as <mode>", `Initial view mode: ${VIEW_MODES.join(", ")} (default: cards)`, "cards")
  .option("--no-watch", "Disable file watching (faster startup on large repos)")
  .action(async (root, options) => {
    // Register top-level crash handlers early — before alt screen is entered.
    // runBoard() registers its own handlers inside tui.tsx, but these catch errors
    // that occur before runBoard starts or after it cleans up its handlers.
    const onUncaught = (err: Error) => handleFatalError(err)
    const onUnhandled = (reason: unknown) => handleFatalError(reason)
    process.on("uncaughtException", onUncaught)
    process.on("unhandledRejection", onUnhandled)

    try {
      const _startTime = performance.now()
      using startup = log.span("startup", { path: root })
      debug.debug?.("view command", {
        root,
        as: options.as,
        watch: options.watch,
      })

      // Clear the "Loading..." line from bootstrap.ts
      const { CURSOR_TO_START, CLEAR_LINE_END } = await import("@silvery/ag-react/ui/cli")
      process.stdout.write(CURSOR_TO_START + CLEAR_LINE_END)

      // Import modules
      let storageModule: typeof import("@km/storage")
      let fsMountModule: typeof import("@km/fs-mount")
      let tuiModule: typeof import("@km/tui")
      {
        using _ = startup.span("import-modules")
        ;[storageModule, fsMountModule, tuiModule] = await Promise.all([
          import("@km/storage"),
          import("@km/fs-mount"),
          import("@km/tui"),
        ])
      }

      // Resolve path and set debug root
      const resolved = fsMountModule.resolvePathArg(root, getRootPath())
      setDebugRepoRoot(resolved.repoRoot)

      // km-fast-md.7: Use discoverOnly for interactive mode (instant render)
      // KM_EAGER_LOAD=1 disables discoverOnly for testing (avoids stub→full race)
      const interactive = options.interactive !== false
      const eagerLoad = process.env.KM_EAGER_LOAD === "1"

      // km-tui.memory-mode-silent-loss: if the target has no .km/ (and no
      // ancestor does either), the repo would otherwise silently fall into
      // memory mode. Prompt BEFORE patching console / entering alt screen so
      // the warning is actually visible on the user's normal terminal.
      // Skip the prompt for:
      //   - non-interactive mode (--no-interactive)
      //   - non-TTY stdin (pipes, CI, some tests)
      //   - KM_SKIP_INIT_PROMPT=1 (termless PTY tests — the env sees a real
      //     TTY on the spawned pty-side, so isTTY alone doesn't gate them;
      //     the env var is the explicit opt-out. Tests default to memory
      //     mode without user intervention.)
      const skipInitPrompt = !interactive || !process.stdin.isTTY || process.env.KM_SKIP_INIT_PROMPT === "1"
      if (!skipInitPrompt) {
        const hasKmDir = existsSync(join(resolved.repoRoot, ".km"))
        const ancestorKm = hasKmDir ? null : findKmRootFromPath(resolved.repoRoot)
        if (!hasKmDir && !ancestorKm) {
          const choice = await promptMemoryModeInit(resolved.repoRoot)
          if (choice === "cancel") {
            // Clean exit — user declined. Non-zero so scripts can detect.
            process.exit(130)
          }
          if (choice === "init") {
            initKmDirectory(resolved.repoRoot, { withGtd: true })
            process.stdout.write(`\n✓ Initialized .km/ at ${resolved.repoRoot}\n\n`)
          }
          // choice === "memory" — proceed without creating .km/. The TUI's
          // prominent top-of-screen banner (BoardApp.showMemoryModeBanner)
          // makes the ephemeral state unmissable.
        }
      }

      // Patch console early so startup warnings (stale events, etc.) are captured
      // in the TUI console panel instead of being lost to stderr before alt screen.
      const { patchConsole } = await import("@silvery/ag-react")
      const patchedConsole =
        interactive && process.stdin.isTTY ? patchConsole(console, { capture: true, suppress: true }) : null

      // Load repo + build state with unified progress display
      const { steps } = await import("@silvery/ag-react/ui/progress")
      const { createRepo } = storageModule

      let createdRepo: import("@km/storage").Repo | undefined
      let rootNodeId: string | undefined

      await steps({
        loadRepo: function* () {
          using _ = startup.span("repo-load")
          createdRepo = yield* createRepo(resolved.repoRoot, {
            loadFiles: true,
            discoverOnly: interactive && !eagerLoad,
            // Defer filesystem reconciliation off the critical path for interactive
            // cold starts. The watcher catches live changes; external edits made
            // while km was offline appear a beat after first paint via the
            // post-frame reconcile in the background task below.
            lazyHydrate: interactive && !eagerLoad,
          })
          return createdRepo
        },
        buildState: function* () {
          using _ = startup.span("build-state")
          if (!createdRepo) return null

          // Resolve nodeRef to actual node ID
          if (resolved.nodeRef) {
            const node = createdRepo.resolveNode(resolved.nodeRef)
            rootNodeId = node?.id

            // km-view-stub: If targeting a stub file, parse it eagerly
            if (
              node &&
              KNode.isOutline(node) &&
              (node?.fstype === "file" || node?.fstype === "mdfile") &&
              interactive
            ) {
              const data = node.data as { _stub?: boolean } | undefined
              if (data?._stub && node.fs_path) {
                const absPath = join(resolved.repoRoot, node.fs_path)
                debug.debug?.(`parsing stub file eagerly: ${absPath}`)
                storageModule.parseStubFile(createdRepo.database, node.id, absPath, node.fs_path)
              }
            }
          } else {
            const repoRootNode = createdRepo.getRepoRootNode()
            rootNodeId = repoRootNode?.id
          }

          // Surface load errors/warnings
          for (const err of createdRepo.loadErrors) {
            const prefix = err.path ? `${err.path}: ` : ""
            process.stderr.write(`⚠ ${prefix}${err.message}\n`)
          }

          yield "Ready"
          return rootNodeId
        },
        buildNameIndex() {
          // Pre-build in-memory name index for O(1) wikilink/sigil resolution during rendering.
          // Lazy-built on first resolveByName call if not pre-built here.
          if (createdRepo) {
            storageModule.getNameIndex(createdRepo.database)
          }
        },
        initBoard() {
          // Placeholder step — the TUI sets up store, sync manager, React mount.
          // This step completes immediately; the actual init happens after steps finish.
          // The step timer shows how long the steps runner itself took.
        },
      }).run({ clear: false })

      if (!createdRepo) {
        throw new Error("Failed to load repo")
      }

      // km-fast-md.7: Extract deferred files for background parsing
      // When lazyHydrate is on, reconcileFilesystemPostFrame runs in the
      // background task below and may add more deferred files discovered on
      // disk — those are queued dynamically via the pending-parse mechanism.
      const deferredFiles = [...createdRepo.deferredFiles]
      const lazyHydrateActive = interactive && !eagerLoad

      const viewMode = VIEW_MODES.includes(options.as as ViewMode) ? (options.as as ViewMode) : "cards"

      // Watch options: CLI flag > config > default (true)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees module is loaded
      const tuiConfig = storageModule!.loadConfigObject(resolved.repoRoot).tui
      const watchEnabled = options.watch !== false ? tuiConfig.watch : false
      const watchWorker = tuiConfig.watchWorker
      debug.debug?.("watch config", {
        watchEnabled,
        watchWorker,
        cli: options.watch,
        config: tuiConfig.watch,
      })

      // Run board - TUI takes over from here
      debug.debug?.("launching board", { viewMode, interactive, watchEnabled })

      // km-fast-md.7: Parse files and resolve links in background after board starts
      // This keeps startup instant while eventually completing content parsing
      let aborted = false

      // Even if there are no deferredFiles today, lazyHydrate mode still needs
      // a post-frame reconcile to catch externally added files. Kick off the
      // background task when either there are files to parse OR we deferred
      // reconciliation on the critical path.
      if (deferredFiles.length > 0 || lazyHydrateActive) {
        debug.debug?.(
          `scheduling background parsing for ${deferredFiles.length} files (lazyHydrate=${lazyHydrateActive})`,
        )
        void (async () => {
          // Small delay to let the board render first
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 100)
          })
          if (aborted) return

          // km-storage.lazy-hydration: reconcile filesystem now — detects files
          // that were added/removed externally while km was not running. Any
          // new files go through the regular deferred parsing path below.
          if (lazyHydrateActive && createdRepo) {
            try {
              const reconcileResult = await createdRepo.reconcileAsync({ isAborted: () => aborted })
              if (reconcileResult.deferredFiles.length > 0) {
                debug.debug?.(
                  `post-frame reconcile: queued ${reconcileResult.deferredFiles.length} new files for parsing`,
                )
                deferredFiles.push(...reconcileResult.deferredFiles)
              }
              if (reconcileResult.changes > 0) {
                debug.debug?.(`post-frame reconcile: applied ${reconcileResult.changes} changes`)
                // repo.reconcileAsync already bumps the version on non-zero changes.
              }
            } catch (err) {
              if (!aborted) {
                debug.debug?.(`post-frame reconcile failed: ${String(err)}`)
              }
            }
          }

          if (aborted) return
          if (deferredFiles.length === 0) {
            // Nothing to parse — just mark ready and exit the background task.
            tuiModule.tuiEvents.emit("watcher-status", { state: "ready", pendingPaths: 0 })
            return
          }

          // Signal TUI to show skeleton loading while background parsing runs.
          // Uses dedicated "background-parse" event so the file watcher's status
          // transitions (starting → idle → ready) don't prematurely clear loading.
          tuiModule.tuiEvents.emit("background-parse", true)
          tuiModule.tuiEvents.emit("watcher-status", {
            state: "syncing",
            pendingPaths: deferredFiles.length,
          })

          try {
            const { parsed, pendingLinks } =
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- step runner guarantees module is loaded
              await storageModule!.parseDeferredAsync(
                createdRepo.database,
                deferredFiles,
                () => aborted, // Check abort on each batch
                {
                  onProgress: (completed, total) => {
                    tuiModule.tuiEvents.emit("watcher-status", {
                      state: "syncing",
                      pendingPaths: total - completed,
                    })
                  },
                },
              )
            debug.debug?.(`background parsing complete: ${parsed} parsed`)

            if (aborted) return

            // Now resolve links from the parsed content
            if (pendingLinks.length > 0) {
              const resolved =
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                await storageModule!.resolveLinksAsync(createdRepo.database, pendingLinks)
              debug.debug?.(`background link resolution complete: ${resolved} resolved`)
            }

            if (aborted) return

            // km-tui.dated-items-inbox: Evaluate add= rules after background parsing.
            // discoverOnly skips rule evaluation for instant render. Without this,
            // @next.md's Inbox add= rules never materialize dated tasks as embeds.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const ruleCtx = storageModule!.createRuleContext()
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const _ of storageModule!.evaluateAllRules(createdRepo.database, ruleCtx)) {
              /* exhaust generator */
            }
            debug.debug?.("background rule evaluation complete")

            // Bump repo version so TUI re-derives layout from fresh DB data.
            // Background ops write directly to SQLite bypassing repo mutation API,
            // so subscribers aren't notified without this explicit touch().
            createdRepo.touch()
          } catch (err) {
            if (!aborted) {
              debug.debug?.(`background parsing/resolution failed: ${String(err)}`)
            }
          } finally {
            // Clear skeleton loading state regardless of success or failure
            if (!aborted) {
              tuiModule.tuiEvents.emit("background-parse", false)
              tuiModule.tuiEvents.emit("watcher-status", {
                state: "ready",
                pendingPaths: 0,
              })
            }
          }
        })()
      }

      // End startup span before runBoard (TUI takes over interactively)
      startup.end()

      await tuiModule.runBoard(rootNodeId ?? null, {
        interactive,
        initialViewMode: viewMode as ViewMode,
        watch: watchEnabled,
        watchWorker,
        repo: createdRepo,
        patchedConsole: patchedConsole ?? undefined,
        onReady: enableConsoleDebug,
      })

      // Signal background task to stop (don't wait - causes Bun crash on cleanup)
      aborted = true
      // Background task will check `aborted` and exit cleanly on next yield

      // Checkpoint and close the database before exiting.
      // Without this, the WAL file grows indefinitely across sessions and
      // eventually causes SQLite disk I/O errors (km-shk24 bug 2).
      try {
        createdRepo?.database?.run("PRAGMA wal_checkpoint(TRUNCATE)")
      } catch {
        // Ignore checkpoint errors — we're exiting anyway
      }
      try {
        createdRepo?.close()
      } catch {
        // Ignore close errors — we're exiting anyway
      }

      // Force exit to avoid Bun segfault during GC cleanup (bun#24357).
      // Without this, Bun crashes with SIGSEGV at 0x23B923B823B723B6 during
      // process shutdown — a known Bun bug with complex app teardown.
      process.exit(0)
    } catch (error) {
      handleFatalError(error)
    } finally {
      process.off("uncaughtException", onUncaught)
      process.off("unhandledRejection", onUnhandled)
    }
  })
