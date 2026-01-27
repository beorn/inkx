// Watcher
export {
  FileSystemWatcher,
  scanDirectory,
  scanDirectoryRecursive,
  scanSymlinks,
  detectCaseSensitivity,
  normalizePath,
  detectCaseCollisions,
} from "./watcher.ts"

export type {
  WatcherConfig,
  FileChange,
  SymlinkInfo,
  CaseCollision,
} from "./watcher.ts"

// Worker-based watcher (non-blocking)
export { WorkerWatcher } from "./worker-bridge.ts"

export type { WorkerWatcherConfig } from "./worker-bridge.ts"

// Watcher status types
export type { WatcherStatus, WatcherState } from "./worker-thread.ts"

// Shared types
export type { WatcherInterface, SyncData } from "./types.ts"

// Sync
export { SyncManager } from "./sync.ts"

export type { SyncConfig, SyncFromFsResult } from "./sync.ts"

// Reconcile
export {
  reconcileDirectory,
  reconcileDirectoryRecursive,
  applyReconcileOps,
  getParentNodeId,
} from "./reconcile.ts"

export type { ReconcileOp, FsEntry, DirectoryScanner } from "./reconcile.ts"

// Ignore patterns
export {
  DEFAULT_IGNORE_PATTERNS,
  HIDDEN_FILE_PATTERN,
  readGitignore,
  readKmignore,
  readObsidianIgnore,
  getIgnorePatterns,
  createIgnoreMatcher,
  PatternMatcher,
  matchesPattern,
  shouldIgnore,
  isHiddenFile,
} from "../ignore.ts"

// Write queue
export { WriteQueue, shouldApplyToFs } from "./writequeue.ts"

export type {
  PendingWrite,
  WriteQueueConfig,
  InFlightTracker,
  FileSystemOps,
} from "./writequeue.ts"
