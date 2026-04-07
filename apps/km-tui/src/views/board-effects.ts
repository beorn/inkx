/**
 * Board lifecycle effects - setup/teardown hooks
 */
import type { UIState, SyncEvent } from "../state/ui-reducer.ts"
import { createPasteHandler, supportsFileDrop } from "../handlers/paste-handler.ts"
import { tuiEvents } from "../tui.tsx"
import type { WatcherStatus } from "@km/storage"
import { kmEvents, type ToastQueue } from "@km/core"
import { notify } from "@silvery/ag-react"

type SetUI = (partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) => void

/**
 * Creates the file drop handler effect
 * Handles bracketed paste for file drops
 */
export function createFileDropHandler(setUI: SetUI): () => void {
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
    // Show skeleton loading during sync (large repos may take noticeable time)
    const isSyncing = status.state === "syncing"
    setUI({
      watcherStatus: status,
      isLoading: isSyncing,
      ...(isSyncing ? { loadingStartTime: Date.now() } : { loadingStartTime: null }),
    })

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
 * Creates the background parse state handler effect.
 * Subscribes to "background-parse" events emitted by the CLI layer during
 * discoverOnly deferred-file parsing. Sets `backgroundParsing` in UI state
 * so columns can show skeleton cards even if the watcher reports idle.
 */
export function createBackgroundParseHandler(setUI: SetUI): () => void {
  const handler = (parsing: boolean) => {
    setUI({ backgroundParsing: parsing })
  }
  tuiEvents.on("background-parse", handler)
  return () => {
    tuiEvents.off("background-parse", handler)
  }
}

const MAX_SYNC_EVENTS = 100

/**
 * Creates the sync event collector effect
 * Subscribes to watcher status changes and pushes SyncEvent entries for the sync pane
 */
export function createSyncEventCollector(setUI: SetUI): () => void {
  let lastState: string | null = null

  const pushEvent = (event: SyncEvent) => {
    setUI((prev) => ({
      syncEvents: [event, ...prev.syncEvents].slice(0, MAX_SYNC_EVENTS),
    }))
  }

  const handleWatcherStatus = (status: WatcherStatus) => {
    const newState = status.state
    if (newState === lastState) return
    lastState = newState

    if (newState === "syncing") {
      pushEvent({
        timestamp: Date.now(),
        type: "sync-start",
        message: `Syncing${status.pendingPaths > 0 ? ` (${status.pendingPaths} pending)` : ""}`,
      })
    } else if (newState === "idle" || newState === "ready") {
      pushEvent({
        timestamp: Date.now(),
        type: "sync-complete",
        message: `Sync complete (${status.watchedPaths ?? 0} files watched)`,
      })
    } else if (newState === "error") {
      pushEvent({
        timestamp: Date.now(),
        type: "error",
        message: `Watcher error${status.error ? `: ${status.error}` : ""}`,
      })
    } else {
      pushEvent({
        timestamp: Date.now(),
        type: "state-change",
        message: `Watcher: ${newState}`,
      })
    }
  }

  const unsubSyncError = kmEvents.on("sync-error", (e) => {
    pushEvent({
      timestamp: Date.now(),
      type: "write-error",
      message: `Write error: ${e.path} — ${e.message}`,
    })
  })

  tuiEvents.on("watcher-status", handleWatcherStatus)
  return () => {
    tuiEvents.off("watcher-status", handleWatcherStatus)
    unsubSyncError()
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
    notify(process.stdout, `Parse error in ${e.file}:${e.line}`, { title: "km" })
  })

  // Sync errors
  const unsubSyncError = kmEvents.on("sync-error", (e) => {
    toastQueue?.error(`Sync error: ${e.path}`, {
      description: e.message,
      batchKey: "sync-error",
    })
    notify(process.stdout, `Sync error: ${e.path}`, { title: "km" })
  })

  // External-edit conflicts: file changed on disk before km could save.
  // km already wrote a .conflict.<ts>.md backup — point the user at it.
  const unsubSyncConflict = kmEvents.on("sync-conflict", (e) => {
    const filename = e.path.split("/").pop() ?? e.path
    const backupName = e.backupPath ? (e.backupPath.split("/").pop() ?? e.backupPath) : null
    const description = backupName
      ? `External changes saved to ${backupName} — please review`
      : `External changes detected but backup could not be written — check ${filename}`
    toastQueue?.warning(`File changed externally: ${filename}`, {
      description,
      batchKey: "sync-conflict",
    })
    notify(process.stdout, `File changed externally: ${filename}`, { title: "km" })
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
    unsubSyncConflict()
    unsubValidationWarning()
  }
}
