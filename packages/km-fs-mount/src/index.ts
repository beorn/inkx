// @km/fs-mount — filesystem mount layer for km.
//
// Owns the fs/ utilities, watch/ subsystem, and FS-backed store
// extracted from @km/storage so backend-agnostic consumers (web, canvas,
// future targets) can use @km/storage without pulling node:fs.

// ─── FS utilities ───────────────────────────────────────────────────────────
export { createDiskFileTree, createMemFileTree } from "./fs/file-tree.ts"
export type { FileTree } from "./fs/file-tree.ts"

export {
  getBlobsPath,
  hashContent,
  storeContent,
  loadContent,
  hasContent,
  shouldStoreInCas,
  storeContentAuto,
  loadContentAuto,
} from "./fs/cas.ts"

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
} from "./fs/ignore.ts"

export type { PatternMatcher, PatternMatcherOptions } from "./fs/ignore.ts"

export {
  isExplicitPath,
  findKmRootFromPath,
  resolveFsPath,
  getEffectiveRoot,
  resolvePathArg,
  toRelativeFsPath,
  toAbsoluteFsPath,
} from "./fs/path-utils.ts"

export type { PathResolution, ResolvedPathArg } from "./fs/path-utils.ts"

export { generatePathBasedId } from "./fs/id-utils.ts"

// ─── Watch / sync ───────────────────────────────────────────────────────────
export { FileSystemWatcher, scanDirectory, scanDirectoryRecursive } from "./watch/watcher.ts"

export type { WatcherConfig, FileChange } from "./watch/watcher.ts"

export type { WatcherStatus, WatcherState } from "./watch/worker-thread.ts"

export type { WatcherInterface, SyncData } from "./watch/types.ts"

export { withSync } from "./watch/sync.ts"
export { withFsWriter } from "./watch/fs-writer.ts"

export type { Sync, SyncConfig, SyncCallbacks, SyncFromFsResult, SyncableRepo } from "./watch/sync.ts"

export { BulkSync, wrapEmitterForReconcile } from "./watch/bulk-sync.ts"

export type { BulkSyncDeps, SyncProgressCallback, SyncProgress, BlockIdAssigner } from "./watch/bulk-sync.ts"

export {
  reconcileDirectory,
  reconcileDirectoryRecursive,
  reconcileDirectoryAsync,
  applyReconcileOps,
  applyReconcileOpsAsync,
  getParentNodeId,
} from "./watch/reconcile.ts"

export type { ReconcileOp, DirectoryScanner } from "./watch/reconcile.ts"

export type { ApplyResult } from "./watch/applier.ts"

export { WriteQueue } from "./watch/writequeue.ts"

export type { PendingWrite, WriteQueueConfig, ConflictInfo } from "./watch/writequeue.ts"

export { createHeartbeat, DEFAULT_HEARTBEAT } from "./watch/heartbeat.ts"

export type { HeartbeatConfig, HeartbeatDeps, Heartbeat } from "./watch/heartbeat.ts"

export { createReconciliationEngine } from "./watch/reconciliation-engine.ts"

export type { ReconciliationEngine, ReconciliationEngineConfig } from "./watch/reconciliation-engine.ts"

export { createOwnershipTracker } from "./watch/ownership-tracker.ts"

export type { OwnershipTracker } from "./watch/ownership-tracker.ts"

export { createSyncState } from "./watch/sync-state.ts"

export type { SyncState, SyncStateEntry } from "./watch/sync-state.ts"

// Safe writeback — content-as-CAS contract
export { safeWriteFile, writeFileAtomic } from "./watch/safe-write.ts"

export type { SafeWriteOptions, SafeWriteOutcome, SafeWriteResult } from "./watch/safe-write.ts"

// Watcher echo suppression
export { createEchoGuard } from "./watch/echo-guard.ts"

export type { EchoGuard, EchoGuardOptions, EchoVerdict } from "./watch/echo-guard.ts"

// ─── FS-backed store ────────────────────────────────────────────────────────
export { createFsStore } from "./store/fs.ts"

export type { FsStore, FsStoreOptions } from "./store/fs.ts"
