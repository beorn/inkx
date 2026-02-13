/**
 * Board lifecycle effects - setup/teardown hooks
 */
import type { UIState } from "../ui-reducer.ts"
import { createPasteHandler, supportsFileDrop } from "../handlers/paste-handler.ts"
import { tuiEvents } from "../tui.tsx"
import type { WatcherStatus } from "@km/storage"
import { kmEvents, type ToastQueue } from "@km/core"

type SetUI = (partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) => void

/**
 * Creates the file drop handler effect
 * Handles bracketed paste for file drops
 */
export function createFileDropHandler(setUI: SetUI): () => void | undefined {
  if (!supportsFileDrop()) return () => {}

  const cleanup = createPasteHandler((files) => {
    setUI({ droppedFiles: files, showDropNotification: true })
    // Auto-hide notification after 3 seconds
    setTimeout(() => setUI({ showDropNotification: false }), 3000)
  })

  return cleanup
}

/**
 * Creates the watcher status handler effect
 * Subscribes to watcher status updates for bottom bar display
 */
export function createWatcherStatusHandler(setUI: SetUI, toastQueue?: ToastQueue): () => void {
  let lastSyncCount = 0

  const handleWatcherStatus = (status: WatcherStatus) => {
    setUI({ watcherStatus: status })

    // Show toast when sync completes with changes
    if (status.state === "idle" || status.state === "ready") {
      const syncedCount = status.pendingPaths
      if (syncedCount > 0 && syncedCount !== lastSyncCount) {
        toastQueue?.success(`Synced ${syncedCount} file${syncedCount === 1 ? "" : "s"}`, {
          batchKey: "sync",
          duration: 2000,
        })
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
