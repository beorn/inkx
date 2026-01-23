// Database operations
export {
  getDbPath,
  getDb,
  closeDb,
  setDb,
  isMemoryMode,
  resetDb,
  applyEvent,
  getNode,
  getNodeByIdPrefix,
  getTaskByIdPrefix,
  getNodeByPath,
  getNodesUnderPath,
  getFileWithChildren,
  getNodeContentHash,
  findFileByName,
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
  addLink,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinks,
  getBacklinksByName,
  resolveLinks,
  dbApplyEvent,
  // Store-layer node operations (handles memory/disk mode automatically)
  moveNode,
  updateNode,
  deleteNode,
  addNode,
} from "./db.ts";

export type { Link, SearchResult } from "./db.ts";

// Store abstraction
export {
  DiskStore,
  MemoryStore,
  initStore,
  getStore,
  closeStore,
} from "./store.ts";

export type { NodeStore } from "./store.ts";

// State rebuild (generators - use runWithProgress or for...of to consume)
export {
  readEvents,
  rebuildState,
  needsRebuild,
  syncState,
  fullReset,
  ensureState,
  freshStart,
  runWithProgress,
  runGenerator,
} from "./rebuild.ts";

export type { RebuildResult, SyncResult } from "./rebuild.ts";

// Database rules (add= materialization)
export {
  evaluateAllRules,
  evaluateNodeRules,
  getPendingWriteBack,
  setBulkMode,
  isBulkMode,
  onNodeChanged,
  onNodeDeleted,
} from "./db-rules.ts";

export type { RulesProgress } from "./db-rules.ts";

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
} from "./cas.ts";

// Query language
export {
  parseQuery,
  executeQuery,
  queryTasks,
  queryNodes,
  resolveDateQuery,
} from "./query.ts";

export type { QueryAST, QueryCondition, QueryRef, DateRange } from "./query.ts";

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
} from "@km/markdown";

export type { ParseResult, ParseWarning } from "@km/markdown";

// Path utilities for filesystem-based node resolution
export {
  isExplicitPath,
  findKmRootFromPath,
  resolveFsPath,
  getEffectiveRoot,
  resolvePathArg,
} from "./path-utils.ts";

export type { PathResolution, ResolvedPathArg } from "./path-utils.ts";

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
} from "./watch/index.ts";

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
} from "./watch/index.ts";

// Event emission (moved from @km/core)
export {
  emit,
  setKmDir,
  getKmDir,
  setEventHub,
  setDatabase,
  setFsSync,
  clearDatabase,
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
} from "./emit.ts";

// Recurrence utilities (moved from @km/core)
export { parseRRule, getNextOccurrence, naturalToRRule } from "./recurrence.ts";

// Configuration
export {
  loadConfig,
  getConfigPath,
  clearConfigCache,
  getBeadsConfig,
  getTuiConfig,
  getOriginalBeadsConfig,
  getOriginalBeadsConfigPath,
} from "./config.ts";

export type {
  KmConfig,
  BeadsConfig,
  TuiConfig,
  OriginalBeadsConfig,
} from "./config.ts";
