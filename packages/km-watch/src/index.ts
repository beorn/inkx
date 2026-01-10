// Watcher
export {
  FileSystemWatcher,
  scanDirectory,
  scanDirectoryRecursive,
} from "./watcher.ts";

export type { WatcherConfig, FileChange } from "./watcher.ts";

// Sync
export { SyncManager } from "./sync.ts";

export type { SyncConfig } from "./sync.ts";

// Reconcile
export {
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
} from "./reconcile.ts";

export type { ReconcileOp } from "./reconcile.ts";

// Ignore patterns
export {
  DEFAULT_IGNORE_PATTERNS,
  HIDDEN_FILE_PATTERN,
  readGitignore,
  readKmignore,
  readObsidianIgnore,
  getIgnorePatterns,
  matchesPattern,
  shouldIgnore,
  isHiddenFile,
} from "./ignore.ts";

// Write queue
export { WriteQueue, shouldApplyToFs } from "./writequeue.ts";

export type { PendingWrite, WriteQueueConfig } from "./writequeue.ts";
