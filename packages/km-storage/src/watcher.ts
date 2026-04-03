/**
 * Watcher - File Sync Service
 *
 * Wraps withSync() to implement the Service interface for lifecycle control.
 * Created via createWatcher() or repo.watch().
 * New code should use withSync(config)(repo) directly.
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { join } from "path"
import { withSync, type SyncableRepo, type SyncConfig } from "./watch/index.ts"
import { createEmitter } from "./emitter.ts"
import type { FileChange } from "./watch/index.ts"

const log = createLogger("km:storage:watcher")

/** Service status for lifecycle control */
export type ServiceStatus = "stopped" | "starting" | "running" | "stopping"

/**
 * Base Service interface for objects with start/stop lifecycle.
 * Implements AsyncDisposable for automatic cleanup.
 */
interface Service extends AsyncDisposable {
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
  /** Database instance (required - no singleton fallback) */
  db: Database
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
 * Create a Watcher for a repo path.
 *
 * The watcher implements the Service interface with start/stop lifecycle.
 * Use `await using watcher = createWatcher(path)` for automatic cleanup.
 *
 * @example
 * await using watcher = createWatcher("/path/to/repo");
 * await watcher.start();
 * watcher.on("change", (changes) => console.log(changes));
 * // ... watcher.stop() called automatically
 *
 * @param repoPath - Path to the repo root
 * @param options - Watcher configuration
 * @returns Watcher service
 */
export function createWatcher(repoPath: string, options: WatcherOptions): Watcher {
  log.debug?.(`createWatcher repoPath=${repoPath} options=${JSON.stringify(options)}`)

  let status: ServiceStatus = "stopped"

  // Event handler storage
  type ChangeHandler = (changes: FileChange[]) => void
  type ErrorHandler = (error: Error) => void
  type ReadyHandler = () => void
  type AnyHandler = ChangeHandler | ErrorHandler | ReadyHandler

  const handlers = new Map<string, Set<AnyHandler>>()

  // Build a minimal SyncableRepo for withSync
  const db = options.db
  const emitter = createEmitter({ kmDir: join(repoPath, ".km"), db })
  const miniRepo: SyncableRepo = {
    database: db,
    path: repoPath,
    emitter,
    apply(event, opts?) {
      return emitter.apply(event, opts)
    },
    commit(event, opts?) {
      return emitter.commit(event, opts)
    },
  }

  // Create Sync with typed callbacks that forward to our handler registry
  const syncConfig: Partial<SyncConfig> = {
    debounceFs: options.debounceFs ?? 5000,
    debounceApply: options.debounceApply ?? 3000,
    conflictStrategy: options.conflictStrategy ?? "last_write_wins",
    useWorker: options.useWorker ?? true,
    callbacks: {
      onStateChange: () => {
        const changeHandlers = handlers.get("change")
        if (changeHandlers) {
          changeHandlers.forEach((h) => (h as ChangeHandler)([]))
        }
      },
      onError: (error) => {
        const errorHandlers = handlers.get("error")
        errorHandlers?.forEach((h) => (h as ErrorHandler)(error as Error))
      },
      onReady: () => {
        const readyHandlers = handlers.get("ready")
        readyHandlers?.forEach((h) => (h as ReadyHandler)())
      },
    },
  }

  const sync = withSync(syncConfig)(miniRepo)

  const watcher: Watcher = {
    get status() {
      return status
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- Service interface requires Promise<void>
    async start() {
      if (status !== "stopped") {
        log.debug?.(`start called but status is ${status}`)
        return
      }

      status = "starting"
      log.debug?.("starting watcher")

      try {
        sync.start()
        status = "running"
        log.debug?.("watcher started")
      } catch (error) {
        status = "stopped"
        throw error
      }
    },

    async stop() {
      if (status !== "running") {
        log.debug?.(`stop called but status is ${status}`)
        return
      }

      status = "stopping"
      log.debug?.("stopping watcher")

      try {
        await sync.stop()
        status = "stopped"
        log.debug?.("watcher stopped")
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
