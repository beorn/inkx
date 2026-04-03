// Database schema (for testing with in-memory databases)
export { SCHEMA, migrateSchema } from "./schema.ts"

// Link resolver (for benchmarks and testing)
export { createLinkResolver, type LinkResolver } from "./link-resolver.ts"

// DataStore interface and factories (preferred API for tree operations)
// See: docs/00-principles.md
export { createMapDataStore, createMemDataStore, createDBDataStore } from "./data-store.ts"

export type {
  DataStore,
  MapDataStore,
  DBDataStore,
  EventSourced,
  HasDatabase,
  EventLog,
  StoreEvent,
} from "./data-store.ts"

// FileTree interface and factories (simple file I/O abstraction)
// See: docs/00-principles.md
export { createDiskFileTree, createMemFileTree } from "./file-tree.ts"

export type { FileTree } from "./file-tree.ts"

// Database operations (db-accepting functions for internal use)
// All application code should use Repo domain object (createRepo) instead
export {
  // Query operations (require Database parameter)
  getNode,
  getNodeByIdPrefix,
  getTaskByIdPrefix,
  getNodeByPath,
  getNodesUnderPath,
  getFileWithChildren,
  getNodeContentHash,
  findFileByName,
  findChildByContent,
  resolveNode,
  resolveTask,
  getNameIndex,
  getChildren,
  getChildrenByType,
  getBodyChildren,
  getSubitems,
  getChildCount,
  getChildCountsBatch,
  getSubtree,
  getAncestors,
  getTasksByStatus,
  getAllTasks,
  getLinksTo,
  getTasksFiltered,
  getTasksUnderNode,
  getFilteredNodes,
  findProject,
  search,
  searchWithSnippet,
  toFts5Query,
  getLastEventId,
  getAllNodes,
  getNodeCount,
  rowToNode,
  executeQuery,
  queryTasks,
  queryNodes,
  // Link operations (require Database parameter)
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinks,
  getBacklinksByName,
  resolveLinks,
  // Mutation operations (factory pattern - use createDbOps())
  createDbOps,
  buildEmbedChild,
  // Event application (internal use)
  applyEventWithDb,
} from "./db.ts"

export type { Link, SearchResult, QueryAST, DbOps, EmbedChildOpts } from "./db.ts"

// Store abstraction
// NOTE: DiskStore removed - use DataStore + Emitter pattern via createRepo()
export { MemoryStore, createStoreFromRepo } from "./store.ts"
export { createSQLiteStore } from "./sqlite-store.ts"

export type { NodeStore, Store, Observable, Replicated } from "./store.ts"

// Unified repo loading
export { readEvents, resolveLinksAsync, parseDeferredAsync, parseStubFile, ensureRepoRootNode } from "./repo-loader.ts"

export type { LoadResult, LoadOptions, PendingLink, DeferredFile, StepYield } from "./repo-loader.ts"
export type { LoadError as RepoLoaderError } from "./repo-loader.ts"

// Event compaction & store health diagnostics
export { identifyStaleEvents, compactEvents, vacuumDb, getStoreHealth } from "./event-compaction.ts"

export type { CompactionResult, StoreHealth } from "./event-compaction.ts"

// km-fast-md.6: Worker pool for parallel parsing
// km-disposable.3: Service factory pattern
export { createParsePool } from "./parse-pool.ts"

export type { ParsePoolService, ParseResult as PoolParseResult, ParsePoolOptions } from "./parse-pool.ts"

// Watcher domain object (Service for file sync)
export { createWatcher } from "./watcher.ts"

export type { Watcher, WatcherOptions } from "./watcher.ts"

// Database rules (add= materialization)
export { evaluateAllRules, evaluateNodeRules, onNodeChanged, onNodeDeleted, createRuleContext } from "./db-rules.ts"

export type { RulesProgress, RuleContext } from "./db-rules.ts"

// Content-addressable store
export {
  getBlobsPath,
  hashContent,
  storeContent,
  loadContent,
  hasContent,
  shouldStoreInCas,
  storeContentAuto,
  loadContentAuto,
} from "./cas.ts"

// Query language
export { parseQuery, resolveDateQuery } from "./query.ts"

export type { QueryCondition, QueryRef, DateRange } from "./query.ts"

// Re-export markdown parsing functions (to avoid other layers importing km-markdown directly)
export {
  parseTaskMetadata,
  extractTags,
  extractMentions,
  extractProjects,
  parseWikiLinks,
  nodeToText,
  // For km-watch sync layer
  parseMarkdownWithLinks,
  nodesToMarkdown,
} from "@km/markdown"

export type { ParseResult, ParseWarning } from "@km/markdown"

// Markdown processing utilities (shared between loading and syncing)
export {
  processMarkdownFile,
  toNodeEvents,
  toPendingLinks,
  toResolvedLinks,
  getFileNode,
} from "./markdown-processing.ts"

export type { ProcessedMarkdown, ResolvedLink } from "./markdown-processing.ts"

// Async generator pipeline (composable stages for loading/syncing)
export {
  parseFiles,
  applyNodes,
  pipelineResolveLinks,
  applyLinks,
  runPipeline,
  collect,
  runDeferredPipeline,
} from "./pipeline.ts"

export type { ParseSource, ParsedFile, AppliedFile, PipelineOptions } from "./pipeline.ts"

// Path utilities for filesystem-based node resolution
export {
  isExplicitPath,
  findKmRootFromPath,
  resolveFsPath,
  getEffectiveRoot,
  resolvePathArg,
  toRelativeFsPath,
  toAbsoluteFsPath,
} from "./path-utils.ts"

export type { PathResolution, ResolvedPathArg } from "./path-utils.ts"

// ID utilities for consistent node ID generation
export { generatePathBasedId } from "./id-utils.ts"

// Watch and sync (merged from @km/watch)
export {
  FileSystemWatcher,
  scanDirectory,
  scanDirectoryRecursive,
  withSync,
  withFsWriter,
  reconcileDirectory,
  applyReconcileOps,
  applyReconcileOpsAsync,
  getParentNodeId,
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
  WriteQueue,
} from "./watch/index.ts"

export type {
  WatcherConfig,
  FileChange,
  Sync,
  SyncConfig,
  SyncCallbacks,
  SyncableRepo,
  ReconcileOp,
  PendingWrite,
  WriteQueueConfig,
  WatcherStatus,
  WatcherState,
  WatcherInterface,
  SyncData,
  SyncFromFsResult,
  PatternMatcher,
  PatternMatcherOptions,
} from "./watch/index.ts"

// Recurrence utilities (moved from @km/core)
export { parseRRule, getNextOccurrence, naturalToRRule } from "./recurrence.ts"

// Configuration
export { loadConfig, clearConfigCache, getOriginalBeadsConfig, getFolderIndexConfig } from "./config.ts"

export type { KmConfig, BeadsConfig, TuiConfig, FolderIndexConfig, OriginalBeadsConfig } from "./config.ts"

// Index file writer (pure functions for folder index files)
export { buildIndexContent, generateIndexFileContent, indexFileName } from "./index-file-writer.ts"

// Config domain object (preferred API)
export { loadConfigObject } from "./config-object.ts"

export type { Config } from "./config-object.ts"

// Commit taxonomy — types for the reactive store layer
export { ResourceState, computeDelta } from "./commit-types.ts"

export type {
  CommitMeta,
  CommitSource,
  CommitResult,
  RepoDelta,
  ChangeEnvelope,
  ResourceState as ResourceStateT,
} from "./commit-types.ts"

// Reactive signals layer — per-node signals driven by RepoDelta
export { withReactive } from "./reactive.ts"

export type { Reactive, ReadonlySignal } from "./reactive.ts"

// Emitter domain object - owns event emission lifecycle
// Replaces global singletons in emit.ts with explicit ownership
// See: docs/00-principles.md
export {
  createEmitter,
  // Helper functions that take emitter as first parameter
  emitTaskClaimed as emitTaskClaimedWithEmitter,
  emitTaskReleased as emitTaskReleasedWithEmitter,
  emitTaskCompleted as emitTaskCompletedWithEmitter,
  emitSessionStarted as emitSessionStartedWithEmitter,
  emitSessionMessage as emitSessionMessageWithEmitter,
  emitSessionToolCall as emitSessionToolCallWithEmitter,
  emitSessionEnded as emitSessionEndedWithEmitter,
} from "./emitter.ts"

export type { Emitter, EmitterOptions, EmitOptions, EventHub } from "./emitter.ts"

// Repo domain object - PREFERRED API for new code
// Composed: DataStore + FileTree + Config
// See: docs/00-principles.md
export { createRepo, createBareRepo, createTestRepo, createTestEnvRepo, IncompleteDatabase } from "./repo.ts"

export type {
  Repo,
  CreateRepoOptions,
  CreateBareRepoOptions,
  CreateTestEnvRepoOptions,
  TestEnvRepoResult,
  SyncResult as RepoSyncResult,
  SyncConflict,
  RepoStats,
  ExpandResult,
  ExpandProgress,
} from "./repo.ts"

export type { UnexploredDir } from "./discovery.ts"

// Testing utilities
export {
  createFakeRepo,
  createChaosFakeRepo,
  createChaosHooks,
  createSeededRandom,
  generateChaosReport,
  formatChaosReport,
  formatChaosReportJson,
  formatChaosReportMarkdown,
  withTestEnv,
  withTestEnvSync,
  getTestMode,
  isRealMode,
  isMockMode,
  createFakeWatcher,
  // Fixture DSL for building test data
  board,
  column,
  task,
  section,
  paragraph,
  SIMPLE_BOARD,
  NESTED_BOARD,
  BODY_CONTENT_BOARD,
} from "./testing/index.ts"

export type {
  FakeRepo,
  FakeRepoOptions,
  ChaosFakeRepo,
  ChaosFakeRepoOptions,
  TransactionLogEntry,
  CorruptionType,
  ConsistencyIssue,
  ChaosHooksConfig,
  ChaosEvent,
  ChaosHooks,
  ChaosStats,
  ChaosScenario,
  ChaosStateSnapshot,
  ChaosRecommendation,
  ChaosReport,
  GenerateReportOptions,
  TestEnv,
  TestMode,
  FakeWatcher,
  BoardFixture,
} from "./testing/index.ts"
