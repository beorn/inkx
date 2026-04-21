// Database schema (for testing with in-memory databases)
export { SCHEMA, migrateSchema, migrateData, DATA_VERSION } from "./db/schema.ts"

// Link resolver (for benchmarks and testing)
export { createLinkResolver, type LinkResolver } from "./markdown/link-resolver.ts"

// DataStore interface and factories (preferred API for tree operations)
// See: docs/00-principles.md
export { createMapDataStore, createMemDataStore, createDBDataStore } from "./data-store.ts"

export type {
  DataStore,
  MapDataStore,
  DBDataStore,
  ChangeSourced,
  HasDatabase,
  ChangeLog,
  StoreChange,
} from "./data-store.ts"

// FileTree interface and factories (simple file I/O abstraction)
// See: docs/00-principles.md
export { createDiskFileTree, createMemFileTree } from "./fs/file-tree.ts"

export type { FileTree } from "./fs/file-tree.ts"

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
  // Link operations (canonical 3-column schema — see docs/design/model/klink.md)
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinksByHref,
  // Mutation operations (factory pattern - use createDbOps())
  createDbOps,
  buildEmbedChild,
  // Change application (internal use)
  applyChangeWithDb,
} from "./db/db.ts"

export type { KLink, KLinkRel, SearchResult, QueryAST, DbOps, EmbedChildOpts } from "./db/db.ts"

// Store abstraction
// NOTE: DiskStore removed - use DataStore + Emitter pattern via createRepo()
export { MemoryStore, createStoreFromRepo } from "./store/store.ts"
export { createSQLiteStore } from "./store/sqlite.ts"
export { createFsStore } from "./store/fs.ts"

export type { NodeStore, Store, Observable, Replicated } from "./store/store.ts"
export type { FsStore, FsStoreOptions } from "./store/fs.ts"

// Unified repo loading
export { readChanges, resolveLinksAsync, parseDeferredAsync, parseStubFile, ensureRepoRootNode } from "./repo/loader.ts"

export type { LoadResult, LoadOptions, PendingLink, DeferredFile, StepYield } from "./repo/loader.ts"
export type { LoadError as RepoLoaderError } from "./repo/loader.ts"

// Inbound anchor resolution for collapsed files (C4)
export { resolveAnchor } from "./links/resolve-anchor.ts"

export type {
  AnchorResolution,
  AnchorResolutionKind,
  ResolveAnchorInput,
} from "./links/resolve-anchor.ts"

export { resolveInboundAnchors } from "./markdown/resolve-inbound-anchors.ts"

export type {
  ResolveInboundAnchorsOptions,
  ResolveInboundAnchorsResult,
} from "./markdown/resolve-inbound-anchors.ts"

export { extractAnchors } from "./markdown/extract-anchors.ts"
export type { ExtractedAnchor } from "./markdown/extract-anchors.ts"

// Referenced-anchor DB reads (for diagnostic scripts)
export {
  countReferencedAnchors,
  getReferencedAnchor,
  getReferencedAnchorsForFile,
  removeReferencedAnchors,
} from "./db/referenced-anchors.ts"

export type { ReferencedAnchorRow } from "./db/referenced-anchors.ts"

// Change compaction & store health diagnostics
export { identifyStaleChanges, compactChanges, vacuumDb, getStoreHealth } from "./change-compaction.ts"

export type { CompactionResult, StoreHealth } from "./change-compaction.ts"

// km-fast-md.6: Worker pool for parallel parsing
// km-disposable.3: Service factory pattern
export { createParsePool } from "./markdown/parse-pool.ts"

export type { ParsePoolService, ParseResult as PoolParseResult, ParsePoolOptions } from "./markdown/parse-pool.ts"

// Watcher domain object (Service for file sync)
export { createWatcher } from "./watcher.ts"

export type { Watcher, WatcherOptions } from "./watcher.ts"

// Database rules (add= materialization)
export { evaluateAllRules, evaluateNodeRules, onNodeChanged, onNodeDeleted, createRuleContext } from "./db/rules.ts"

export type { RulesProgress, RuleContext } from "./db/rules.ts"

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
} from "./fs/cas.ts"

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
} from "./markdown/processing.ts"

export type { ProcessedMarkdown, ResolvedLink } from "./markdown/processing.ts"

// Async generator pipeline (composable stages for loading/syncing)
export {
  parseFiles,
  applyNodes,
  pipelineResolveLinks,
  applyLinks,
  runPipeline,
  collect,
  runDeferredPipeline,
} from "./markdown/pipeline.ts"

export type { ParseSource, ParsedFile, AppliedFile, PipelineOptions } from "./markdown/pipeline.ts"

// Path utilities for filesystem-based node resolution
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

// ID utilities for consistent node ID generation
export { generatePathBasedId } from "./fs/id-utils.ts"

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
  ConflictInfo,
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
export {
  loadConfig,
  clearConfigCache,
  getOriginalBeadsConfig,
  getFolderIndexConfig,
  getCollapseParseConfig,
} from "./config.ts"

export type {
  KmConfig,
  BeadsConfig,
  TuiConfig,
  FolderIndexConfig,
  CollapseParseConfig,
  OriginalBeadsConfig,
} from "./config.ts"

// Collapse-parse matcher (folder-level opaque-stub rule)
export { createCollapseParseMatcher, createNullCollapseParseMatcher } from "./markdown/collapse-parse.ts"

export type { CollapseParseMatcher } from "./markdown/collapse-parse.ts"

// Index file writer (pure functions for folder index files)
export { buildIndexContent, generateIndexFileContent, indexFileName } from "./index-file-writer.ts"

// Config domain object (preferred API)
export { loadConfigObject } from "./config-object.ts"

export type { Config } from "./config-object.ts"

// Commit taxonomy — types for the reactive store layer
export { ResourceState, computeDelta, mergeDeltas } from "./store/commit-types.ts"

export type { CommitMeta, CommitSource, CommitResult, RepoDelta, ChangeEnvelope } from "./store/commit-types.ts"

// Reactive signals layer — per-node signals driven by RepoDelta
export { withReactive } from "./store/reactive.ts"

// Sibling order persistence (survives state.db rebuilds)
export { readSiblingOrder, writeSiblingOrder, applySiblingOrder } from "./sibling-order.ts"

export type { SiblingOrderMap } from "./sibling-order.ts"

export type { Reactive, ReadonlySignal } from "./store/reactive.ts"

// Emitter domain object - owns change emission lifecycle
export { createEmitter } from "./emitter.ts"

export type { Emitter, EmitterOptions, EmitOptions, ChangeHub } from "./emitter.ts"

// Repo domain object - PREFERRED API for new code
// Composed: DataStore + FileTree + Config
// See: docs/00-principles.md
export { createRepo, createBareRepo, createTestRepo, createTestEnvRepo, IncompleteDatabase } from "./repo/repo.ts"

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
} from "./repo/repo.ts"

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
