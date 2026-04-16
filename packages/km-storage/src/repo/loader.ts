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
import { toRelativeFsPath } from "../fs/path-utils.ts"
import type { Change } from "@km/core"
import { SCHEMA } from "../db/schema.ts"
import { applyChangeWithDb } from "../db/changes.ts"
import { evaluateAllRules, createRuleContext } from "../db/rules.ts"
import { findKmRootFromPath } from "../fs/path-utils.ts"
import { MemoryStore, type NodeStore } from "../store/store.ts"
import { createIgnoreMatcher, shouldIgnore, isHiddenFile } from "../fs/ignore.ts"
import { generatePathBasedId } from "../fs/id-utils.ts"
import { INSERT_NODE_SQL } from "../db/insert.ts"
import { decomposeChangeItem } from "../item-helpers.ts"

// Import extracted modules
import { discoverFiles, type UnexploredDir } from "../discovery.ts"
import { resolveLinksGen, resolveLinksAsync as resolveLinksAsyncImpl } from "../markdown/link-resolution.ts"
import {
  parseDeferredAsync as parseDeferredAsyncImpl,
  parseStubFile as parseStubFileImpl,
} from "../markdown/deferred.ts"
import { readSiblingOrder, applySiblingOrder } from "../sibling-order.ts"

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

  // 3. Mode-specific change source
  const source: ChangeSource =
    mode === "memory"
      ? yield* discoverMemoryMode(repoRoot, errors, db, discoverOnly, options?.preloadDepth)
      : yield* discoverFromChanges(db, kmDir ?? "", options?.force ?? false, errors)

  // 4. Shared pipeline (normalizes parent_id: null → ".")
  yield* applyChanges(db, source.changes, errors, repoRoot)

  // 4a. Disk mode: reconcile filesystem to detect externally added/removed files
  let reconcileDeferredFiles: DeferredFile[] = []
  if (mode === "disk") {
    const reconcileResult = yield* reconcileFilesystem(db, repoRoot, errors)
    if (reconcileResult.changes.length > 0) {
      yield* applyChanges(db, reconcileResult.changes, errors, repoRoot)
    }
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
    const alreadyQueued = new Set(returnDeferredFiles.map((f) => f.nodeId))
    const unparsedStubs = db
      .prepare("SELECT id, fs_path FROM nodes WHERE parsed = 0 AND fs_path IS NOT NULL AND data LIKE '%_stub%'")
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

    // Re-queue unparsed stubs from the replayed changes (same logic as discoverOnly path)
    const alreadyQueued = new Set(allDeferred.map((f) => f.nodeId))
    const unparsedStubs = db
      .prepare("SELECT id, fs_path FROM nodes WHERE parsed = 0 AND fs_path IS NOT NULL AND data LIKE '%_stub%'")
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
): Generator<StepYield, ChangeSource, unknown> {
  return yield* discoverFiles(repoRoot, db, {
    parseMode: discoverOnly ? "stub" : "full",
    errors,
    preloadDepth,
  })
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
}

function* reconcileFilesystem(
  db: Database,
  repoRoot: string,
  errors: LoadError[],
): Generator<StepYield, ReconcileResult, unknown> {
  yield "Reconciling filesystem"

  const changes: Change[] = []
  const deferredFiles: DeferredFile[] = []
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
    return { changes, deferredFiles }
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
    return { changes, deferredFiles }
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
          data: { _stub: true },
        },
      })
      deferredFiles.push({ nodeId, fsPath: fullPath })
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
    `reconcileFilesystem: ${changes.length} changes, ${deferredFiles.length} deferred (fs=${fsPathSet.size} db=${dbPathSet.size})`,
  )
  yield { current: changes.length, total: changes.length }

  return { changes, deferredFiles }
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
            (data.fs_ino as number) ?? null,
            (data.fs_mtime as number) ?? null,
            (data.name as string) ?? null,
            (data.block_id as string) ?? null,
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
