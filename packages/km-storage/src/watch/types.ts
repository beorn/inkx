/**
 * Shared types for file watching
 */

import type { EventEmitter } from "events"

/**
 * Data emitted on sync events
 */
export interface SyncData {
  paths: string[]
  directories: string[]
  overflow?: boolean
  mustScanSubDirs?: boolean
}

/**
 * Common interface for file watchers.
 *
 * Implement this interface to create a drop-in replacement watcher
 * (e.g., for chaos testing with @beorn/watcher-chaos).
 */
export interface WatcherInterface extends EventEmitter {
  /** Start watching a directory */
  start(repoPath: string): void

  /** Stop watching */
  stop(): Promise<void>

  /** Mark a path as in-flight (being written by us) */
  markInFlight(path: string): void

  /** Clear in-flight status after write settles */
  clearInFlight(path: string, delayMs?: number): void

  /** Check if a path is in-flight */
  isInFlight?(path: string): boolean

  /** Force immediate sync (bypass debounce) */
  forceSync?(): void

  // Events emitted:
  // "ready" - watcher is ready
  // "sync" - batch of changes detected (SyncData)
  // "error" - error occurred
}
