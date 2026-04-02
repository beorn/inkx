// Watcher
export { FileSystemWatcher, scanDirectory, scanDirectoryRecursive } from "./watcher.ts"

export type { WatcherConfig, FileChange } from "./watcher.ts"

// Worker-based watcher (non-blocking)

// Watcher status types
export type { WatcherStatus, WatcherState } from "./worker-thread.ts"

// Shared types
export type { WatcherInterface, SyncData } from "./types.ts"

// Sync
export { SyncManager } from "./sync.ts"
export { FsWriter } from "./fs-writer.ts"

export type { SyncConfig, SyncFromFsResult } from "./sync.ts"

// Reconcile
export { reconcileDirectory, applyReconcileOps, applyReconcileOpsAsync, getParentNodeId } from "./reconcile.ts"

export type { ReconcileOp } from "./reconcile.ts"

// Ignore patterns
export {
  DEFAULT_IGNORE_PATTERNS,
  HIDDEN_FILE_PATTERN,
  readGitignore,
  readKmignore,
  readObsidianIgnore,
  getIgnorePatterns,
  createIgnoreMatcher,
  matchesPattern,
  shouldIgnore,
  isHiddenFile,
} from "../ignore.ts"
export type { PatternMatcher, PatternMatcherOptions } from "../ignore.ts"

// Write queue
export { WriteQueue, shouldApplyToFs } from "./writequeue.ts"

export type { PendingWrite, WriteQueueConfig } from "./writequeue.ts"

// Sync state (persisted content-hash baseline)
export { createSyncState } from "./sync-state.ts"

export type { SyncState, SyncStateEntry } from "./sync-state.ts"
