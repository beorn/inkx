/**
 * Watch module
 *
 * Re-exports filesystem watching and sync functionality
 */

// Watcher
export {
  FileSystemWatcher,
  scanDirectory,
  scanDirectoryRecursive,
} from "./watcher.ts";

export type { WatcherConfig, FileChange } from "./watcher.ts";

// Reconciliation
export {
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
} from "./reconcile.ts";

export type { ReconcileOp } from "./reconcile.ts";

// Write Queue
export { WriteQueue, shouldApplyToFs } from "./writequeue.ts";

export type { PendingWrite, WriteQueueConfig } from "./writequeue.ts";

// Sync Manager
export { SyncManager, syncOnce } from "./sync.ts";

export type { SyncConfig, SyncState } from "./sync.ts";
