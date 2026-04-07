// Watcher
export { FileSystemWatcher, scanDirectory, scanDirectoryRecursive } from "./watcher.ts"

export type { WatcherConfig, FileChange } from "./watcher.ts"

// Worker-based watcher (non-blocking)

// Watcher status types
export type { WatcherStatus, WatcherState } from "./worker-thread.ts"

// Shared types
export type { WatcherInterface, SyncData } from "./types.ts"

// Sync
export { withSync } from "./sync.ts"
export { withFsWriter } from "./fs-writer.ts"

export type { Sync, SyncConfig, SyncCallbacks, SyncFromFsResult, SyncableRepo } from "./sync.ts"

// Bulk sync (standalone FS<->DB sync, usable from TUI and CLI)
export { BulkSync, wrapEmitterForReconcile } from "./bulk-sync.ts"

export type { BulkSyncDeps, SyncProgressCallback, SyncProgress, BlockIdAssigner } from "./bulk-sync.ts"

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
} from "../fs/ignore.ts"
export type { PatternMatcher, PatternMatcherOptions } from "../fs/ignore.ts"

// Write queue
export { WriteQueue } from "./writequeue.ts"

export type { PendingWrite, WriteQueueConfig, ConflictInfo } from "./writequeue.ts"

// Heartbeat (periodic reconciliation)
export { createHeartbeat, DEFAULT_HEARTBEAT } from "./heartbeat.ts"

export type { HeartbeatConfig, HeartbeatDeps, Heartbeat } from "./heartbeat.ts"

// Reconciliation engine (FS→DB)
export { createReconciliationEngine } from "./reconciliation-engine.ts"

export type { ReconciliationEngine, ReconciliationEngineConfig } from "./reconciliation-engine.ts"

// Ownership tracker (unified two-tier ownership: in-memory L1 + SQLite L2)
export { createOwnershipTracker } from "./ownership-tracker.ts"

export type { OwnershipTracker } from "./ownership-tracker.ts"

// Sync state (persisted content-hash baseline — L2 backing store for OwnershipTracker)
export { createSyncState } from "./sync-state.ts"

export type { SyncState, SyncStateEntry } from "./sync-state.ts"
