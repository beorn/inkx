/**
 * @km/watch - Filesystem watching and sync
 *
 * Re-exports from src/watch for backwards compatibility
 */

// Watcher
export { FileSystemWatcher, scanDirectory, scanDirectoryRecursive } from "../../../src/watch/watcher.ts";
export type { WatcherConfig, FileChange } from "../../../src/watch/watcher.ts";

// Sync
export { SyncManager, syncOnce } from "../../../src/watch/sync.ts";
export type { SyncConfig, SyncState } from "../../../src/watch/sync.ts";

// Reconcile
export {
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
} from "../../../src/watch/reconcile.ts";
export type { ReconcileOp } from "../../../src/watch/reconcile.ts";

// Ignore patterns
export { shouldIgnore, DEFAULT_IGNORE_PATTERNS } from "../../../src/watch/ignore.ts";

// Write queue
export { WriteQueue, shouldApplyToFs } from "../../../src/watch/writequeue.ts";
export type { PendingWrite, WriteQueueConfig } from "../../../src/watch/writequeue.ts";
