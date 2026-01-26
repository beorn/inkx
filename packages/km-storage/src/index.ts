// Database schema (for testing with in-memory databases)
export { SCHEMA } from "./schema.ts"

// DataStore interface and factories (preferred API for tree operations)
// See: docs/adr/002-domain-objects-refactor.md
export {
  createMapDataStore,
  createMemDataStore,
  createDBDataStore,
} from "./data-store.ts"

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
// See: docs/adr/002-domain-objects-refactor.md
export { createDiskFileTree, createMemFileTree } from "./file-tree.ts"

export type { FileTree } from "./file-tree.ts"

// Database operations (db-accepting functions for internal use)
// All application code should use Vault domain object (createVault) instead
export {
  // Path utility
  getDbPath,
  closeDb,
  getDb, // Deprecated singleton - use Vault.rawQuery() instead

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
  getChildren,
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
  // Mutation operations (require Database parameter)
  moveNode,
  updateNode,
  deleteNode,
  addNode,
  // Event application (internal use)
  applyEventWithDb,
} from "./db.ts"

export type { Link, SearchResult, QueryAST } from "./db.ts"

// Store abstraction
export {
  DiskStore,
  MemoryStore,
  initStore,
  getStore,
  closeStore,
} from "./store.ts"

export type { NodeStore } from "./store.ts"

// State rebuild (generators - use runWithProgress or for...of to consume)
export {
  readEvents,
  rebuildState,
  syncState,
  fullReset,
  freshStart,
  runWithProgress,
  runGenerator,
} from "./rebuild.ts"

export type { RebuildResult, SyncResult } from "./rebuild.ts"

// Unified vault loading (the ONE function for loading vaults)
export {
  loadRepo,
  resolveLinksAsync,
  parseDeferredAsync,
} from "./vault-loader.ts"

export type {
  LoadResult,
  LoadOptions,
  PendingLink,
  DeferredFile,
  StepYield,
} from "./vault-loader.ts"
export type { LoadError as VaultLoaderError } from "./vault-loader.ts"

// km-fast-md.6: Worker pool for parallel parsing
// km-disposable.3: Service factory pattern
export {
  createParsePool,
  getParsePool,
  shutdownParsePool,
  // Keep ParsePool for backwards compat during transition
  ParsePool,
} from "./parse-pool.ts"

export type {
  ParsePoolService,
  ParseResult as PoolParseResult,
  ParsePoolOptions,
} from "./parse-pool.ts"

/**
 * @deprecated Use {@link createRepo} for new code.
 * Vault is the legacy API that combines loading + storage.
 * Repo separates concerns: DataStore (indexed storage) + FileTree (file I/O).
 * See: docs/adr/002-domain-objects-refactor.md
 */
export { createVault } from "./vault.ts"

/**
 * @deprecated Use {@link Repo} for new code.
 * These types are preserved for backwards compatibility during migration.
 */
export type {
  Vault,
  RepoOptions,
  VaultStats,
  LoadError,
  RepoHooks,
  MutationType,
  MutationContext,
  BeforeMutationResult,
} from "./vault.ts"

// Watcher domain object (Service for file sync)
export { createWatcher } from "./watcher.ts"

export type { Watcher, WatcherOptions } from "./watcher.ts"

// Database rules (add= materialization)
export {
  evaluateAllRules,
  evaluateNodeRules,
  getPendingWriteBack,
  setBulkMode,
  isBulkMode,
  onNodeChanged,
  onNodeDeleted,
} from "./db-rules.ts"

export type { RulesProgress } from "./db-rules.ts"

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

// Path utilities for filesystem-based node resolution
export {
  isExplicitPath,
  findKmRootFromPath,
  resolveFsPath,
  getEffectiveRoot,
  resolvePathArg,
} from "./path-utils.ts"

export type { PathResolution, ResolvedPathArg } from "./path-utils.ts"

// Watch and sync (merged from @km/watch)
export {
  FileSystemWatcher,
  scanDirectory,
  scanDirectoryRecursive,
  SyncManager,
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
  DEFAULT_IGNORE_PATTERNS,
  HIDDEN_FILE_PATTERN,
  readGitignore,
  readKmignore,
  readObsidianIgnore,
  getIgnorePatterns,
  matchesPattern,
  shouldIgnore,
  isHiddenFile,
  WriteQueue,
  shouldApplyToFs,
} from "./watch/index.ts"

export type {
  WatcherConfig,
  FileChange,
  SyncConfig,
  ReconcileOp,
  PendingWrite,
  WriteQueueConfig,
  WatcherStatus,
  WatcherState,
  WatcherInterface,
  SyncData,
  SyncFromFsResult,
} from "./watch/index.ts"

// Event emission (moved from @km/core)
export {
  emit,
  runWithKmDir,
  setEventHub,
  setFsSync,
  getEventsPath,
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeMoved,
  emitNodeDeleted,
  emitTaskClaimed,
  emitTaskReleased,
  emitTaskCompleted,
  emitSessionStarted,
  emitSessionMessage,
  emitSessionToolCall,
  emitSessionEnded,
} from "./emit.ts"

// Recurrence utilities (moved from @km/core)
export { parseRRule, getNextOccurrence, naturalToRRule } from "./recurrence.ts"

// Configuration
export {
  loadConfig,
  clearConfigCache,
  getTuiConfig,
  getOriginalBeadsConfig,
  getOriginalBeadsConfigPath,
} from "./config.ts"

export type {
  KmConfig,
  BeadsConfig,
  TuiConfig,
  OriginalBeadsConfig,
} from "./config.ts"

// Config domain object (preferred API)
export { loadConfigObject } from "./config-object.ts"

export type { Config } from "./config-object.ts"

// Repo domain object - PREFERRED API for new code
// Composed: DataStore + FileTree + Config
// See: docs/adr/002-domain-objects-refactor.md
export { createRepo, createBareRepo, createTestRepo } from "./repo.ts"

export type {
  Repo,
  CreateRepoOptions,
  CreateBareRepoOptions,
  SyncResult as RepoSyncResult,
  SyncConflict,
  RepoStats,
} from "./repo.ts"

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
  createMockWatcher,
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
  MockWatcher,
  BoardFixture,
} from "./testing/index.ts"
