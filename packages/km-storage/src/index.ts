// Task — domain interface (namespace) for task-shaped KNodes. See task.ts.
export { Task } from "./task.ts"
export type { TaskTreeEntry, ShortIdResolver } from "./task.ts"

// Database schema (for testing with in-memory databases)
export { SCHEMA, migrateSchema, migrateData, applyConnectionPragmas, DATA_VERSION } from "./db/schema.ts"

// Session state (~/.km/session.db) — user-local, cross-repo tier per
// hub/km/storage-architecture.md §5.3. Undo, last cursor, recent, collapsed,
// pane layouts — anything that must survive `.km/state.db` rebuilds.
export {
  openSessionDb,
  resolveSessionDbPath,
  SESSION_SCHEMA,
  SESSION_SCHEMA_VERSION,
  readSessionMeta,
  writeSessionMeta,
  getSessionCursor,
  setSessionCursor,
  clearSessionCursor,
  addSessionRecent,
  getSessionRecent,
  trimSessionRecent,
  setCollapsed,
  isCollapsed,
  getCollapsedSet,
  savePaneLayout,
  loadPaneLayout,
  listPaneLayouts,
  deletePaneLayout,
  appendUndo,
  getUndoEntries,
  truncateUndoUpTo,
  clearSessionForRepo,
  migrateSessionStateFromStateDb,
} from "./session/session-db.ts"

export type {
  OpenSessionDbOptions,
  SessionCursor,
  SessionRecentEntry,
  SessionPaneLayout,
  SessionUndoEntry,
  SessionMigrationCounts,
} from "./session/session-db.ts"

// Link resolver (for benchmarks and testing)
export { createLinkResolver, type LinkResolver } from "./markdown/link-resolver.ts"

// Typed graph-edge API (internal — used by `km task dep`, future `km link`).
// See `src/links/edges.ts` for the dispatcher rationale (props-based today,
// switches to typed-rel `links` table when @km/storage/link-rel-taxonomy lands).
export { addLink as addGraphEdge, removeLink as removeGraphEdge, getLinks as getGraphEdges } from "./links/edges.ts"
export type { LinkRel as GraphEdgeRel, GraphEdge, GetLinksOptions as GetGraphEdgesOptions } from "./links/edges.ts"

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

// Database operations (db-accepting functions for internal use)
// All application code should use Repo domain object (createRepo) instead
export {
  // Query operations (require Database parameter)
  getNode,
  getNodeByIdPrefix,
  getTaskByIdPrefix,
  getNodeByPath,
  getNodeByInode,
  getNodeByContentHashUnderParent,
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
  materializeEffectivePaths,
  dropEffectivePaths,
  // Link operations (canonical 3-column schema — see docs/design/model/klink.md)
  addLink,
  addLinks,
  removeLinksFromSource,
  getOutgoingLinks,
  getBacklinksByHref,
  getBacklinksForNode,
  computeHrefsForNode,
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

export type { NodeStore, Store, Observable, Replicated } from "./store/store.ts"

// Unified repo loading
export {
  readEventsAfter,
  readLastEventSeq,
  writeLastEventSeq,
  resolveLinksAsync,
  parseDeferredAsync,
  parseStubFile,
  ensureRepoRootNode,
} from "./repo/loader.ts"

export type { LoadResult, LoadOptions, PendingLink, DeferredFile, StepYield } from "./repo/loader.ts"
export type { LoadError as RepoLoaderError } from "./repo/loader.ts"

// Inbound anchor resolution for collapsed files (C4)
export { resolveAnchor } from "./links/resolve-anchor.ts"

export type { AnchorResolution, AnchorResolutionKind, ResolveAnchorInput } from "./links/resolve-anchor.ts"

export { resolveInboundAnchors } from "./markdown/resolve-inbound-anchors.ts"

export type { ResolveInboundAnchorsOptions, ResolveInboundAnchorsResult } from "./markdown/resolve-inbound-anchors.ts"

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

// Events-table retention & store health diagnostics
export { backupViaVacuumInto, retainEvents, vacuumDb, getStoreHealth } from "./change-compaction.ts"

export type { RetainEventsOptions, RetainEventsResult, StoreHealth } from "./change-compaction.ts"

// km-fast-md.6: Worker pool for parallel parsing
// km-disposable.3: Service factory pattern
export { createParsePool } from "./markdown/parse-pool.ts"

export type { ParsePoolService, ParseResult as PoolParseResult, ParsePoolOptions } from "./markdown/parse-pool.ts"

// Watcher domain object (Service for file sync)
export { createWatcher } from "./watcher.ts"

export type { Watcher, WatcherOptions } from "./watcher.ts"

// Database rules (add= materialization)
export {
  evaluateAllRules,
  evaluateNodeRules,
  evaluateAffectedRules,
  onNodeChanged,
  onNodeDeleted,
  createRuleContext,
  extractRuleSignature,
  extractChangedAttrs,
  ruleIsAffected,
} from "./db/rules.ts"

export type { RulesProgress, RuleContext, RuleSignature, ChangedAttrSet } from "./db/rules.ts"

// Query language
export { parseQuery, resolveDateQuery, QueryFieldError } from "./query.ts"

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
  buildNodeLookup,
} from "@km/markdown"

export type { ParseResult, ParseWarning, NodeLookup } from "@km/markdown"

// Markdown processing utilities (shared between loading and syncing)
export {
  processMarkdownFile,
  toNodeEvents,
  toPendingLinks,
  toResolvedLinks,
  getFileNode,
} from "./markdown/processing.ts"

export type { ProcessedMarkdown, ResolvedLink, WikilinkRef } from "./markdown/processing.ts"

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

// Recurrence utilities (moved from @km/core)
export { parseRRule, getNextOccurrence, naturalToRRule } from "./recurrence.ts"

// Configuration
export {
  loadConfig,
  clearConfigCache,
  getBeadsConfig,
  getOriginalBeadsConfig,
  getFolderIndexConfig,
  getCollapseParseConfig,
} from "./config.ts"

export type { KmConfig, BeadsConfig, TuiConfig, FolderIndexConfig, OriginalBeadsConfig } from "./config.ts"

// Collapse-parse matcher (folder-level opaque-stub rule)
export { createCollapseParseMatcher, createNullCollapseParseMatcher } from "./markdown/collapse-parse.ts"

export type { CollapseParseMatcher } from "./markdown/collapse-parse.ts"

// Index file writer (pure functions for folder index files)
export { buildIndexContent, generateIndexFileContent, indexFileName } from "./index-file-writer.ts"

// Config domain object (preferred API)
export { loadConfigObject } from "./config-object.ts"

export type { Config } from "./config-object.ts"

// Federation scaffolding — per-repo RepoId, workspace mount registry, km: URI
// resolution. See hub/km/storage-architecture.md §5. Phase A: parse + resolve
// only; multi-repo Repo lifecycle is a later bead.
export { readOrMintRepoId, mintRepoId, writeRepoConfigYaml, CONFIG_YAML_NAME } from "./federation/repo-id.ts"

export {
  loadWorkspace,
  buildWorkspace,
  readMountsFromToml,
  resolveWorkspaceTomlPath,
  WORKSPACE_TOML_NAME,
} from "./federation/workspace.ts"

export type { Workspace, WorkspaceMount, WorkspaceUriResolution, LoadWorkspaceOptions } from "./federation/workspace.ts"

export { parseKmUri } from "./federation/km-uri.ts"

export type { ParsedKmUri } from "./federation/km-uri.ts"

// Commit taxonomy — types for the reactive store layer
export { ResourceState, computeDelta, mergeDeltas, withLinkDelta } from "./store/commit-types.ts"

export type {
  CommitMeta,
  CommitSource,
  CommitResult,
  RepoDelta,
  LinkDelta,
  ChangeEnvelope,
} from "./store/commit-types.ts"

// Reactive signals layer — per-node signals driven by RepoDelta
export { withReactive } from "./store/reactive.ts"

export type { WithReactiveOptions } from "./store/reactive.ts"

// Sibling order persistence (survives state.db rebuilds)
export { readSiblingOrder, writeSiblingOrder, applySiblingOrder } from "./sibling-order.ts"

export type { SiblingOrderMap } from "./sibling-order.ts"

export type { Reactive, ReadonlySignal } from "./store/reactive.ts"

// Emitter domain object - owns change emission lifecycle
export { createEmitter, emitNodeCreated, emitNodeUpdated, emitNodeDeleted } from "./emitter.ts"

export type { Emitter, EmitterOptions, EmitOptions, ChangeHub } from "./emitter.ts"

// Repo domain object - PREFERRED API for new code
// Composed: DataStore + FileTree + Config
// See: docs/00-principles.md
export { createRepo, createBareRepo, createTestRepo, createTestEnvRepo, IncompleteDatabase } from "./repo/repo.ts"

// Internal-protocol emitter accessor — `Repo.emitter` is intentionally
// not on the public surface. Use this to wire sync (`withSync`/`withFsWriter`).
// See repo/repo-emitters.ts for the full rationale.
export { getRepoEmitter, hasRepoEmitter } from "./repo/repo-emitters.ts"

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
  TryClaimResult,
} from "./repo/repo.ts"

// Move/rename with reference rewriting (canonical primitive)
export { rewriteWikilinks, rewriteBareIdMentions } from "./repo/move-with-refs.ts"

export type { MoveSpec, MoveOptions, MoveResult, MoveProgress } from "./repo/move-with-refs.ts"

// Universal reference resolver — id / path / alias ladder.
// See repo/resolve-ref.ts for full semantics.
export { resolveRef } from "./repo/resolve-ref.ts"

// Short-id resolution with explicit ambiguity surface.
// CLI surfaces use this when they need "did you mean X or Y?" instead of
// the silent-null behaviour of resolveNode.
export { resolveShortId, formatAmbiguityError } from "./repo/resolve-short-id.ts"

export type { ShortIdResolution } from "./repo/resolve-short-id.ts"

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
  seedFileNode,
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
  SeedFileNodeOptions,
  SeededFileNode,
} from "./testing/index.ts"
