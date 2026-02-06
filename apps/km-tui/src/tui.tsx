/**
 * Board TUI
 *
 * Terminal interaction layer using Ink (React for CLI)
 */

import { EventEmitter } from "events"
import { writeSync } from "fs"
import {
  createTerm,
  render,
  patchConsole,
  IncrementalRenderMismatchError,
  InputLayerProvider,
} from "inkx"
import { createConditionalLogger } from "@beorn/logger"
import React from "react"
import { createLogger, createToastQueue } from "@km/core"
import type { TUIBoardState, TuiOptions } from "./types.ts"
import { RepoProvider } from "./repo-context.tsx"
import { BoardApp } from "./views/index.ts"
import { SyncManager } from "@km/storage"

const log = createConditionalLogger("km:tui")
const spanLog = createLogger("km:tui")

/**
 * Global event emitter for TUI refresh events
 * Board components can subscribe to this to refresh when filesystem changes
 */
export const tuiEvents = new EventEmitter()
// Increase max listeners for test scenarios where many Board components are created
// Tests run 50+ Board instances, each adding refresh/watcher-status listeners
tuiEvents.setMaxListeners(200)

/**
 * Restore terminal to normal state after crash or exit.
 */
function restoreTerminal(): void {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    try {
      process.stdin.setRawMode(false)
    } catch {
      // Ignore errors during cleanup
    }
  }

  const sequences = [
    "\x1b[0m", // Reset text attributes
    "\x1b[?1007l\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l", // Disable mouse
    "\x1b[?1l", // Disable application cursor keys
    "\x1b[?2004l", // Disable bracketed paste
    "\x1b[?25h", // Show cursor
    "\x1b[?1049l", // Exit alternate screen
  ].join("")

  try {
    writeSync(process.stdout.fd, sequences)
  } catch {
    process.stdout.write(sequences)
  }
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
export async function runBoard(
  state: TUIBoardState | null,
  options?: TuiOptions,
): Promise<void> {
  using run = spanLog.span("run-board")
  log.debug?.("runBoard start")

  if (!state || !options?.repo) {
    console.error("No board found or repo missing.")
    process.exit(1)
  }

  using toastQueue = createToastQueue()
  const term = createTerm()
  const interactive = options?.interactive !== false
  const isInteractive = interactive && term.hasInput()

  log.debug?.(
    `TTY detection interactive=${interactive} hasInput=${term.hasInput()} isInteractive=${isInteractive}`,
  )

  // Use term for interactive, TermDef with stdout for static
  const renderOpts = isInteractive
    ? term
    : { width: term.cols, stdout: process.stdout }

  // Initialize filesystem sync if we have a repo path (only for interactive)
  // Watch can be disabled via: --no-watch CLI flag or config tui.watch=false
  // Note: Disabling watch still allows TUI edits to write to filesystem,
  // it just disables watching for external file changes
  let syncManager: SyncManager | null = null

  if (isInteractive && state.rootPath && options?.watch !== false) {
    using _ = run.span("sync-manager-init")
    const useWorker = options?.watchWorker !== false
    log.debug?.(
      `Creating SyncManager rootPath=${state.rootPath} watch=true worker=${useWorker}`,
    )
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

    log.debug?.("Starting syncManager...")
    syncManager.start()
    log.debug?.("syncManager started")
  }

  // Register error handlers to clean up terminal on crash
  // Uses process.stderr.write directly because console.error might still be patched
  const handleError = (error: Error) => {
    restoreTerminal()
    if (error instanceof IncrementalRenderMismatchError) {
      // INKX_CHECK_INCREMENTAL detected a bug - show message and exit
      process.stderr.write("\n\n[inkx] Incremental render mismatch detected!\n")
      process.stderr.write(error.message + "\n")
      process.stderr.write(
        "\nThis indicates a bug in incremental rendering. File an issue or run\n",
      )
      process.stderr.write(
        "without INKX_STRICT to continue using the TUI (with visual glitches).\n",
      )
      process.exit(1)
    }
    process.stderr.write(`\n\nTUI crashed with error: ${error.message}\n`)
    process.stderr.write((error.stack ?? "") + "\n")
    process.exit(1)
  }

  const handleSignal = (signal: string) => {
    restoreTerminal()
    process.exit(signal === "SIGINT" ? 130 : 143)
  }

  process.on("uncaughtException", handleError)
  process.on("unhandledRejection", (reason) => {
    handleError(reason instanceof Error ? reason : new Error(String(reason)))
  })
  process.once("SIGINT", () => handleSignal("SIGINT"))
  process.once("SIGTERM", () => handleSignal("SIGTERM"))

  // Use pre-created patchedConsole if provided (counts startup warnings),
  // otherwise create one now. capture: true = store entries for exit dump.
  const patched = isInteractive
    ? (options?.patchedConsole ?? patchConsole(console, { capture: true }))
    : null

  try {
    // Stop CLI spinner - TUI is about to take over the screen
    options?.spinner?.stop()
    log.debug?.(`Starting TUI isInteractive=${isInteractive}`)

    let instance: Awaited<ReturnType<typeof render>>
    {
      using _ = run.span("render-setup")
      instance = await render(
        <RepoProvider repo={options.repo}>
          <InputLayerProvider>
            <BoardApp
              initialState={state}
              initialViewMode={options?.initialViewMode}
              patchedConsole={patched}
              toastQueue={toastQueue}
            />
          </InputLayerProvider>
        </RepoProvider>,
        renderOpts,
        { alternateScreen: isInteractive, patchConsole: false },
      )
    }

    // Now that alternate screen is active, notify caller (CLI uses this
    // to flush buffered debug output to Console component)
    if (patched) options?.onReady?.()

    // End the run span before blocking on waitUntilExit (TUI is now running)
    run.end()

    await instance.waitUntilExit()
  } finally {
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
          const stream =
            entry.stream === "stderr" ? process.stderr : process.stdout
          const args = entry.args
            .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
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
