/**
 * Unified Repo Loading
 *
 * THE single entry point for loading repos in both memory and disk modes.
 * This replaces the fragmented ensureState/rebuildState/syncState functions
 * with a unified generator-based pipeline.
 *
 * Phases:
 * - discover: Count items (files for memory, events for disk)
 * - parse: Generate events from filesystem (memory mode only)
 * - apply: Insert/update nodes in SQLite
 * - resolve: Resolve wikilinks (memory mode only - disk resolves during apply)
 * - materialize: Evaluate add= rules
 */

import { createLogger } from "loggily"
import { Database } from "bun:sqlite"
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, openSync, readSync, closeSync } from "fs"
import { join, dirname, basename, isAbsolute } from "path"
import {
  toRelativeFsPath,
  findKmRootFromPath,
  createIgnoreMatcher,
  shouldIgnore,
  isHiddenFile,
  generatePathBasedId,
} from "@km/fs-mount"
import type { Change } from "@km/core"
import { SCHEMA } from "../db/schema.ts"
import { applyChangeWithDb } from "../db/changes.ts"
import type { Emitter } from "../emitter.ts"
import { evaluateAllRules, createRuleContext } from "../db/rules.ts"
import { MemoryStore, type NodeStore } from "../store/store.ts"
import { INSERT_NODE_SQL } from "../db/insert.ts"
import { decomposeChangeItem } from "../item-helpers.ts"

// Import extracted modules
import { discoverFiles, type UnexploredDir, type CollapsedExtraction } from "../discovery.ts"
import { addCollapsedFileLinks, removeCollapsedFileLinks } from "../db/collapsed-file-links.ts"
import { resolveLinksGen, resolveLinksAsync as resolveLinksAsyncImpl } from "../markdown/link-resolution.ts"
import {
  parseDeferredAsync as parseDeferredAsyncImpl,
  parseStubFile as parseStubFileImpl,
} from "../markdown/deferred.ts"
import { readSiblingOrder, applySiblingOrder } from "../sibling-order.ts"
import {
  createCollapseParseMatcher,
  createNullCollapseParseMatcher,
  type CollapseParseMatcher,
} from "../markdown/collapse-parse.ts"
import { extractLinks } from "../markdown/extract-links.ts"
import { resolveInboundAnchors } from "../markdown/resolve-inbound-anchors.ts"
import { getCollapseParseConfig } from "../config.ts"

const log = createLogger("km:storage:repo-loader")

// ============================================================================
// TYPES
// ============================================================================

/**
 * Progress yield type for step generators.
 * - String: creates new sub-step with that label
 * - Object { current, total }: updates progress on current sub-step
 * - Object { declare: [...] }: declare all sub-steps upfront (show as pending)
 */
export type StepYield = string | { current?: number; total?: number } | { declare: string[] }

/** Result from loadRepo */
export interface LoadResult {
  mode: "memory" | "disk"
  /** Root path of the repo */
  rootPath: string
  nodeCount: number
  linkCount: number
  errors: LoadError[]
  duration: number
  /** Pending links for deferred resolution (only present if skipLinkResolution was true) */
  pendingLinks?: PendingLink[]
  /** Files pending deferred parsing (only present if discoverOnly was true) */
  deferredFiles?: DeferredFile[]
  /** Directories not explored due to preloadDepth limit */
  unexploredDirs?: UnexploredDir[]
  /** The NodeStore instance for querying/mutating nodes */
  store: NodeStore
  /** The database instance used for loading (for DI/testing) */
  database: Database
}

/** Error during loading */
export interface LoadError {
  phase: "discover" | "parse" | "apply" | "resolve" | "materialize"
  path?: string
  message: string
}

/** Options for loadRepo */
export interface LoadOptions {
  /** Search for .km in parent directories (default: true) */
  searchAncestors?: boolean
  /** Force full rebuild even if state exists (default: false) */
  force?: boolean
  /** Skip link resolution for faster startup (default: false) */
  skipLinkResolution?: boolean
  /**
   * km-fast-md.7: Discover-only mode for instant board render.
   * Creates stub nodes without parsing markdown content.
   * Call parseDeferredAsync() afterward to fill in content.
   */
  discoverOnly?: boolean
  /**
   * Database to use instead of singleton (ADR-002).
   * When provided, avoids getDb() and uses this database directly.
   */
  db?: Database
  /**
   * Explicit mode override. When set, bypasses .km directory detection.
   * - "memory": Scan filesystem, don't read changes.jsonl
   * - "disk": Read from changes.jsonl
   */
  mode?: "memory" | "disk"
  /**
   * Maximum directory depth to eagerly load during discovery.
   * Directories beyond this depth are recorded as unexplored.
   * Default: Infinity (load everything).
   */
  preloadDepth?: number
  /**
   * Explicit collapse-parse matcher. When omitted, the loader reads the
   * `inactive:` glob list from `.km/config.yaml` and constructs one.
   * Pass an explicit matcher in tests to avoid touching disk.
   */
  collapseMatcher?: CollapseParseMatcher
  /**
   * km-storage.lazy-hydration: when true, skip filesystem reconciliation on
   * the critical path. Caller is responsible for invoking
   * `reconcileFilesystemAsync` post-first-frame to catch externally added /
   * removed files. Also set via `KM_LAZY_HYDRATE=1`.
   *
   * Default: false (eager reconcile preserves pre-lazy behavior).
   */
  lazyHydrate?: boolean
  /**
   * Emitter used to route replay changes through the op surface.
   *
   * When provided, `applyChanges` commits each change via
   * `emitter.commit({..., skipPersist: true, skipBroadcast: true, source: "fs-import"})`
   * instead of calling `applyChangeWithDb` / `INSERT_NODE_SQL` directly.
   *
   * `commit()` (as opposed to `apply()`) structurally bypasses `onApply`
   * subscribers, preventing replay from writing back to the filesystem —
   * the journal IS the source of truth during replay, so re-projecting
   * would create an echo loop.
   *
   * `skipPersist: true` avoids double-journaling: changes read from
   * `changes.jsonl` must not be re-appended to the same file.
   *
   * If omitted (e.g. tests, memory mode), `applyChanges` falls back to
   * direct SQL inserts — preserves the pre-op-surface behavior.
   */
  emitter?: Emitter
}

/** Files pending deferred parsing (for discoverOnly mode) */
export interface DeferredFile {
  nodeId: string
  fsPath: string
}

/** Pending link for deferred resolution */
export interface PendingLink {
  nodeId: string
  link: {
    target: string
    section?: string
    blockId?: string
    alias?: string
    embedded?: boolean
  }
  /** Canonical href (set by the parser in Phase 2+). May be absent on
   *  legacy callers; link-resolution falls back to normalizeLinkHref. */
  href?: string
  relationship?: string
}

// ============================================================================
// MAIN LOAD FUNCTION
// ============================================================================

/**
 * THE unified repo loading function.
 * Handles both memory and disk modes with a shared pipeline.
 *
 * @deprecated Use createRepo() instead for a proper domain object with
 * encapsulated state. This function uses global singletons.
 *
 * @param rootPath - Directory to load (default: cwd)
 * @param options - Loading options
 * @yields Progress info for each phase
 * @returns Load result with stats and errors
 */
export function* loadRepo(rootPath?: string, options?: LoadOptions): Generator<StepYield, LoadResult, unknown> {
  using loadSpan = log.span("load-repo")
  const start = Date.now()
  const errors: LoadError[] = []

  // 1. Resolve path and detect mode
  const searchAncestors = options?.searchAncestors ?? true
  const { repoRoot, kmDir } = resolveRepoRoot(rootPath, searchAncestors)
  // Explicit mode overrides auto-detection based on .km directory
  const mode = options?.mode ?? (kmDir ? "disk" : "memory")

  log.debug?.(`loadRepo repoRoot=${repoRoot} mode=${mode}`)

  // Declare all sub-steps upfront so they appear as pending
  const skipLinks = options?.skipLinkResolution ?? false
  const discoverOnly = options?.discoverOnly ?? false

  if (mode === "memory") {
    if (discoverOnly) {
      yield { declare: ["Discovering files", "Applying changes"] }
    } else if (skipLinks) {
      yield {
        declare: ["Discovering files", "Parsing markdown", "Applying changes", "Evaluating rules"],
      }
    } else {
      yield {
        declare: ["Discovering files", "Parsing markdown", "Applying changes", "Resolving links", "Evaluating rules"],
      }
    }
  } else {
    if (discoverOnly) {
      yield { declare: ["Reading events", "Applying changes", "Reconciling filesystem"] }
    } else {
      yield {
        declare: ["Reading events", "Applying changes", "Reconciling filesystem", "Evaluating rules"],
      }
    }
  }

  // 2. Set up database
  const db = setupDatabase(options)

  // 2a. Ensure repo root node exists (discovery needs it for parent_id)
  ensureRepoRootNode(db, repoRoot)

  // 2b. Resolve collapse-parse matcher (explicit option > .km/config.yaml).
  // Built once and shared by discovery + reconciliation.
  const collapseMatcher = resolveCollapseMatcher(repoRoot, options?.collapseMatcher)

  // 3. Mode-specific change source
  using _discoverSpan = loadSpan.span(`discover-${mode}`)
  const source: ChangeSource =
    mode === "memory"
      ? yield* discoverMemoryMode(repoRoot, errors, db, discoverOnly, options?.preloadDepth, collapseMatcher)
      : yield* discoverFromChanges(db, kmDir ?? "", options?.force ?? false, errors)
  _discoverSpan.end()

  // 4. Shared pipeline (normalizes parent_id: null → ".")
  //
  // Replay goes through emitter.commit() (when an emitter is provided) so
  // the op surface stays uniform: same DB side-effect as fresh commits, but
  // skipPersist (no double-journal) and no onApply (no echo to filesystem).
  // See `applyChanges` for rationale.
  using _applySpan = loadSpan.span("apply-changes-1")
  yield* applyChanges(db, source.changes, errors, repoRoot, options?.emitter)
  _applySpan.end()

  // 4a. Persist collapsed-file link edges. These target stub nodes that were
  // just inserted by applyChanges, so we do this after the main pipeline to
  // avoid foreign-key-like ordering issues (no actual FK, but the host must
  // exist for the rows to make sense).
  writeCollapsedExtractions(db, source.collapsedExtractions)

  // 4b. Disk mode: reconcile filesystem to detect externally added/removed files.
  //
  // KM_LAZY_HYDRATE=1: skip reconciliation on the critical path. The watcher
  // (when enabled) will detect any external changes on its first scan, and
  // `reconcileFilesystem` can be invoked post-first-frame if needed.
  //
  // Default (KM_LAZY_HYDRATE!=1): eager reconcile preserves pre-lazy behavior.
  let reconcileDeferredFiles: DeferredFile[] = []
  const lazyHydrate = options?.lazyHydrate ?? process.env.KM_LAZY_HYDRATE === "1"
  if (mode === "disk" && !lazyHydrate) {
    using _reconcileSpan = loadSpan.span("reconcile-filesystem")
    const reconcileResult = yield* reconcileFilesystem(db, repoRoot, errors, collapseMatcher)
    if (reconcileResult.changes.length > 0) {
      yield* applyChanges(db, reconcileResult.changes, errors, repoRoot, options?.emitter)
    }
    writeCollapsedExtractions(db, reconcileResult.collapsedExtractions)
    reconcileDeferredFiles = reconcileResult.deferredFiles
  }

  // 5. Resolve links and evaluate rules
  let linkCount = 0
  let returnPendingLinks: PendingLink[] | undefined
  let returnDeferredFiles: DeferredFile[] | undefined

  if (discoverOnly) {
    // Merge discovery stubs with reconciliation stubs
    const discoveryDeferred = source.deferredFiles ?? []
    returnDeferredFiles =
      reconcileDeferredFiles.length > 0 ? [...discoveryDeferred, ...reconcileDeferredFiles] : discoveryDeferred

    // Re-queue existing unparsed stubs from prior sessions.
    // In disk mode, state.db persists between runs. If a prior discoverOnly session
    // created stubs but background parsing didn't complete (process killed, WAL not
    // checkpointed), those stubs survive with parsed=0. Reconciliation won't re-queue
    // them because the files already exist in the DB. Without this, zooming out shows
    // empty sibling cards forever.
    //
    // Collapse-parse: skip stubs tagged `_collapsed: true`. They're intentionally
    // opaque until the user navigates in; re-queuing them would defeat the 89%
    // node-count reduction this feature exists to provide.
    const alreadyQueued = new Set(returnDeferredFiles.map((f) => f.nodeId))
    const unparsedStubs = db
      .prepare(
        "SELECT id, fs_path FROM nodes WHERE parsed = 0 AND fs_path IS NOT NULL AND data LIKE '%_stub%' AND (data NOT LIKE '%_collapsed%')",
      )
      .all() as { id: string; fs_path: string }[]
    let requeuedCount = 0
    for (const stub of unparsedStubs) {
      if (!alreadyQueued.has(stub.id)) {
        returnDeferredFiles.push({ nodeId: stub.id, fsPath: join(repoRoot, stub.fs_path) })
        requeuedCount++
      }
    }
    if (requeuedCount > 0) {
      log.debug?.(`re-queued ${requeuedCount} unparsed stubs from prior sessions`)
    }

    log.debug?.(`discover-only mode, ${returnDeferredFiles?.length ?? 0} files deferred`)
  } else {
    // Even in full mode, reconciliation may find new files that need parsing.
    // Also detect unparsed stubs replayed from changes.jsonl — these occur when
    // a prior discoverOnly session wrote stubs to the journal and state.db was
    // later deleted. The rebuild replays the stubs but doesn't re-parse them,
    // leaving nodes with title=filename_stem instead of the H1-merged title.
    const allDeferred = [...reconcileDeferredFiles]

    // Re-queue unparsed stubs from the replayed changes (same logic as discoverOnly path).
    // Collapse-parse: exclude `_collapsed` stubs — they stay opaque until navigation.
    const alreadyQueued = new Set(allDeferred.map((f) => f.nodeId))
    const unparsedStubs = db
      .prepare(
        "SELECT id, fs_path FROM nodes WHERE parsed = 0 AND fs_path IS NOT NULL AND data LIKE '%_stub%' AND (data NOT LIKE '%_collapsed%')",
      )
      .all() as { id: string; fs_path: string }[]
    for (const stub of unparsedStubs) {
      if (!alreadyQueued.has(stub.id)) {
        allDeferred.push({ nodeId: stub.id, fsPath: join(repoRoot, stub.fs_path) })
      }
    }

    if (allDeferred.length > 0) {
      returnDeferredFiles = allDeferred
      log.debug?.(
        `${allDeferred.length} files need deferred parsing (${reconcileDeferredFiles.length} from reconciliation, ${unparsedStubs.length} unparsed stubs)`,
      )
    }

    if (source.pendingLinks.length > 0) {
      if (skipLinks) {
        returnPendingLinks = source.pendingLinks
        log.debug?.(`skipping link resolution, ${source.pendingLinks.length} links deferred`)
      } else {
        linkCount = yield* resolveLinksGen(db, source.pendingLinks, errors)
      }
    }

    yield* materializeRules(db)
  }

  // 5b. Inbound anchor resolution for collapsed files (C4).
  //
  // Must run AFTER outbound link rows are written (both parsed and
  // collapsed) because it consults those tables to determine which anchors
  // are actually referenced. Skipped in discoverOnly mode — outbound link
  // extraction for parsed files hasn't happened yet; deferredParseAsync's
  // completion handler is the natural place to re-run this pass (future).
  //
  // Off-by-default when no files are collapsed (the function returns
  // immediately in that case).
  if (!discoverOnly) {
    try {
      const anchorResult = resolveInboundAnchors(db, { repoRoot })
      if (anchorResult.filesScanned > 0) {
        log.debug?.(
          `inbound anchors: ${anchorResult.anchorsWritten} rows across ${anchorResult.filesScanned} collapsed files`,
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ phase: "resolve", message: `inbound anchor resolution failed: ${message}` })
    }
  }

  // 6. Finalize
  const nodeCount = (db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }).count

  const duration = Date.now() - start
  log.debug?.(`loadRepo complete mode=${mode} nodeCount=${nodeCount} linkCount=${linkCount} duration=${duration}`)

  const store: NodeStore = new MemoryStore(repoRoot, {
    inject: { database: db },
  })

  return {
    mode,
    rootPath: repoRoot,
    nodeCount,
    linkCount,
    errors,
    duration,
    pendingLinks: returnPendingLinks,
    deferredFiles: returnDeferredFiles,
    unexploredDirs: source.unexploredDirs,
    store,
    database: db,
  }
}

// ============================================================================
// RE-EXPORTS (for backward compatibility)
// ============================================================================

/**
 * Resolve pending links asynchronously (after board renders).
 * Re-exported from link-resolution module.
 */
export const resolveLinksAsync = resolveLinksAsyncImpl

/**
 * Parse deferred files in background after board renders.
 * Re-exported from deferred-parsing module.
 */
export const parseDeferredAsync = parseDeferredAsyncImpl

/**
 * Parse a single stub file synchronously.
 * Re-exported from deferred-parsing module.
 */
export const parseStubFile = parseStubFileImpl

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface ChangeSource {
  changes: Change[]
  pendingLinks: PendingLink[]
  deferredFiles?: DeferredFile[]
  unexploredDirs?: UnexploredDir[]
  /**
   * Link edges extracted from collapsed files. Written to
   * `collapsed_file_links` after the stub nodes have been applied.
   */
  collapsedExtractions?: CollapsedExtraction[]
}

// ============================================================================
// PATH RESOLUTION
// ============================================================================

function resolveRepoRoot(
  rootPath: string | undefined,
  searchAncestors: boolean,
): { repoRoot: string; kmDir: string | null } {
  const path = rootPath ?? process.cwd()

  if (searchAncestors) {
    const kmDir = findKmRootFromPath(path)
    if (kmDir) {
      return { repoRoot: dirname(kmDir), kmDir }
    }
  } else {
    const kmDir = join(path, ".km")
    if (existsSync(kmDir) && statSync(kmDir).isDirectory()) {
      return { repoRoot: path, kmDir }
    }
  }

  return { repoRoot: path, kmDir: null }
}

// ============================================================================
// DATABASE SETUP
// ============================================================================

function setupDatabase(options?: LoadOptions): Database {
  if (options?.db) {
    const db = options.db
    if (options?.force) {
      db.run(`
        DROP TABLE IF EXISTS nodes_fts;
        DROP TABLE IF EXISTS nodes;
        DROP TABLE IF EXISTS links;
        DROP TABLE IF EXISTS meta;
      `)
      db.run(SCHEMA)
    }
    return db
  }

  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

// ============================================================================
// REPO ROOT NODE
// ============================================================================

/**
 * Ensure the repo root node (id=".") exists in the database.
 * Creates it if missing; no-op if already present.
 */
export function ensureRepoRootNode(db: Database, repoRoot: string): void {
  const existing = db.prepare("SELECT id FROM nodes WHERE id = '.'").get() as { id: string } | undefined

  if (existing) return

  const now = Date.now()
  db.prepare(`
    INSERT INTO nodes (
      id, type, item, fstype, parent_id, parent_idx, fs_path, content, data,
      created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ".",
    "h",
    1,
    "folder",
    null,
    0,
    ".",
    basename(repoRoot),
    JSON.stringify({ name: basename(repoRoot), is_repo_root: true }),
    now,
    now,
    "",
  )
}

// ============================================================================
// MEMORY MODE DISCOVERY
// ============================================================================

/**
 * Dispatch to unified discovery module with appropriate mode.
 */
function* discoverMemoryMode(
  repoRoot: string,
  errors: LoadError[],
  db: Database,
  discoverOnly: boolean,
  preloadDepth?: number,
  collapseMatcher?: CollapseParseMatcher,
): Generator<StepYield, ChangeSource, unknown> {
  return yield* discoverFiles(repoRoot, db, {
    parseMode: discoverOnly ? "stub" : "full",
    errors,
    preloadDepth,
    collapseMatcher,
  })
}

/**
 * Resolve the collapse-parse matcher for a repo load.
 *
 * Precedence: explicit `options.collapseMatcher` > `.km/config.yaml` patterns
 * > disabled null matcher.
 */
function resolveCollapseMatcher(repoRoot: string, explicit: CollapseParseMatcher | undefined): CollapseParseMatcher {
  if (explicit) return explicit
  const { patterns } = getCollapseParseConfig(repoRoot)
  if (patterns.length === 0) return createNullCollapseParseMatcher()
  return createCollapseParseMatcher(patterns)
}

/**
 * Persist regex-extracted link edges for collapsed files. Delete-then-insert
 * per host so reruns idempotently refresh the rows. Runs inside a single
 * transaction for atomicity with the preceding applyChanges commit.
 *
 * No-op when collapsedExtractions is empty/absent (the common case when
 * no `inactive:` patterns are configured).
 */
function writeCollapsedExtractions(db: Database, extractions: readonly CollapsedExtraction[] | undefined): void {
  if (!extractions || extractions.length === 0) return
  const now = Date.now()
  db.run("BEGIN IMMEDIATE")
  try {
    for (const { hostId, extracted } of extractions) {
      removeCollapsedFileLinks(db, hostId)
      addCollapsedFileLinks(db, hostId, extracted, now)
    }
    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }
}

// ============================================================================
// CHANGE READING
// ============================================================================

/**
 * Parse changes.jsonl: dedup by id, warn on malformed lines, sort chronologically (ULID).
 * Returns empty array if file doesn't exist.
 */
/**
 * Parse changes.jsonl: dedup by id, warn on malformed lines, sort chronologically (ULID).
 * When `fromByteOffset` is provided, only reads the tail of the file from that position,
 * dramatically speeding up startup when most changes are already applied.
 * Returns empty array if file doesn't exist.
 */
function parseChangesFile(
  kmDir: string,
  caller: string,
  fromByteOffset?: number,
): { changes: Change[]; byteLength: number } {
  const changesPath = join(kmDir, "changes.jsonl")

  if (!existsSync(changesPath)) {
    log.debug?.(`no changes file at ${changesPath}`)
    return { changes: [], byteLength: 0 }
  }

  const fileSize = statSync(changesPath).size

  // Fast path: if we have a byte offset and the file hasn't grown, no new changes
  if (fromByteOffset !== undefined && fromByteOffset >= fileSize) {
    log.debug?.(`${caller}: changes.jsonl unchanged (offset ${fromByteOffset} >= size ${fileSize})`)
    return { changes: [], byteLength: fileSize }
  }

  let content: string
  if (fromByteOffset !== undefined && fromByteOffset > 0) {
    // Read only the tail of the file from the byte offset
    const fd = openSync(changesPath, "r")
    try {
      const buf = Buffer.alloc(fileSize - fromByteOffset)
      readSync(fd, buf, 0, buf.length, fromByteOffset)
      content = buf.toString("utf-8")
      // If the offset landed mid-line, discard the partial first line
      const firstNewline = content.indexOf("\n")
      if (firstNewline > 0 && fromByteOffset > 0) {
        content = content.slice(firstNewline + 1)
      }
    } finally {
      closeSync(fd)
    }
    log.debug?.(`${caller}: reading tail of changes.jsonl from offset ${fromByteOffset} (${content.length} bytes)`)
  } else {
    content = readFileSync(changesPath, "utf-8")
  }

  const lines = content.split("\n").filter((line) => line.trim())

  log.debug?.(`reading ${lines.length} lines from changes.jsonl`)

  const changes: Change[] = []
  const seen = new Set<string>()
  let skippedCount = 0

  for (const line of lines) {
    try {
      const change = JSON.parse(line) as Change
      if (!seen.has(change.id)) {
        seen.add(change.id)
        changes.push(change)
      }
    } catch {
      skippedCount++
    }
  }

  if (skippedCount > 0) {
    log.warn?.(`${caller}: skipped ${skippedCount} malformed line(s) in changes.jsonl`)
  }

  // Sort by ULID (lexicographic = chronological)
  changes.sort((a, b) => a.id.localeCompare(b.id))

  log.debug?.(`read ${changes.length} changes`)
  return { changes, byteLength: fileSize }
}

export function readChanges(kmDir: string): Change[] {
  return parseChangesFile(kmDir, "readChanges").changes
}

// ============================================================================
// DISK MODE DISCOVERY
// ============================================================================

function* discoverFromChanges(
  db: Database,
  kmDir: string,
  force: boolean,
  _errors: LoadError[],
): Generator<StepYield, ChangeSource, unknown> {
  yield "Reading changes"

  // Read the byte offset cursor to skip already-applied changes
  const lastApplied = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event") as
    | { value: string }
    | undefined
  const lastOffset = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event_offset") as
    | { value: string }
    | undefined
  const byteOffset = !force && lastApplied?.value && lastOffset?.value ? Number(lastOffset.value) : undefined

  const { changes: allChanges, byteLength } = parseChangesFile(kmDir, "discoverFromChanges", byteOffset)

  // Filter to only new changes (unless force rebuild)
  let changes: Change[]
  if (force) {
    changes = allChanges
  } else {
    changes = lastApplied?.value ? allChanges.filter((e) => e.id > lastApplied.value) : allChanges
  }

  // Store the byte offset for next startup
  if (byteLength > 0) {
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["last_event_offset", String(byteLength)])
  }

  yield { current: changes.length, total: changes.length }
  log.debug?.(`discovered ${allChanges.length} changes (${changes.length} new)`)

  return { changes, pendingLinks: [] }
}

// ============================================================================
// FILESYSTEM RECONCILIATION (DISK MODE)
// ============================================================================

/**
 * After disk mode applies changes from changes.jsonl, scan the filesystem
 * to detect files present on disk but missing from the DB (externally added),
 * and files in the DB that no longer exist on disk (externally deleted).
 *
 * Generates node_created / node_deleted changes for the differences.
 */
interface ReconcileResult {
  changes: Change[]
  deferredFiles: DeferredFile[]
  collapsedExtractions: CollapsedExtraction[]
}

function* reconcileFilesystem(
  db: Database,
  repoRoot: string,
  errors: LoadError[],
  collapseMatcher: CollapseParseMatcher = createNullCollapseParseMatcher(),
): Generator<StepYield, ReconcileResult, unknown> {
  yield "Reconciling filesystem"

  const changes: Change[] = []
  const deferredFiles: DeferredFile[] = []
  const collapsedExtractions: CollapsedExtraction[] = []
  const now = Date.now()
  const ignoreMatcher = createIgnoreMatcher(repoRoot)
  const siblingOrders = readSiblingOrder(repoRoot)

  // Collect all fs_path values from DB (non-null, excluding repo root ".")
  const dbRows = db.prepare("SELECT id, fs_path FROM nodes WHERE fs_path IS NOT NULL AND fs_path != '.'").all() as {
    id: string
    fs_path: string
  }[]

  // Skip reconciliation if DB contains absolute paths (pre-migration database).
  // Let the health check in createRepo handle this case with IncompleteDatabase.
  if (dbRows.some((row) => isAbsolute(row.fs_path))) {
    log.debug?.("reconcileFilesystem: skipping — DB contains absolute fs_path values")
    yield { current: 0, total: 0 }
    return { changes, deferredFiles, collapsedExtractions }
  }

  const dbPathSet = new Set<string>()
  const dbPathToId = new Map<string, string>()
  for (const row of dbRows) {
    dbPathSet.add(row.fs_path)
    dbPathToId.set(row.fs_path, row.id)
  }

  // Walk the filesystem recursively, collecting all visible entries
  const fsPathSet = new Set<string>()

  let repoRealpath: string
  try {
    repoRealpath = realpathSync(repoRoot)
  } catch {
    errors.push({ phase: "discover", message: `Cannot resolve repo root: ${repoRoot}` })
    yield { current: 0, total: 0 }
    return { changes, deferredFiles, collapsedExtractions }
  }

  const visitedDirs = new Set<string>([repoRealpath])

  walkFilesystem(repoRoot, null)

  function walkFilesystem(dirPath: string, _parentRelPath: string | null): void {
    if (!existsSync(dirPath)) return

    let entries
    try {
      entries = readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      // Skip hidden files
      if (isHiddenFile(fullPath)) continue

      // Skip ignored entries
      if (shouldIgnore(fullPath, ignoreMatcher, repoRoot)) continue

      if (entry.isSymbolicLink()) {
        let targetStat
        try {
          targetStat = statSync(fullPath) // follows symlink
        } catch {
          continue // broken symlink
        }

        if (targetStat.isDirectory()) {
          // Check for symlink loops
          let real: string
          try {
            real = realpathSync(fullPath)
          } catch {
            continue
          }
          if (real.startsWith(repoRealpath + "/") || real === repoRealpath) continue
          if (visitedDirs.has(real)) continue
          visitedDirs.add(real)

          const relPath = toRelativeFsPath(repoRoot, fullPath)
          fsPathSet.add(relPath)
          walkFilesystem(fullPath, relPath)
        } else if (targetStat.isFile()) {
          const relPath = toRelativeFsPath(repoRoot, fullPath)
          fsPathSet.add(relPath)
        }
        continue
      }

      if (entry.isDirectory()) {
        let real: string
        try {
          real = realpathSync(fullPath)
        } catch {
          continue
        }
        if (visitedDirs.has(real)) continue
        visitedDirs.add(real)

        const relPath = toRelativeFsPath(repoRoot, fullPath)
        fsPathSet.add(relPath)
        walkFilesystem(fullPath, relPath)
        continue
      }

      if (entry.isFile()) {
        const relPath = toRelativeFsPath(repoRoot, fullPath)
        fsPathSet.add(relPath)
      }
    }
  }

  // Sort new paths so directories come before their children.
  // This ensures parent folders are processed (and trackable) before child files.
  const newPaths = [...fsPathSet].filter((p) => !dbPathSet.has(p)).sort()

  // Track newly created node IDs by relPath (for parent lookup of nested new entries)
  const newPathToId = new Map<string, string>()

  // Pre-compute sibling order indices per parent directory.
  // Group new paths by parent, then apply persisted order for each group.
  const siblingOrderCache = new Map<string, Map<string, number>>()
  function getSiblingOrderIdx(parentRelPath: string, entryName: string): number {
    let cached = siblingOrderCache.get(parentRelPath)
    if (!cached) {
      const persistedOrder = siblingOrders[parentRelPath]
      if (persistedOrder) {
        // Collect all new entries for this parent
        const siblingNames = newPaths.filter((p) => dirname(p) === parentRelPath).map((p) => basename(p))
        cached = applySiblingOrder(persistedOrder, siblingNames)
      } else {
        cached = new Map()
      }
      siblingOrderCache.set(parentRelPath, cached)
    }
    return cached.get(entryName) ?? 0
  }

  // Find files on disk but NOT in DB → generate node_created changes
  for (const relPath of newPaths) {
    const fullPath = join(repoRoot, relPath)
    const entryName = basename(relPath)
    const parentRelPath = dirname(relPath)

    // Determine parent ID: check DB first, then newly created nodes, fall back to repo root
    let parentId = "."
    if (parentRelPath !== ".") {
      const parentRow = db.prepare("SELECT id FROM nodes WHERE fs_path = ?").get(parentRelPath) as {
        id: string
      } | null
      if (parentRow) {
        parentId = parentRow.id
      } else if (newPathToId.has(parentRelPath)) {
        parentId = newPathToId.get(parentRelPath) ?? parentId
      }
    }

    // Look up persisted sibling order for the parent directory
    const orderIdx = getSiblingOrderIdx(parentRelPath, entryName)

    const nodeId = generatePathBasedId(repoRoot, fullPath)
    newPathToId.set(relPath, nodeId)

    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      changes.push({
        id: nodeId,
        type: "node_created",
        actor: "fs-reconcile",
        ts: now,
        data: {
          id: nodeId,
          type: "h",
          item: {},
          fstype: "folder",
          parent_id: parentId,
          parent_idx: orderIdx,
          fs_path: relPath,
          name: entryName,
          content: entryName,
        },
      })
    } else if (entryName.endsWith(".md") || entryName.endsWith(".txt")) {
      const isTxt = entryName.endsWith(".txt")
      const ext = isTxt ? /\.txt$/i : /\.md$/i
      const name = entryName.replace(ext, "")
      const isCollapsed = collapseMatcher.matches(relPath)
      const stubData: Record<string, unknown> = { _stub: true }
      if (isCollapsed) stubData._collapsed = true
      changes.push({
        id: nodeId,
        type: "node_created",
        actor: "fs-reconcile",
        ts: now,
        data: {
          id: nodeId,
          type: "h",
          item: {},
          fstype: isTxt ? "txtfile" : "mdfile",
          parent_id: parentId,
          parent_idx: orderIdx,
          fs_path: relPath,
          name,
          title: name,
          data: stubData,
        },
      })
      // Collapsed stubs stay unparsed until the user navigates in.
      if (!isCollapsed) {
        deferredFiles.push({ nodeId, fsPath: fullPath })
      } else if (!isTxt) {
        // Even though the file stays opaque, extract its outgoing link
        // edges so the backlink graph stays intact. Mirrors the same
        // handling in `discoverFiles` for memory-mode loads.
        try {
          const rawContent = readFileSync(fullPath, "utf-8")
          const extracted = extractLinks(rawContent)
          if (extracted.length > 0) {
            collapsedExtractions.push({ hostId: nodeId, extracted })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push({
            phase: "parse",
            path: fullPath,
            message: `collapse-parse link extraction failed: ${message}`,
          })
        }
      }
    } else {
      // Non-markdown file
      changes.push({
        id: nodeId,
        type: "node_created",
        actor: "fs-reconcile",
        ts: now,
        data: {
          id: nodeId,
          type: "h",
          item: {},
          fstype: "file",
          parent_id: parentId,
          parent_idx: orderIdx,
          fs_path: relPath,
          content: entryName,
        },
      })
    }
  }

  // Find files in DB but NOT on disk → generate node_deleted changes
  for (const [relPath, nodeId] of dbPathToId) {
    if (!fsPathSet.has(relPath)) {
      changes.push({
        id: `reconcile-del-${nodeId}`,
        type: "node_deleted",
        actor: "fs-reconcile",
        target: nodeId,
        ts: now,
        data: {},
      })
    }
  }

  log.debug?.(
    `reconcileFilesystem: ${changes.length} changes, ${deferredFiles.length} deferred, ${collapsedExtractions.length} collapsed-link extractions (fs=${fsPathSet.size} db=${dbPathSet.size})`,
  )
  yield { current: changes.length, total: changes.length }

  return { changes, deferredFiles, collapsedExtractions }
}

// ============================================================================
// STANDALONE RECONCILIATION (lazy-hydration path)
// ============================================================================

/**
 * Result from reconcileFilesystemPostFrame.
 */
export interface ReconcileFilesystemResult {
  /** Number of changes generated and applied */
  changes: number
  /** Files queued for deferred background parsing */
  deferredFiles: DeferredFile[]
  /** Errors encountered during reconciliation */
  errors: LoadError[]
  /** Wall-clock duration in ms */
  duration: number
}

/**
 * km-storage.lazy-hydration: background-friendly reconciliation + apply,
 * callable post-first-frame. Mirrors the work `loadRepo` does inline in the
 * eager path — detect externally added / removed files, generate
 * node_created/node_deleted changes, and apply them to the DB.
 *
 * Returns after applying. Caller is responsible for busting the repo's
 * children cache (`repo.touch()`) so subscribers re-query.
 *
 * When KM_LAZY_HYDRATE=1 and reconciliation is skipped on startup, call this
 * function on a microtask after the first frame renders. The cost is the same
 * as the eager path — this just moves it off the critical path.
 */
export function reconcileFilesystemPostFrame(
  db: Database,
  repoRoot: string,
  options?: { collapseMatcher?: CollapseParseMatcher; isAborted?: () => boolean; emitter?: Emitter },
): Promise<ReconcileFilesystemResult> {
  const start = Date.now()
  const errors: LoadError[] = []
  const collapseMatcher = options?.collapseMatcher ?? createNullCollapseParseMatcher()

  // Walk the generator synchronously (post-frame we no longer need incremental yields).
  const gen = reconcileFilesystem(db, repoRoot, errors, collapseMatcher)
  let result: ReconcileResult | undefined
  for (;;) {
    if (options?.isAborted?.()) {
      return Promise.resolve({ changes: 0, deferredFiles: [], errors, duration: Date.now() - start })
    }
    const step = gen.next()
    if (step.done) {
      result = step.value
      break
    }
  }

  let changesApplied = 0
  if (result && result.changes.length > 0) {
    // Run applyChanges generator to completion
    const applyGen = applyChanges(db, result.changes, errors, repoRoot, options?.emitter)
    for (;;) {
      const step = applyGen.next()
      if (step.done) break
    }
    writeCollapsedExtractions(db, result.collapsedExtractions)
    changesApplied = result.changes.length
  }

  return Promise.resolve({
    changes: changesApplied,
    deferredFiles: result?.deferredFiles ?? [],
    errors,
    duration: Date.now() - start,
  })
}

// ============================================================================
// SHARED PIPELINE
// ============================================================================

// oxlint-disable-next-line complexity/complexity -- 35/30: change type switch with validation guards, exhaustive by design
function* applyChanges(
  db: Database,
  changes: Change[],
  errors: LoadError[],
  repoRoot: string,
  emitter?: Emitter,
): Generator<StepYield, void, unknown> {
  yield "Applying changes"

  const total = changes.length
  if (total === 0) return

  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(INSERT_NODE_SQL)
    // Track node IDs whose creation failed — skip subsequent changes targeting them.
    // The change log is append-only and ordered; if a node_created fails, all
    // subsequent changes referencing that node would cascade-fail. Skipping them
    // avoids noise and preserves ordered-change semantics within a node's lifecycle.
    const failedNodeIds = new Set<string>()
    let unexpectedFailureCount = 0
    let skippedCascadeCount = 0

    for (const [i, change] of changes.entries()) {
      // Skip changes targeting a node whose creation failed (prevents cascade failures)
      const targetId = change.target ?? (change.data as Record<string, unknown>)?.id
      if (typeof targetId === "string" && failedNodeIds.has(targetId)) {
        log.debug?.(`skipping ${change.type} for failed node ${targetId.slice(-8)}`)
        skippedCascadeCount++
        continue
      }

      try {
        if (change.type === "node_created") {
          const data = change.data as Record<string, unknown>
          // Normalize fs_path: old changes may have absolute paths
          const rawFsPath = (data.fs_path as string) ?? null
          const fsPath = rawFsPath && isAbsolute(rawFsPath) ? toRelativeFsPath(repoRoot, rawFsPath) : rawFsPath
          // Normalize parent_id: null → "." (repo root)
          const parentId = (data.parent_id as string) ?? "."

          if (emitter) {
            // Route through the emitter for op-surface uniformity.
            // commit() bypasses onApply (so the fs-writer does NOT re-project
            // replayed changes back to the filesystem — the journal IS the
            // source during replay, re-projecting would echo-loop).
            // skipPersist: true avoids double-journaling (the change was just
            // read from changes.jsonl, re-appending would duplicate it).
            // source: "fs-import" is a defensive marker; commit() already
            // bypasses onApply but the tag aids observability.
            emitter.commit(
              {
                type: "node_created",
                actor: change.actor,
                data: { ...data, fs_path: fsPath, parent_id: parentId },
              },
              { db, skipPersist: true, skipBroadcast: true, source: "fs-import" },
            )
          } else {
            // Extract flat DB columns from nested item object (new format) or flat fields (legacy)
            const { listMarker, taskMarker, taskStatus } = decomposeChangeItem(data)
            // INSERT OR IGNORE: in disk mode, state.db may already have nodes
            // from km sync that changes.jsonl also references (last_event cursor
            // may not cover all changes). Matches applyChangeWithDb behavior.
            // Expected duplicates are silently ignored (no exception thrown).
            insertStmt.run(
              data.id as string,
              data.type as string,
              (data.fstype as string) ?? null,
              parentId,
              data.item ? 1 : 0,
              (data.embed_of as string) ?? null,
              (data.parent_idx as number) ?? 0,
              fsPath,
              (data.fs_dev as number) ?? null,
              (data.fs_ino as number) ?? null,
              (data.fs_mtime as number) ?? null,
              (data.fs_size as number) ?? null,
              (data.fs_content_hash as string) ?? null,
              (data.name as string) ?? null,
              (data.title as string) ?? null,
              (data.md_pos as number) ?? null,
              (data.md_line as number) ?? null,
              listMarker,
              taskMarker,
              taskStatus,
              (data.assigned_to as string) ?? null,
              (data.due_at as string) ?? null,
              (data.start_at as string) ?? null,
              (data.priority as string) ?? null,
              (data.content as string) ?? null,
              (data.content_hash as string) ?? null,
              JSON.stringify(data.data ?? {}),
              change.ts,
              change.ts,
              change.id,
            )
          }
        } else if (emitter) {
          emitter.commit(change, { db, skipPersist: true, skipBroadcast: true, source: "fs-import" })
        } else {
          applyChangeWithDb(db, change)
        }
      } catch (err) {
        // Any error reaching here is unexpected — expected duplicates are handled
        // by INSERT OR IGNORE (no exception). We continue replaying remaining
        // changes because the change log is append-only and may contain stale/duplicate
        // changes from prior sessions that fail harmlessly.
        unexpectedFailureCount++
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ phase: "apply", message })

        if (change.type === "node_created") {
          // Track the node ID so dependent changes (update, move, delete) are skipped
          const nodeId = (change.data as Record<string, unknown>)?.id as string | undefined
          if (nodeId) {
            failedNodeIds.add(nodeId)
            log.warn?.(`node_created failed for ${nodeId.slice(-8)}, will skip dependent changes: ${message}`)
          }
        } else {
          log.warn?.(`${change.type} failed for ${(change.target ?? "?").slice(-8)}: ${message}`)
        }
      }

      if (i % 100 === 0 || i === total - 1) {
        yield { current: i + 1, total }
      }
    }

    // Summary warning so the user knows replay had issues
    if (unexpectedFailureCount > 0) {
      log.warn?.(
        `applyChanges: ${unexpectedFailureCount} unexpected failure(s) during replay` +
          (failedNodeIds.size > 0 ? `, ${failedNodeIds.size} node(s) failed creation` : "") +
          (skippedCascadeCount > 0 ? `, ${skippedCascadeCount} dependent change(s) skipped` : ""),
      )
    }

    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }
}

function* materializeRules(db: Database): Generator<StepYield, void, unknown> {
  yield "Evaluating rules"
  const ctx = createRuleContext()
  for (const progress of evaluateAllRules(db, ctx)) {
    yield { current: progress.current, total: progress.total }
  }
}
