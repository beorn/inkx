/**
 * Board TUI
 *
 * Terminal interaction layer using Ink (React for CLI)
 */

import { EventEmitter } from "events"
import chalk from "chalk"
import createDebug from "debug"
import type { TUIBoardState, TuiOptions } from "./types.ts"
import type { Repo } from "./repo-context.tsx"
import { renderBoardStatic } from "./render.ts"
import { renderInkxBoard } from "./views/index.ts"
import { setFsSync, SyncManager } from "@km/storage"

const debug = createDebug("km:tui")

/**
 * Global event emitter for TUI refresh events
 * Board components can subscribe to this to refresh when filesystem changes
 */
export const tuiEvents = new EventEmitter()
// Increase max listeners for test scenarios where multiple Board components are created
tuiEvents.setMaxListeners(50)

/**
 * Run the board in static (non-interactive) mode
 */
export function runBoardStatic(repo: Repo, state: TUIBoardState): void {
  const width = process.stdout.columns || 80
  console.log(renderBoardStatic(repo, state, width))
}

/**
 * Entry point for the board command
 *
 * State must already be loaded (via loadRepo) and board state built
 * (via initBoardState) before calling this. The CLI handles both with
 * a progress indicator.
 */
export async function runBoard(
  state: TUIBoardState | null,
  options?: TuiOptions,
): Promise<void> {
  debug("runBoard start")

  if (!state) {
    console.error(
      chalk.red("No board found. Create a board node or specify a root ID."),
    )
    process.exit(1)
  }

  // Non-interactive mode: just print and exit
  const interactive = options?.interactive !== false
  const repo = options?.repo
  if (!interactive) {
    if (!repo) {
      console.error(chalk.red("Repo required for static mode"))
      process.exit(1)
    }
    runBoardStatic(repo, state)
    return
  }

  // Interactive mode: check TTY
  const stdin = process.stdin
  const stdout = process.stdout
  const forceTTY = process.env.FORCE_TTY === "1"
  if (!forceTTY && (!stdin.isTTY || !stdout.isTTY)) {
    console.log(chalk.yellow("Not running in a TTY, using static mode"))
    if (!repo) {
      console.error(chalk.red("Repo required for static mode"))
      process.exit(1)
    }
    runBoardStatic(repo, state)
    return
  }

  // Initialize filesystem sync if we have a repo path
  // Watch can be disabled via: --no-watch CLI flag or config tui.watch=false
  // Note: Disabling watch still allows TUI edits to write to filesystem,
  // it just disables watching for external file changes
  const watchEnabled = options?.watch !== false
  const useWorker = options?.watchWorker !== false
  let syncManager: SyncManager | null = null

  if (state.rootPath) {
    if (!options?.repo) {
      throw new Error(
        "Repo required for SyncManager - cannot sync without database",
      )
    }
    debug("Creating SyncManager", {
      rootPath: state.rootPath,
      watch: watchEnabled,
      worker: useWorker,
    })
    syncManager = new SyncManager({
      db: options.repo.database,
      repoPath: state.rootPath,
      debounceFs: 2000, // Debounce external changes (2s)
      debounceApply: 100, // Small debounce for batching TUI changes
      conflictStrategy: "last_write_wins",
      useWorker, // Use worker thread by default (non-blocking)
    })

    // Wire up TUI changes → filesystem (always enabled for writes)
    setFsSync(syncManager)

    if (watchEnabled) {
      // Wire up filesystem changes → TUI refresh
      syncManager.on("state-change", (newState) => {
        if (newState === "idle") {
          tuiEvents.emit("refresh")
        }
      })

      // Forward watcher status to TUI for bottom bar display
      syncManager.on("watcher-status", (status) => {
        tuiEvents.emit("watcher-status", status)
      })

      debug("Starting syncManager...")
      syncManager.start()
      debug("syncManager started")
    } else {
      debug("File watching disabled - TUI edits will still write to filesystem")
    }
  }

  try {
    // Stop CLI spinner - TUI is about to take over the screen
    options?.spinner?.stop()
    debug("Starting interactive TUI")
    await renderInkxBoard(state, options?.initialViewMode, options?.repo)
  } finally {
    // Clean up sync manager
    if (syncManager) {
      setFsSync(null)
      await syncManager.stop()
    }
  }
}
