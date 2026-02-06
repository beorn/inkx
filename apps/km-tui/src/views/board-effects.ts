/**
 * Board lifecycle effects - setup/teardown hooks
 */
import type { WriteStream } from "tty"
import type { Dispatch } from "react"
import { actions, type UIAction } from "../ui-reducer.ts"
import {
  createPasteHandler,
  supportsFileDrop,
} from "../handlers/paste-handler.ts"
import { tuiEvents } from "../tui.tsx"
import type { WatcherStatus } from "@km/storage"
import { kmEvents, type ToastQueue } from "@km/core"

/**
 * Creates the terminal dimension sync effect
 * Polls for valid dimensions and handles resize events
 */
export function createSyncTerminalDimensions(
  stdout: WriteStream | undefined,
  dispatch: Dispatch<UIAction>,
): () => void | undefined {
  if (!stdout) return () => {}

  const handleResize = () => {
    dispatch(
      actions.setDimensions({ columns: stdout.columns, rows: stdout.rows }),
    )
  }

  // Check if stdout has valid dimensions (not undefined)
  const syncDimensions = () => {
    if (stdout.columns !== undefined && stdout.rows !== undefined) {
      dispatch(
        actions.setDimensions({ columns: stdout.columns, rows: stdout.rows }),
      )
      return true
    }
    return false
  }

  // Try to sync immediately, otherwise poll until dimensions are available
  if (!syncDimensions()) {
    const interval = setInterval(() => {
      if (syncDimensions()) {
        clearInterval(interval)
        // Delay before marking ready to ensure alternate buffer is stable
        setTimeout(() => dispatch(actions.setReady(true)), 50)
      }
    }, 10)
    stdout.on("resize", handleResize)
    return () => {
      clearInterval(interval)
      stdout.off("resize", handleResize)
    }
  }

  // Dimensions available immediately - still delay to avoid race condition
  const timeout = setTimeout(() => dispatch(actions.setReady(true)), 50)

  stdout.on("resize", handleResize)
  return () => {
    clearTimeout(timeout)
    stdout.off("resize", handleResize)
  }
}

/**
 * Creates the file drop handler effect
 * Handles bracketed paste for file drops
 */
export function createFileDropHandler(
  dispatch: Dispatch<UIAction>,
): () => void | undefined {
  if (!supportsFileDrop()) return () => {}

  const cleanup = createPasteHandler((files) => {
    dispatch(actions.setDroppedFiles(files))
    dispatch(actions.showDropNotification())
    // Auto-hide notification after 3 seconds
    setTimeout(() => dispatch(actions.hideDropNotification()), 3000)
  })

  return cleanup
}

/**
 * Creates the refresh handler effect
 * Subscribes to external refresh events (filesystem changes)
 *
 * NEW ARCHITECTURE: No longer dispatches REFRESH action.
 * The useColumns hook depends on repo.stats.nodeCount, so React
 * automatically re-renders when repo changes.
 *
 * TODO: Verify repo stats update triggers re-render correctly.
 * May need to add a forceUpdate mechanism if repo mutation doesn't
 * change stats reference.
 */
export function createRefreshHandler(): () => void {
  // The refresh event is still useful for logging/debugging
  const handleRefresh = () => {
    // No-op: columns are derived from repo at render time
    // React will re-render when repo.stats changes
  }

  tuiEvents.on("refresh", handleRefresh)
  return () => {
    tuiEvents.off("refresh", handleRefresh)
  }
}

/**
 * Creates the watcher status handler effect
 * Subscribes to watcher status updates for bottom bar display
 */
export function createWatcherStatusHandler(
  dispatch: Dispatch<UIAction>,
  toastQueue?: ToastQueue,
): () => void {
  let lastSyncCount = 0

  const handleWatcherStatus = (status: WatcherStatus) => {
    dispatch(actions.setWatcherStatus(status))

    // Show toast when sync completes with changes
    if (status.state === "idle" || status.state === "ready") {
      const syncedCount = status.pendingPaths
      if (syncedCount > 0 && syncedCount !== lastSyncCount) {
        toastQueue?.success(
          `Synced ${syncedCount} file${syncedCount === 1 ? "" : "s"}`,
          {
            batchKey: "sync",
            duration: 2000,
          },
        )
        lastSyncCount = syncedCount
      }
    }
  }

  tuiEvents.on("watcher-status", handleWatcherStatus)
  return () => {
    tuiEvents.off("watcher-status", handleWatcherStatus)
  }
}

/**
 * Creates the error/warning event handler effect
 * Subscribes to cross-layer error/warning events and displays toasts
 */
export function createErrorWarningHandler(toastQueue?: ToastQueue): () => void {
  // Parse errors
  const unsubParseError = kmEvents.on("parse-error", (e) => {
    toastQueue?.error(`Parse error in ${e.file}:${e.line}`, {
      description: e.message,
      batchKey: "parse-error",
    })
  })

  // Sync errors
  const unsubSyncError = kmEvents.on("sync-error", (e) => {
    toastQueue?.error(`Sync error: ${e.path}`, {
      description: e.message,
      batchKey: "sync-error",
    })
  })

  // Validation warnings
  const unsubValidationWarning = kmEvents.on("validation-warning", (e) => {
    toastQueue?.warning("Validation warning", {
      description: e.message,
      batchKey: "validation",
    })
  })

  return () => {
    unsubParseError()
    unsubSyncError()
    unsubValidationWarning()
  }
}
