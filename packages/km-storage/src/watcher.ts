/**
 * Watcher - File Sync Service
 *
 * Wraps SyncManager to implement the Service interface for lifecycle control.
 * Created via createWatcher() or vault.watch().
 */

import createDebug from "debug"
import type { Database } from "bun:sqlite"
import { getDb } from "./db.ts"
import { SyncManager, type SyncConfig } from "./watch/index.ts"
import type { FileChange } from "./watch/index.ts"

const debug = createDebug("km:storage:watcher")

/** Service status for lifecycle control */
export type ServiceStatus = "stopped" | "starting" | "running" | "stopping"

/**
 * Base Service interface for objects with start/stop lifecycle.
 * Implements AsyncDisposable for automatic cleanup.
 */
export interface Service extends AsyncDisposable {
  readonly status: ServiceStatus
  start(): Promise<void>
  stop(): Promise<void>
}

/**
 * Watcher interface - file sync service.
 * Implements Service for start/stop lifecycle.
 */
export interface Watcher extends Service {
  /** Subscribe to file changes */
  on(event: "change", handler: (changes: FileChange[]) => void): void
  on(event: "error", handler: (error: Error) => void): void
  on(event: "ready", handler: () => void): void

  /** Unsubscribe from events */
  off(event: "change", handler: (changes: FileChange[]) => void): void
  off(event: "error", handler: (error: Error) => void): void
  off(event: "ready", handler: () => void): void
}

/** Options for createWatcher */
export interface WatcherOptions {
  /** Database instance (injected from vault) */
  db?: Database
  /** Debounce time for filesystem events in ms (default: 5000) */
  debounceFs?: number
  /** Debounce time for database apply in ms (default: 3000) */
  debounceApply?: number
  /** Conflict resolution strategy */
  conflictStrategy?: "last_write_wins" | "fs_wins" | "db_wins"
  /** Use worker thread for watching (default: true) */
  useWorker?: boolean
}

/**
 * Create a Watcher for a vault path.
 *
 * The watcher implements the Service interface with start/stop lifecycle.
 * Use `await using watcher = createWatcher(path)` for automatic cleanup.
 *
 * @example
 * await using watcher = createWatcher("/path/to/vault");
 * await watcher.start();
 * watcher.on("change", (changes) => console.log(changes));
 * // ... watcher.stop() called automatically
 *
 * @param vaultPath - Path to the vault root
 * @param options - Watcher configuration
 * @returns Watcher service
 */
export function createWatcher(
  vaultPath: string,
  options?: WatcherOptions,
): Watcher {
  debug("createWatcher", { vaultPath, options })

  let status: ServiceStatus = "stopped"

  // Create SyncManager with config (use injected db or fallback to global)
  const config: SyncConfig = {
    db: options?.db ?? getDb(),
    vaultPath,
    debounceFs: options?.debounceFs ?? 5000,
    debounceApply: options?.debounceApply ?? 3000,
    conflictStrategy: options?.conflictStrategy ?? "last_write_wins",
    useWorker: options?.useWorker ?? true,
  }

  const syncManager = new SyncManager(config)

  // Event handler storage
  type ChangeHandler = (changes: FileChange[]) => void
  type ErrorHandler = (error: Error) => void
  type ReadyHandler = () => void
  type AnyHandler = ChangeHandler | ErrorHandler | ReadyHandler

  const handlers = new Map<string, Set<AnyHandler>>()

  // Forward SyncManager events to our handlers
  syncManager.on("state-change", () => {
    const changeHandlers = handlers.get("change")
    if (changeHandlers) {
      // state-change doesn't include details, emit empty for now
      // The actual changes are handled internally by SyncManager
      changeHandlers.forEach((h) => (h as ChangeHandler)([]))
    }
  })

  syncManager.on("error", (error: Error) => {
    const errorHandlers = handlers.get("error")
    errorHandlers?.forEach((h) => (h as ErrorHandler)(error))
  })

  syncManager.on("ready", () => {
    const readyHandlers = handlers.get("ready")
    readyHandlers?.forEach((h) => (h as ReadyHandler)())
  })

  const watcher: Watcher = {
    get status() {
      return status
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- Service interface requires Promise<void>
    async start() {
      if (status !== "stopped") {
        debug("start called but status is %s", status)
        return
      }

      status = "starting"
      debug("starting watcher")

      try {
        syncManager.start()
        status = "running"
        debug("watcher started")
      } catch (error) {
        status = "stopped"
        throw error
      }
    },

    async stop() {
      if (status !== "running") {
        debug("stop called but status is %s", status)
        return
      }

      status = "stopping"
      debug("stopping watcher")

      try {
        await syncManager.stop()
        status = "stopped"
        debug("watcher stopped")
      } catch (error) {
        // Force status to stopped even on error
        status = "stopped"
        throw error
      }
    },

    on(event: string, handler: AnyHandler) {
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we just set it above
      handlers.get(event)!.add(handler)
    },

    off(event: string, handler: AnyHandler) {
      handlers.get(event)?.delete(handler)
    },

    async [Symbol.asyncDispose]() {
      await this.stop()
    },
  }

  return watcher
}

// Re-export FileChange type for consumers
export type { FileChange } from "./watch/index.ts"
