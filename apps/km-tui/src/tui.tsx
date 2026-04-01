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
import { restoreTerminal } from "./raw-signals.ts"
import { createBoardState } from "./board-types.ts"
import type { InitialBoardData, TuiOptions } from "./types.ts"
import { RepoProvider } from "./repo-context.tsx"
import { BoardApp } from "./views/index.ts"
import { SyncManager } from "@km/storage"
import { createBoardApp } from "./board-app.ts"
import { detectTheme } from "./theme.ts"
import { type CreateBoardAppStoreParams } from "./board-app-store.ts"
import { createInitialUIState } from "./ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { createCursorStoreFromRepo } from "./cursor-store.ts"
import { saveWorkspace, loadWorkspace } from "./workspace-persist.ts"
import { loadConfig, saveConfig, initLocations, onFavoritesChange, getAllLocations } from "@km/commands"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loggily types don't fully resolve via tsc bundler mode
const log = createLogger("km:tui") as any

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
 * Compute initial cursor node from board data.
 * First card of first column, or first column if no cards.
 */
function computeInitialCursor(state: InitialBoardData): string | null {
  if (state.columns.length === 0) return null
  const firstCol = state.columns[0]
  if (!firstCol) return null
  if (firstCol.cardNodes.length > 0) {
    return firstCol.cardNodes[0]?.id ?? firstCol.node.id
  }
  return firstCol.node.id
}

/**
 * Entry point for the board command
 *
 * State must already be loaded (via loadRepo) and board state built
 * (via initBoardState) before calling this. The CLI handles both with
 * a progress indicator.
 *
 * Uses term.hasInput() to detect TTY capability:
 * - hasInput() = true → interactive mode with keyboard
 * - hasInput() = false → static mode, render once and exit
 */
// oxlint-disable-next-line complexity/complexity -- 31/30: async setup with nested callbacks, not worth extracting
export async function runBoard(state: InitialBoardData | null, options?: TuiOptions): Promise<void> {
  using run = log.span("run-board")
  log.debug?.("runBoard start")

  if (!state || !options?.repo) {
    console.error("No board found or repo missing.")
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
  let syncManager: SyncManager | null = null

  if (isInteractive && state.rootPath && options?.watch !== false) {
    using _ = run.span("sync-manager-init")
    const useWorker = options?.watchWorker !== false
    log.debug?.(`Creating SyncManager rootPath=${state.rootPath} watch=true worker=${useWorker}`)
    syncManager = new SyncManager({
      db: options.repo.database,
      repoPath: state.rootPath,
      debounceFs: 2000, // Debounce external changes (2s)
      debounceApply: 100, // Small debounce for batching TUI changes
      conflictStrategy: "last_write_wins",
      useWorker, // Use worker thread by default (non-blocking)
    })

    // Wire up TUI changes → filesystem (always enabled for writes)
    options.repo.emitter.setFsSync(syncManager)

    // Wire up filesystem changes → TUI refresh.
    // When SyncManager finishes reconciling external file changes (DB updated),
    // bust the Repo's children cache and bump version so React re-renders
    // via useSyncExternalStore in useColumns.
    syncManager.on("state-change", (newState) => {
      if (newState === "idle") {
        options.repo?.touch()
      }
    })

    // Forward watcher status to TUI for bottom bar display
    syncManager.on("watcher-status", (status) => {
      tuiEvents.emit("watcher-status", status)
    })

    // Surface write errors as toasts via cross-layer event system
    syncManager.on("write-errors", (errors: { path: string; error: Error }[]) => {
      for (const e of errors) {
        kmEvents.emit("sync-error", {
          path: e.path,
          message: e.error.message,
        })
      }
    })
    syncManager.on("error", (error: Error) => {
      kmEvents.emit("sync-error", { path: "", message: error.message })
    })

    log.debug?.("Starting syncManager...")
    syncManager.start()
    log.debug?.("syncManager started")

    // Event-loop heartbeat: detect main-thread blocks >500ms
    // Reports last key, render pipeline phase breakdown, render count, and cause
    // Pauses when terminal loses focus (saves CPU/battery — no diagnostics needed while blurred)
    let lastHeartbeat = performance.now()
    let lastRenderCount = 0
    const heartbeatInterval = setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis diagnostic hook
      const termFocused = (globalThis as any).__km_terminal_focused as boolean | undefined
      if (termFocused === false) {
        // Reset heartbeat baseline so we don't false-alarm on refocus
        lastHeartbeat = performance.now()
        return
      }
      const now = performance.now()
      const gap = now - lastHeartbeat
      if (gap > 500) {
        const parts = [`event loop blocked for ${gap.toFixed(0)}ms`]

        // Last key that was pressed (set by board-app handleKey)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis diagnostic hook
        const lastKey = (globalThis as any).__km_last_key as string | undefined
        if (lastKey) {
          parts.push(`after key='${lastKey}'`)
        } else {
          parts.push("(startup)")
        }

        // Per-phase pipeline timing from last render
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis diagnostic hook
        const pipeline = (globalThis as any).__silvery_last_pipeline as
          | { measure: number; layout: number; content: number; output: number; total: number }
          | undefined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis diagnostic hook
        const renderCount = ((globalThis as any).__silvery_render_count as number) ?? 0
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
    }, 200)
    void heartbeatInterval // runs until process exit
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
      // KM_STRICT detected state corruption
      process.stderr.write("\n\n[km] State invariant violation detected!\n")
      process.stderr.write(`Check: ${error.check}\n`)
      process.stderr.write(error.message + "\n")
      process.stderr.write("\nThis indicates a state corruption bug. Run without KM_STRICT=1 to continue.\n")
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

    // Build store parameters from initial board state
    const initialCursorNodeId = computeInitialCursor(state)
    // term.cols/rows are undefined when not a TTY; fall back to stdout then defaults
    const cols = term.cols ?? process.stdout.columns ?? 80
    const rows = term.rows ?? process.stdout.rows ?? 24

    const viewMode = options?.initialViewMode ?? "cards"

    // Load locations config (favorites, system locations, journal template)
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
    const savedWorkspace = isInteractive && vaultPath ? loadWorkspace("default", vaultPath) : null

    if (savedWorkspace) {
      log.debug?.(`Restoring saved workspace (${savedWorkspace.panes.length} panes)`)
    }

    // Detect terminal theme from actual colors (OSC 4/10/11) with fallback
    const theme = await detectTheme({ caps })
    log.debug?.(`Theme: ${theme.name}`)
    const defaultIconStyle = caps.nerdfont ? "nerdfont" : "workflowy"

    const storeParams: CreateBoardAppStoreParams = {
      repo: options.repo,
      toastQueue,
      navigator: createGridNavigator(),
      cursorStore: createCursorStoreFromRepo(options.repo, state.rootId, initialCursorNodeId),
      initialBoardState: createBoardState(state.rootId, state.rootPath, initialCursorNodeId, state.collapsedNodeIds),
      initialUIState: createInitialUIState({ columns: cols, rows }, defaultIconStyle),
      initialViewMode: viewMode,
      dimensions: { columns: cols, rows },
      savedWorkspace,
    }

    // Create L3 app (Zustand store + term:key handler)
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
    const boardApp = createBoardApp(storeParams)

    {
      using _ = run.span("render-setup")
      // With progressive column loading, the first render is an empty board frame
      // (fast), then columns fill in one-by-one on the alt screen. No need to show
      // "Rendering..." — the board frame appears almost immediately.
      const handle = await boardApp.run(
        <ThemeProvider theme={theme}>
          <RepoProvider repo={options.repo}>
            <InputLayerProvider>
              <BoardApp initialViewMode={viewMode} patchedConsole={patched} toastQueue={toastQueue} />
            </InputLayerProvider>
          </RepoProvider>
        </ThemeProvider>,
        isInteractive
          ? {
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

    // Clean up sync manager
    if (syncManager) {
      options?.repo?.emitter.setFsSync(null)
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
