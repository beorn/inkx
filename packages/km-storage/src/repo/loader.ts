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
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "fs"
import { join, dirname, basename, isAbsolute } from "path"
import { toRelativeFsPath } from "../fs/path-utils.ts"
import type { Event } from "@km/core"
import { SCHEMA } from "../db/schema.ts"
import { applyEventWithDb } from "../db/events.ts"
import { evaluateAllRules, createRuleContext } from "../db/rules.ts"
import { findKmRootFromPath } from "../fs/path-utils.ts"
import { MemoryStore, type NodeStore } from "../store/store.ts"
import { getIgnorePatterns, shouldIgnore, isHiddenFile } from "../fs/ignore.ts"
import { generatePathBasedId } from "../fs/id-utils.ts"
import { INSERT_NODE_SQL } from "../db/insert.ts"
import { decomposeEventItem } from "../item-helpers.ts"

// Import extracted modules
import { discoverFiles, type UnexploredDir } from "../discovery.ts"
import { resolveLinksGen, resolveLinksAsync as resolveLinksAsyncImpl } from "../markdown/link-resolution.ts"
import { parseDeferredAsync as parseDeferredAsyncImpl, parseStubFile as parseStubFileImpl } from "../markdown/deferred.ts"

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
   * - "memory": Scan filesystem, don't read events.jsonl
   * - "disk": Read from events.jsonl
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

  // 3. Mode-specific event source
  const source: EventSource =
    mode === "memory"
      ? yield* discoverMemoryMode(repoRoot, errors, db, discoverOnly, options?.preloadDepth)
      : yield* discoverFromEvents(db, kmDir ?? "", options?.force ?? false, errors)

  // 4. Shared pipeline (normalizes parent_id: null → ".")
  yield* applyEvents(db, source.events, errors, repoRoot)

  // 4a. Disk mode: reconcile filesystem to detect externally added/removed files
  let reconcileDeferredFiles: DeferredFile[] = []
  if (mode === "disk") {
    const reconcileResult = yield* reconcileFilesystem(db, repoRoot, errors)
    if (reconcileResult.events.length > 0) {
      yield* applyEvents(db, reconcileResult.events, errors, repoRoot)
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
    // Even in full mode, reconciliation may find new files that need parsing
    if (reconcileDeferredFiles.length > 0) {
      returnDeferredFiles = reconcileDeferredFiles
      log.debug?.(`reconciliation found ${reconcileDeferredFiles.length} new files to parse`)
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

interface EventSource {
  events: Event[]
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
): Generator<StepYield, EventSource, unknown> {
  return yield* discoverFiles(repoRoot, db, {
    parseMode: discoverOnly ? "stub" : "full",
    errors,
    preloadDepth,
  })
}

// ============================================================================
// EVENT READING
// ============================================================================

/**
 * Parse events.jsonl: dedup by id, warn on malformed lines, sort chronologically (ULID).
 * Returns empty array if file doesn't exist.
 */
function parseEventsFile(kmDir: string, caller: string): Event[] {
  const eventsPath = join(kmDir, "events.jsonl")

  if (!existsSync(eventsPath)) {
    log.debug?.(`no events file at ${eventsPath}`)
    return []
  }

  const content = readFileSync(eventsPath, "utf-8")
  const lines = content.split("\n").filter((line) => line.trim())

  log.debug?.(`reading ${lines.length} lines from events.jsonl`)

  const events: Event[] = []
  const seen = new Set<string>()
  let skippedCount = 0

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Event
      if (!seen.has(event.id)) {
        seen.add(event.id)
        events.push(event)
      }
    } catch {
      skippedCount++
    }
  }

  if (skippedCount > 0) {
    log.warn?.(`${caller}: skipped ${skippedCount} malformed line(s) in events.jsonl`)
  }

  // Sort by ULID (lexicographic = chronological)
  events.sort((a, b) => a.id.localeCompare(b.id))

  log.debug?.(`read ${events.length} events`)
  return events
}

export function readEvents(kmDir: string): Event[] {
  return parseEventsFile(kmDir, "readEvents")
}

// ============================================================================
// DISK MODE DISCOVERY
// ============================================================================

function* discoverFromEvents(
  db: Database,
  kmDir: string,
  force: boolean,
  _errors: LoadError[],
): Generator<StepYield, EventSource, unknown> {
  yield "Reading events"

  const allEvents = parseEventsFile(kmDir, "discoverFromEvents")

  // Filter to only new events (unless force rebuild)
  let events: Event[]
  const lastApplied = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event") as
    | { value: string }
    | undefined

  if (force) {
    events = allEvents
  } else {
    events = lastApplied?.value ? allEvents.filter((e) => e.id > lastApplied.value) : allEvents
  }

  yield { current: events.length, total: events.length }
  log.debug?.(`discovered ${allEvents.length} events (${events.length} new)`)

  return { events, pendingLinks: [] }
}

// ============================================================================
// FILESYSTEM RECONCILIATION (DISK MODE)
// ============================================================================

/**
 * After disk mode applies events from events.jsonl, scan the filesystem
 * to detect files present on disk but missing from the DB (externally added),
 * and files in the DB that no longer exist on disk (externally deleted).
 *
 * Generates node_created / node_deleted events for the differences.
 */
interface ReconcileResult {
  events: Event[]
  deferredFiles: DeferredFile[]
}

function* reconcileFilesystem(
  db: Database,
  repoRoot: string,
  errors: LoadError[],
): Generator<StepYield, ReconcileResult, unknown> {
  yield "Reconciling filesystem"

  const events: Event[] = []
  const deferredFiles: DeferredFile[] = []
  const now = Date.now()
  const ignorePatterns = getIgnorePatterns(repoRoot)

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
    return { events, deferredFiles }
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
    return { events, deferredFiles }
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
      if (shouldIgnore(fullPath, ignorePatterns, repoRoot)) continue

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

  // Find files on disk but NOT in DB → generate node_created events
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

    const nodeId = generatePathBasedId(repoRoot, fullPath)
    newPathToId.set(relPath, nodeId)

    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      events.push({
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
          parent_idx: 0,
          fs_path: relPath,
          name: entryName,
          content: entryName,
        },
      })
    } else if (entryName.endsWith(".md") || entryName.endsWith(".txt")) {
      const isTxt = entryName.endsWith(".txt")
      const ext = isTxt ? /\.txt$/i : /\.md$/i
      const name = entryName.replace(ext, "")
      events.push({
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
          parent_idx: 0,
          fs_path: relPath,
          name,
          title: name,
          data: { _stub: true },
        },
      })
      deferredFiles.push({ nodeId, fsPath: fullPath })
    } else {
      // Non-markdown file
      events.push({
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
          parent_idx: 0,
          fs_path: relPath,
          content: entryName,
        },
      })
    }
  }

  // Find files in DB but NOT on disk → generate node_deleted events
  for (const [relPath, nodeId] of dbPathToId) {
    if (!fsPathSet.has(relPath)) {
      events.push({
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
    `reconcileFilesystem: ${events.length} events, ${deferredFiles.length} deferred (fs=${fsPathSet.size} db=${dbPathSet.size})`,
  )
  yield { current: events.length, total: events.length }

  return { events, deferredFiles }
}

// ============================================================================
// SHARED PIPELINE
// ============================================================================

// oxlint-disable-next-line complexity/complexity -- 35/30: event type switch with validation guards, exhaustive by design
function* applyEvents(
  db: Database,
  events: Event[],
  errors: LoadError[],
  repoRoot: string,
): Generator<StepYield, void, unknown> {
  yield "Applying changes"

  const total = events.length
  if (total === 0) return

  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(INSERT_NODE_SQL)
    // Track node IDs whose creation failed — skip subsequent events targeting them.
    // The event log is append-only and ordered; if a node_created fails, all
    // subsequent events referencing that node would cascade-fail. Skipping them
    // avoids noise and preserves ordered-event semantics within a node's lifecycle.
    const failedNodeIds = new Set<string>()
    let unexpectedFailureCount = 0
    let skippedCascadeCount = 0

    for (const [i, event] of events.entries()) {
      // Skip events targeting a node whose creation failed (prevents cascade failures)
      const targetId = event.target ?? (event.data as Record<string, unknown>)?.id
      if (typeof targetId === "string" && failedNodeIds.has(targetId)) {
        log.debug?.(`skipping ${event.type} for failed node ${targetId.slice(-8)}`)
        skippedCascadeCount++
        continue
      }

      try {
        if (event.type === "node_created") {
          const data = event.data as Record<string, unknown>
          // Normalize fs_path: old events may have absolute paths
          const rawFsPath = (data.fs_path as string) ?? null
          const fsPath = rawFsPath && isAbsolute(rawFsPath) ? toRelativeFsPath(repoRoot, rawFsPath) : rawFsPath
          // Normalize parent_id: null → "." (repo root)
          const parentId = (data.parent_id as string) ?? "."
          // Extract flat DB columns from nested item object (new format) or flat fields (legacy)
          const { listMarker, taskMarker, taskStatus } = decomposeEventItem(data)
          // INSERT OR IGNORE: in disk mode, state.db may already have nodes
          // from km sync that events.jsonl also references (last_event cursor
          // may not cover all events). Matches applyEventWithDb behavior.
          // Expected duplicates are silently ignored (no exception thrown).
          insertStmt.run(
            data.id as string,
            data.type as string,
            (data.fstype as string) ?? null,
            parentId,
            data.item ? 1 : 0,
            (data.embed_source as string) ?? null,
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
            event.ts,
            event.ts,
            event.id,
          )
        } else {
          applyEventWithDb(db, event)
        }
      } catch (err) {
        // Any error reaching here is unexpected — expected duplicates are handled
        // by INSERT OR IGNORE (no exception). We continue replaying remaining
        // events because the event log is append-only and may contain stale/duplicate
        // events from prior sessions that fail harmlessly.
        unexpectedFailureCount++
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ phase: "apply", message })

        if (event.type === "node_created") {
          // Track the node ID so dependent events (update, move, delete) are skipped
          const nodeId = (event.data as Record<string, unknown>)?.id as string | undefined
          if (nodeId) {
            failedNodeIds.add(nodeId)
            log.warn?.(`node_created failed for ${nodeId.slice(-8)}, will skip dependent events: ${message}`)
          }
        } else {
          log.warn?.(`${event.type} failed for ${(event.target ?? "?").slice(-8)}: ${message}`)
        }
      }

      if (i % 100 === 0 || i === total - 1) {
        yield { current: i + 1, total }
      }
    }

    // Summary warning so the user knows replay had issues
    if (unexpectedFailureCount > 0) {
      log.warn?.(
        `applyEvents: ${unexpectedFailureCount} unexpected failure(s) during replay` +
          (failedNodeIds.size > 0 ? `, ${failedNodeIds.size} node(s) failed creation` : "") +
          (skippedCascadeCount > 0 ? `, ${skippedCascadeCount} dependent event(s) skipped` : ""),
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
