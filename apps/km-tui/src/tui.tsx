/**
 * Board TUI
 *
 * Terminal interaction layer using createApp() (Layer 3).
 * Keys flow through term:key handler → command system → store set() → React re-renders.
 */

import { EventEmitter } from "events"
import {
  createTerm,
  patchConsole,
  IncrementalRenderMismatchError,
  InputLayerProvider,
  ThemeProvider,
  detectTerminalCaps,
} from "@silvery/ag-react"
import React from "react"
import { createLogger, createToastQueue, kmEvents } from "@km/core"
import { InvariantViolationError } from "./invariants.ts"
import { restoreTerminal } from "./state/raw-signals.ts"
import { createBoardState } from "./board/board-types.ts"
import type { TuiOptions } from "./types.ts"
import { RepoProvider } from "./repo-context.tsx"
import { StoreProvider } from "./state/store-context.tsx"
import { BoardApp } from "./views/index.ts"
import { withSync, createStoreFromRepo, withReactive, type Sync } from "@km/storage"
import { createBoardApp } from "./board/board-app.ts"
import { detectTheme } from "./theme.ts"
import { type CreateBoardAppStoreParams } from "./state/board-app-store.ts"
import { createUndoableRepo } from "./undo/undoable-repo.ts"
import { createUndoStack } from "./undo-stack.ts"
import { createInitialUIState } from "./state/ui-reducer.ts"
import { terminalFocused, lastKey, startupPhase, setStartupPhase } from "./diagnostics.ts"
import { createGridNavigator, createViewLens, createVisibleLens } from "@km/board"
import { saveWorkspace, loadWorkspace } from "./workspace-persist.ts"
import { loadConfig, saveConfig, initLocations, onFavoritesChange, getAllLocations } from "@km/commands"

const log = createLogger("km:tui")

/**
 * Global event emitter for TUI refresh events
 * Board components can subscribe to this to refresh when filesystem changes
 */
export const tuiEvents = new EventEmitter()
// Increase max listeners for test scenarios where many Board components are created
// Tests run 50+ Board instances, each adding refresh/watcher-status listeners
tuiEvents.setMaxListeners(200)

// restoreTerminal is imported from ./raw-signals.ts (emergency crash handler only;
// Ctrl+C and Ctrl+Z are handled by silvery's terminal lifecycle system)

/**
 * Entry point for the board command.
 *
 * Takes a repo + rootId directly. The store creates PaneSignals → lens → tree.
 * Initial cursor and collapsed nodes are derived from the lens — no pre-computed state needed.
 *
 * Uses term.hasInput() to detect TTY capability:
 * - hasInput() = true → interactive mode with keyboard
 * - hasInput() = false → static mode, render once and exit
 */
// oxlint-disable-next-line complexity/complexity -- async setup with nested callbacks, not worth extracting
export async function runBoard(
  rootId: string | null,
  options: TuiOptions & { repo: import("@km/storage").Repo },
): Promise<void> {
  using run = log.span("run-board")
  log.debug?.("runBoard start")

  if (!options.repo) {
    log.error?.("No repo provided.")
    process.exit(1)
  }

  using toastQueue = createToastQueue()
  using term = createTerm()
  const interactive = options?.interactive !== false
  const isInteractive = interactive && term.hasInput()

  // Detect terminal capabilities for degraded mode
  const caps = detectTerminalCaps()
  const isLimitedTerminal = caps.program === "Apple_Terminal"

  if (isInteractive && isLimitedTerminal) {
    const themeInfo = caps.darkBackground ? "dark" : "light"
    process.stderr.write(
      `\x1b[33m⚠ Terminal.app detected (${themeInfo} theme, basic icons). For best experience, use Ghostty, iTerm2, or Kitty.\x1b[0m\n`,
    )
  }

  log.debug?.(
    `TTY detection interactive=${interactive} hasInput=${term.hasInput()} isInteractive=${isInteractive} caps=${caps.program}/${caps.colorLevel} kitty=${caps.kittyKeyboard} mouse=${caps.mouse} dark=${caps.darkBackground} nerdfont=${caps.nerdfont}`,
  )

  // Initialize filesystem sync if we have a repo path (only for interactive)
  // Watch can be disabled via: --no-watch CLI flag or config tui.watch=false
  // Note: Disabling watch still allows TUI edits to write to filesystem,
  // it just disables watching for external file changes
  let syncManager: Sync | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null

  // Event-loop heartbeat: detect main-thread blocks >500ms
  // Reports last key, current startup phase, render pipeline timing, render count, and cause
  // Pauses when terminal loses focus (saves CPU/battery — no diagnostics needed while blurred)
  // Started early so it covers sync-manager-init, detectTheme, React mount, etc.
  if (isInteractive) {
    const memLog = createLogger("km:memory")
    let memoryTickCount = 0
    const MEMORY_LOG_INTERVAL = 150 // Every 150 ticks * 200ms = 30s
    let lastHeartbeat = performance.now()
    let lastRenderCount = 0
    heartbeatInterval = setInterval(() => {
      if (terminalFocused === false) {
        lastHeartbeat = performance.now()
        return
      }
      const now = performance.now()
      const gap = now - lastHeartbeat
      if (gap > 500) {
        const parts = [`event loop blocked for ${gap.toFixed(0)}ms`]
        if (lastKey) {
          parts.push(`after key='${lastKey}'`)
        } else if (startupPhase) {
          parts.push(`(startup:${startupPhase})`)
        } else {
          parts.push("(startup)")
        }

        const pipeline = globalThis.__silvery_last_pipeline
        const renderCount = globalThis.__silvery_render_count ?? 0
        const rendersSinceLastCheck = renderCount - lastRenderCount
        lastRenderCount = renderCount

        if (pipeline && rendersSinceLastCheck > 0) {
          const phases = [
            pipeline.content > 1 ? `content=${pipeline.content.toFixed(0)}ms` : null,
            pipeline.output > 1 ? `output=${pipeline.output.toFixed(0)}ms` : null,
            pipeline.layout > 1 ? `layout=${pipeline.layout.toFixed(0)}ms` : null,
            pipeline.measure > 1 ? `measure=${pipeline.measure.toFixed(0)}ms` : null,
          ]
            .filter(Boolean)
            .join(" ")
          if (phases) parts.push(`render: ${phases} (total=${pipeline.total.toFixed(0)}ms)`)
          if (rendersSinceLastCheck > 1) parts.push(`(${rendersSinceLastCheck} renders)`)
        } else if (rendersSinceLastCheck === 0) {
          parts.push("(no renders — React mount or sync I/O)")
        }

        log.warn?.(parts.join(" — "))
      }
      lastHeartbeat = now

      // Periodic memory diagnostics (every ~30s)
      if (memLog.debug) {
        memoryTickCount++
        if (memoryTickCount % MEMORY_LOG_INTERVAL === 0) {
          const mem = process.memoryUsage()
          memLog.debug?.(
            `rss=${(mem.rss / 1024 / 1024).toFixed(0)}MB heap=${(mem.heapUsed / 1024 / 1024).toFixed(0)}/${(mem.heapTotal / 1024 / 1024).toFixed(0)}MB external=${(mem.external / 1024 / 1024).toFixed(0)}MB`,
          )
        }
      }
    }, 200)
  }

  const rootPath = options.repo.path
  if (isInteractive && rootPath && options?.watch !== false) {
    using _ = run.span("sync-manager-init")
    setStartupPhase("sync-init")
    const useWorker = options?.watchWorker !== false
    log.debug?.(`Creating sync rootPath=${rootPath} watch=true worker=${useWorker}`)
    // withSync decorates the repo, wrapping apply() to add FS sync
    const syncedRepo = withSync({
      debounceFs: 2000, // Debounce external changes (2s)
      debounceApply: 100, // Small debounce for batching TUI changes
      conflictStrategy: "last_write_wins",
      useWorker, // Use worker thread by default (non-blocking)
      callbacks: {
        // Wire up filesystem changes → TUI refresh.
        // When sync finishes reconciling external file changes (DB updated),
        // bust the Repo's children cache and bump version so React re-renders
        // via useCommitVersion in signal-store.
        onStateChange: (newState) => {
          if (newState === "idle") {
            options.repo?.touch()
          }
        },
        // Forward watcher status to TUI for bottom bar display
        onWatcherStatus: (status) => {
          tuiEvents.emit("watcher-status", status)
        },
        // Surface write errors as toasts via cross-layer event system
        onWriteErrors: (errors) => {
          for (const e of errors) {
            kmEvents.emit("sync-error", {
              path: e.path,
              message: e.error.message,
            })
          }
        },
        // Surface conflict backups as toasts: km detected an external edit
        // before overwriting, preserved the disk version at `backupPath`, and
        // is asking the user to review it.
        onConflicts: (conflicts) => {
          for (const c of conflicts) {
            // fs_wins conflicts have no backup (nothing was overwritten) —
            // surface them as sync-errors so the user still sees something.
            if (c.resolution === "discarded") {
              kmEvents.emit("sync-error", {
                path: c.path,
                message: `External edit detected — km's pending write was discarded`,
              })
              continue
            }
            kmEvents.emit("sync-conflict", {
              path: c.path,
              backupPath: c.backupPath ?? null,
              strategy: c.strategy,
            })
          }
        },
        onError: (error) => {
          kmEvents.emit("sync-error", { path: "", message: error instanceof Error ? error.message : String(error) })
        },
      },
    })(options.repo)
    syncManager = syncedRepo

    setStartupPhase("sync-start")
    log.debug?.("Starting sync...")
    syncManager.start()
    log.debug?.("sync started")
    setStartupPhase("post-sync")
  }

  // Register error handlers to clean up terminal on crash
  // Uses process.stderr.write directly because console.error might still be patched
  const handleError = (error: Error) => {
    restoreTerminal()
    if (error instanceof IncrementalRenderMismatchError) {
      // SILVERY_STRICT detected a bug - show message and exit
      process.stderr.write("\n\n[silvery] Incremental render mismatch detected!\n")
      process.stderr.write(error.message + "\n")
      process.stderr.write("\nThis indicates a bug in incremental rendering. File an issue or run\n")
      process.stderr.write("without SILVERY_STRICT to continue using the TUI (with visual glitches).\n")
      process.exit(1)
    }
    if (error instanceof InvariantViolationError) {
      // Invariant violation = programming error in state management
      process.stderr.write("\n\n[km] State invariant violation detected!\n")
      process.stderr.write(`Check: ${error.check}\n`)
      process.stderr.write(error.message + "\n")
      process.stderr.write("\nThis is a bug — please file an issue with the check name and steps to reproduce.\n")
      process.exit(1)
    }
    process.stderr.write(`\n\nTUI crashed with error: ${error.message}\n`)
    process.stderr.write((error.stack ?? "") + "\n")
    process.exit(1)
  }

  // SIGTERM still needs a handler since it comes from the OS, not stdin.
  // Ctrl+C (SIGINT) and Ctrl+Z (SIGTSTP) are handled by silvery's terminal
  // lifecycle system — they intercept the raw bytes in the event loop.
  const handleSigterm = () => {
    restoreTerminal()
    process.exit(143)
  }

  const handleRejection = (reason: unknown) => {
    handleError(reason instanceof Error ? reason : new Error(String(reason)))
  }
  process.on("uncaughtException", handleError)
  process.on("unhandledRejection", handleRejection)
  process.once("SIGTERM", handleSigterm)

  // Use pre-created patchedConsole if provided (counts startup warnings),
  // otherwise create one now. capture: true = store entries for exit dump.
  const patched = isInteractive
    ? (options?.patchedConsole ?? patchConsole(console, { capture: true, suppress: true }))
    : null

  try {
    // Stop CLI spinner - TUI is about to take over the screen
    options?.spinner?.stop()
    log.debug?.(`Starting TUI isInteractive=${isInteractive}`)

    // Derive initial collapsed nodes from repo data (rules.collapse + data.collapsed)
    setStartupPhase("collapsed-derive")
    const collapsedNodeIds = new Set<string>()
    if (rootId) {
      for (const child of options.repo.getChildren(rootId)) {
        if (child.rules?.collapse || child.data?.collapsed === true) {
          collapsedNodeIds.add(child.id)
        }
      }
    }

    // term.cols/rows are undefined when not a TTY; fall back to stdout then defaults
    const cols = term.cols ?? process.stdout.columns ?? 80
    const rows = term.rows ?? process.stdout.rows ?? 24

    const viewMode = options?.initialViewMode ?? "cards"

    // Load locations config (favorites, system locations, journal template)
    setStartupPhase("load-config")
    const vaultPath = options.repo.path
    if (vaultPath) {
      const config = loadConfig(vaultPath)
      initLocations(config.locations)
      // Persist favorites changes back to config
      onFavoritesChange(() => {
        saveConfig(vaultPath, { locations: getAllLocations() })
      })
    }

    // Restore saved workspace (layout, view mode, filters, zoom location).
    // Falls back gracefully if the saved state can't be resolved (deleted nodes, etc.).
    setStartupPhase("load-workspace")
    const savedWorkspace = isInteractive && vaultPath ? loadWorkspace("default", vaultPath) : null

    if (savedWorkspace) {
      log.debug?.(`Restoring saved workspace (${savedWorkspace.panes.length} panes)`)
    }

    // Detect terminal theme from actual colors (OSC 4/10/11) with fallback
    setStartupPhase("detect-theme")
    const theme = await detectTheme({ caps })
    log.debug?.(`Theme: ${theme.name}`)
    const defaultIconStyle = caps.nerdfont ? "nerdfont" : "workflowy"

    // Derive initial cursor from lens — first card of first column, or first column
    setStartupPhase("init-lens")
    const initLens = createVisibleLens(createViewLens(options.repo, { rootId, foldDepths: new Map() }), {
      collapsedNodes: collapsedNodeIds.size > 0 ? collapsedNodeIds : undefined,
    })
    const initColIds = rootId ? initLens.children(rootId) : []
    const firstColId = initColIds[0]
    const firstCardId = firstColId ? initLens.children(firstColId)[0] : null
    const initialCursor = firstCardId ?? firstColId ?? null

    // Wrap the repo once so the SAME undoable proxy is installed in the
    // store AND in `RepoProvider`. Components that read `useRepo()` then
    // record onto the same stack as structural ops (fixes title/body edits
    // silently skipping undo — bead km-tui.title-edit-no-undo).
    const undoStack = createUndoStack()
    const { repo: undoableRepo, handle: undoHandle } = createUndoableRepo(options.repo, undoStack)

    const storeParams: CreateBoardAppStoreParams = {
      repo: undoableRepo,
      undoInfra: { handle: undoHandle, stack: undoStack },
      toastQueue,
      navigator: createGridNavigator(),
      initialBoardState: createBoardState(rootId, rootPath, collapsedNodeIds),
      initialCursor,
      initialUIState: createInitialUIState({ columns: cols, rows }, defaultIconStyle),
      initialViewMode: viewMode,
      dimensions: { columns: cols, rows },
      savedWorkspace,
    }

    // Create reactive store from repo: wrap Repo as Store, then add signal reactivity.
    // Subscribes to the raw repo — the Proxy passes `subscribe` through so
    // mutations still fire listeners.
    setStartupPhase("reactive-store")
    using reactiveStore = withReactive(createStoreFromRepo(options.repo))
    log.debug?.("reactive store created for fine-grained per-node reactivity")

    // Create L3 app (signal store + term:key handler)
    // TODO(km-canonical): Migrate to pipe() composition once createApp() supports plugin-based
    // event handler registration. Currently createApp() takes event handlers as a map in the
    // constructor, while pipe() plugins like withTerminal(process) wrap run() to inject terminal
    // options. The migration would look like:
    //   const boardApp = pipe(
    //     createApp(storeCreator),
    //     withReact(<BoardApp ... />),
    //     withTerminal(process, { mouse: caps.mouse, kitty: caps.kittyKeyboard, ... }),
    //     withFocus(),
    //     withDomEvents(),
    //   )
    setStartupPhase("create-board-app")
    const boardApp = createBoardApp(storeParams)

    {
      using _ = run.span("render-setup")
      // With progressive column loading, the first render is an empty board frame
      // (fast), then columns fill in one-by-one on the alt screen. No need to show
      // "Rendering..." — the board frame appears almost immediately.
      setStartupPhase("react-mount")
      const handle = await boardApp.run(
        <ThemeProvider theme={theme}>
          <RepoProvider repo={undoableRepo}>
            <StoreProvider store={reactiveStore}>
              <InputLayerProvider>
                <BoardApp initialViewMode={viewMode} patchedConsole={patched} toastQueue={toastQueue} />
              </InputLayerProvider>
            </StoreProvider>
          </RepoProvider>
        </ThemeProvider>,
        isInteractive
          ? {
              // Pass the dims km already captured (line 297-298) plus stdout so
              // silvery doesn't re-read process.stdout.columns/rows after ~300ms
              // of startup I/O (config load, OSC theme detection). Explicit
              // stdout keeps silvery out of headless mode — see
              // vendor/silvery/packages/ag-term/src/runtime/create-app.tsx:611,
              // where `cols && rows && !stdout` triggers headless=true.
              cols,
              rows,
              stdout: process.stdout,
              alternateScreen: true,
              kitty: caps.kittyKeyboard,
              mouse: caps.mouse,
              focusReporting: true,
              textSizing: "auto",
              slowFrameThreshold: 33,
              caps,
            }
          : { cols, rows, stdout: process.stdout, caps },
      )

      // Log total startup time (from CLI invocation to first render)
      if (options?.startTime) {
        const totalMs = (performance.now() - options.startTime).toFixed(0)
        log.debug?.(`total startup: ${totalMs}ms`)
      }

      // Now that alternate screen is active, notify caller (CLI uses this
      // to flush buffered debug output to Console component)
      if (patched) options?.onReady?.()

      // React mount is done; we're past startup. Any further event-loop block
      // is a post-mount issue (first keypress, sync reconciliation, etc.) —
      // marking phase=idle so the heartbeat attributes correctly.
      setStartupPhase("idle")

      // km-silvery.selection-contains retired the old startup walkOrder
      // warmup. With `SelectionApp.tree.contains(id)` backed by an O(1) repo
      // lookup, `sel.node.select()` no longer walks the visible subtree, so
      // there's no multi-second first-keystroke block to hide behind a
      // setTimeout. See km-tui.startup-input-freeze for the original bug.

      // End the run span before blocking on waitUntilExit (TUI is now running)
      run.end()

      if (isInteractive) {
        await handle.waitUntilExit()

        // Auto-save workspace on exit (best-effort, errors silently ignored)
        try {
          const storeState = handle.store.getState()
          const vaultPath = options.repo.path
          if (vaultPath) {
            saveWorkspace(storeState.workspace, "default", vaultPath, options.repo)
            log.debug?.("Auto-saved workspace as 'default'")
          }
        } catch (e: unknown) {
          log.debug?.(`Failed to auto-save workspace: ${e instanceof Error ? e.message : String(e)}`)
        }
      } else {
        // Non-interactive: initial render already wrote to stdout, tear down immediately
        handle.unmount()
      }
    }
  } finally {
    // Remove ALL process handlers to prevent segfault on exit (dangling closures
    // over freed state cause Bun to crash during shutdown).
    process.off("uncaughtException", handleError)
    process.off("unhandledRejection", handleRejection)
    process.off("SIGTERM", handleSigterm)

    // toastQueue is cleaned up automatically via `using` (Symbol.dispose)

    // Dispose patched console (restores original console methods)
    patched?.[Symbol.dispose]()

    // Clean up heartbeat interval (runs every 200ms to detect event loop blocks)
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
    }

    // Clean up sync manager
    if (syncManager) {
      await syncManager.stop()
    }

    // Replay captured console entries on exit so they're visible in scrollback.
    // During the TUI session, console output goes to the alt screen buffer
    // which is lost on exit. Re-emit all entries to the normal terminal.
    if (patched) {
      const entries = patched.getSnapshot()
      if (entries.length > 0) {
        for (const entry of entries) {
          const stream = entry.stream === "stderr" ? process.stderr : process.stdout
          const args = entry.args
            .map((a) =>
              typeof a === "string" ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a),
            )
            .join(" ")
          stream.write(args + "\n")
        }
        // Summary only for noisy sessions
        const stats = patched.getStats()
        if (stats.total > 10) {
          process.stderr.write(
            `[session] ${stats.total} log entries (${stats.errors} errors, ${stats.warnings} warnings)\n`,
          )
        }
      }
    }
  }
}
