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

// Node.js/Bun global for yielding to event loop
// eslint-disable-next-line promise/prefer-await-to-callbacks -- Type declaration, not actual callback
declare function setImmediate(callback: (value?: unknown) => void): unknown

import { createLogger } from "@beorn/logger"
import { Database } from "bun:sqlite"
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "fs"
import { join, dirname, basename, isAbsolute, relative } from "path"
import { toRelativeFsPath } from "./path-utils.ts"
import type { Event, KNode } from "@km/core"
import { createParsePool } from "./parse-pool.ts"
import { runDeferredPipeline } from "./pipeline.ts"
import { parseMarkdownWithLinks } from "@km/markdown"
import { SCHEMA } from "./schema.ts"
import { applyEventWithDb } from "./db-events.ts"
import { evaluateAllRules, createRuleContext } from "./db-rules.ts"
import { findKmRootFromPath } from "./path-utils.ts"
import { MemoryStore, type NodeStore } from "./store.ts"
import { getIgnorePatterns, shouldIgnore, isHiddenFile } from "./ignore.ts"
import { generatePathBasedId } from "./id-utils.ts"

// Import extracted modules
import { discoverFiles } from "./discovery.ts"
import { resolveLinksGen, resolveLinksAsync as resolveLinksAsyncImpl } from "./link-resolution.ts"

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
      ? yield* discoverMemoryMode(repoRoot, errors, db, discoverOnly)
      : yield* discoverFromEvents(db, kmDir ?? "", options?.force ?? false, errors)

  // 4. Shared pipeline (normalizes parent_id: null → ".")
  yield* applyEvents(db, source.events, errors, repoRoot)

  // 4a. Disk mode: reconcile filesystem to detect externally added/removed files
  if (mode === "disk") {
    const reconcileEvents = yield* reconcileFilesystem(db, repoRoot, errors)
    if (reconcileEvents.length > 0) {
      yield* applyEvents(db, reconcileEvents, errors, repoRoot)
    }
  }

  // 5. Resolve links and evaluate rules
  let linkCount = 0
  let returnPendingLinks: PendingLink[] | undefined
  let returnDeferredFiles: DeferredFile[] | undefined

  if (discoverOnly) {
    returnDeferredFiles = source.deferredFiles
    log.debug?.(`discover-only mode, ${returnDeferredFiles?.length ?? 0} files deferred`)
  } else {
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

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface EventSource {
  events: Event[]
  pendingLinks: PendingLink[]
  deferredFiles?: DeferredFile[]
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
      id, type, fstype, parent_id, parent_idx, fs_path, content, data,
      created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ".",
    "oi",
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
): Generator<StepYield, EventSource, unknown> {
  return yield* discoverFiles(repoRoot, db, {
    parseMode: discoverOnly ? "stub" : "full",
    errors,
  })
}

// ============================================================================
// EVENT READING
// ============================================================================

/**
 * Read all events from events.jsonl.
 * Handles deduplication and sorting by ULID.
 *
 * @param kmDir - Path to .km directory
 */
export function readEvents(kmDir: string): Event[] {
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

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Event
      if (seen.has(event.id)) continue
      seen.add(event.id)
      events.push(event)
    } catch {
      // Skip malformed lines
    }
  }

  // Sort by ULID (lexicographic = chronological)
  events.sort((a, b) => a.id.localeCompare(b.id))

  log.debug?.(`read ${events.length} events`)
  return events
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

  const eventsPath = join(kmDir, "events.jsonl")
  if (!existsSync(eventsPath)) {
    log.debug?.(`no events file at ${eventsPath}`)
    yield { current: 0, total: 0 }
    return { events: [], pendingLinks: [] }
  }

  const content = readFileSync(eventsPath, "utf-8")
  const lines = content.split("\n").filter((line) => line.trim())

  const allEvents: Event[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Event
      if (!seen.has(event.id)) {
        seen.add(event.id)
        allEvents.push(event)
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Sort by ULID (lexicographic = chronological)
  allEvents.sort((a, b) => a.id.localeCompare(b.id))

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
function* reconcileFilesystem(
  db: Database,
  repoRoot: string,
  errors: LoadError[],
): Generator<StepYield, Event[], unknown> {
  yield "Reconciling filesystem"

  const events: Event[] = []
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
    return events
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
    return events
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
        parentId = newPathToId.get(parentRelPath)!
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
          type: "oi",
          fstype: "folder",
          parent_id: parentId,
          parent_idx: 0,
          fs_path: relPath,
          name: entryName,
          content: entryName,
        },
      })
    } else if (entryName.endsWith(".md")) {
      const name = entryName.replace(/\.md$/i, "")
      events.push({
        id: nodeId,
        type: "node_created",
        actor: "fs-reconcile",
        ts: now,
        data: {
          id: nodeId,
          type: "oi",
          fstype: "mdfile",
          parent_id: parentId,
          parent_idx: 0,
          fs_path: relPath,
          name,
          title: name,
          data: { _stub: true },
        },
      })
    } else {
      // Non-markdown file
      events.push({
        id: nodeId,
        type: "node_created",
        actor: "fs-reconcile",
        ts: now,
        data: {
          id: nodeId,
          type: "oi",
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

  log.debug?.(`reconcileFilesystem: ${events.length} events (fs=${fsPathSet.size} db=${dbPathSet.size})`)
  yield { current: events.length, total: events.length }

  return events
}

// ============================================================================
// SHARED INSERT HELPERS
// ============================================================================

/** SQL for the 28-column INSERT used by applyEvents, parseDeferredSequential, and parseStubFile.
 * Uses INSERT OR IGNORE to match applyEventWithDb behavior — in disk mode,
 * events.jsonl may contain events for nodes that already exist in state.db. */
const INSERT_NODE_SQL = `
  INSERT OR IGNORE INTO nodes (
    id, type, fstype, parent_id, link_to, link_alias, parent_idx,
    fs_path, fs_ino, fs_mtime, name, block_id, title, md_pos, md_line,
    list_marker, task_marker, task_status, assigned_to, due_date, scheduled_date, priority,
    content, content_hash, data,
    created_at, updated_at, version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

/**
 * Run the 28-column INSERT for a KNode.
 * Shared by parseDeferredSequential and parseStubFile where the source is a KNode.
 */
function insertNodeRow(stmt: ReturnType<Database["prepare"]>, node: KNode, now: number): void {
  const data = node.data ?? {}
  stmt.run(
    node.id,
    node.type,
    node.fstype ?? null,
    node.parent_id ?? null,
    node.link_to ?? null,
    node.link_alias ?? null,
    node.parent_idx ?? 0,
    node.fs_path ?? null,
    node.fs_ino ?? null,
    node.fs_mtime ?? null,
    node.name ?? null,
    node.block_id ?? null,
    node.title ?? null,
    node.md_pos ?? null,
    node.md_line ?? null,
    node.list_marker ?? null,
    node.task_marker ?? null,
    node.task_status ?? null,
    node.assigned_to ?? null,
    node.due_date ?? null,
    node.scheduled_date ?? null,
    node.priority ?? null,
    node.content ?? null,
    node.content_hash ?? null,
    JSON.stringify(data),
    now,
    now,
    node.version || "",
  )
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

    for (const [i, event] of events.entries()) {
      try {
        if (event.type === "node_created") {
          const data = event.data as Record<string, unknown>
          // Normalize fs_path: old events may have absolute paths
          const rawFsPath = (data.fs_path as string) ?? null
          const fsPath = rawFsPath && isAbsolute(rawFsPath) ? toRelativeFsPath(repoRoot, rawFsPath) : rawFsPath
          // Normalize parent_id: null → "." (repo root)
          const parentId = (data.parent_id as string) ?? "."
          // INSERT OR IGNORE: in disk mode, state.db may already have nodes
          // from km sync that events.jsonl also references (last_event cursor
          // may not cover all events). Matches applyEventWithDb behavior.
          insertStmt.run(
            data.id as string,
            data.type as string,
            (data.fstype as string) ?? null,
            parentId,
            (data.link_to as string) ?? null,
            (data.link_alias as string) ?? null,
            (data.parent_idx as number) ?? 0,
            fsPath,
            (data.fs_ino as number) ?? null,
            (data.fs_mtime as number) ?? null,
            (data.name as string) ?? null,
            (data.block_id as string) ?? null,
            (data.title as string) ?? null,
            (data.md_pos as number) ?? null,
            (data.md_line as number) ?? null,
            (data.list_marker as string) ?? null,
            (data.task_marker as string) ?? null,
            (data.task_status as string) ?? null,
            (data.assigned_to as string) ?? null,
            (data.due_date as string) ?? null,
            (data.scheduled_date as string) ?? null,
            (data.priority as number) ?? null,
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
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ phase: "apply", message })
      }

      if (i % 100 === 0 || i === total - 1) {
        yield { current: i + 1, total }
      }
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

// ============================================================================
// DEFERRED PARSING
// ============================================================================

/**
 * km-fast-md.7: Parse deferred files in background after board renders.
 * Updates stub nodes with full content and creates child nodes.
 *
 * km-fast-md.6: Uses worker pool for parallel parsing when available.
 *
 * @param deferredFiles - Files to parse (from LoadResult.deferredFiles)
 * @param shouldAbort - Optional callback that returns true to abort parsing
 * @param options - Optional configuration (useWorkerPool defaults to true)
 * @returns Object with parsed count and pending links for resolution
 */
export async function parseDeferredAsync(
  db: Database,
  deferredFiles: DeferredFile[],
  shouldAbort?: () => boolean,
  options?: { useWorkerPool?: boolean },
): Promise<{ parsed: number; pendingLinks: PendingLink[] }> {
  const total = deferredFiles.length
  if (total === 0) return { parsed: 0, pendingLinks: [] }

  const useWorkerPool = options?.useWorkerPool ?? true

  if (useWorkerPool && total >= 4) {
    return parseDeferredWithPool(db, deferredFiles, shouldAbort)
  }

  return parseDeferredSequential(db, deferredFiles, shouldAbort)
}

/**
 * km-fast-md.6: Parse files in parallel using worker pool.
 */
async function parseDeferredWithPool(
  db: Database,
  deferredFiles: DeferredFile[],
  _shouldAbort?: () => boolean,
): Promise<{ parsed: number; pendingLinks: PendingLink[] }> {
  const total = deferredFiles.length
  log.debug?.(`parseDeferredWithPool: starting ${total} files with pipeline`)

  await using pool = createParsePool()
  await pool.start()

  const result = await runDeferredPipeline(db, deferredFiles, pool)

  const pendingLinks: PendingLink[] = result.pendingLinks.map((link) => ({
    nodeId: link.source_id,
    link: {
      target: link.target_name,
      section: link.section ?? undefined,
      blockId: link.block_id ?? undefined,
      alias: link.alias ?? undefined,
      embedded: link.embedded,
    },
    relationship: link.relationship ?? undefined,
  }))

  log.debug?.(`parseDeferredWithPool: completed, ${result.parsed} parsed, ${pendingLinks.length} links`)

  return { parsed: result.parsed, pendingLinks }
}

/**
 * Parse a single deferred file: read markdown, replace stub with full nodes.
 * Returns the wikilinks found, or null if the stub was not found.
 */
function parseOneFile(
  db: Database,
  insertStmt: ReturnType<Database["prepare"]>,
  deleteStmt: ReturnType<Database["prepare"]>,
  deferredFile: DeferredFile,
): PendingLink[] | null {
  const { nodeId, fsPath } = deferredFile
  const content = readFileSync(fsPath, "utf-8")
  const { nodes, wikilinks } = parseMarkdownWithLinks(content, fsPath)

  const stubRow = db.prepare("SELECT parent_id, parent_idx FROM nodes WHERE id = ?").get(nodeId) as {
    parent_id: string | null
    parent_idx: number
  } | null

  if (!stubRow) {
    log.debug?.(`parseDeferredSequential: stub ${nodeId} not found, skipping`)
    return null
  }

  deleteStmt.run(nodeId)

  const fileNode = nodes[0]
  if (fileNode?.type === "oi" && (fileNode.fstype === "file" || fileNode.fstype === "mdfile")) {
    fileNode.id = nodeId
    fileNode.parent_id = stubRow.parent_id
    fileNode.parent_idx = stubRow.parent_idx
  }

  const now = Date.now()
  for (const node of nodes) {
    insertNodeRow(insertStmt, node, now)
  }

  return wikilinks
}

/**
 * Sequential parsing (original implementation, used for small file counts).
 */
async function parseDeferredSequential(
  db: Database,
  deferredFiles: DeferredFile[],
  shouldAbort?: () => boolean,
): Promise<{ parsed: number; pendingLinks: PendingLink[] }> {
  const total = deferredFiles.length
  log.debug?.(`parseDeferredSequential: starting ${total} files`)
  const pendingLinks: PendingLink[] = []
  const BATCH_SIZE = 10
  let parsed = 0

  db.run("BEGIN IMMEDIATE")

  try {
    const deleteStmt = db.prepare("DELETE FROM nodes WHERE id = ?")
    const insertStmt = db.prepare(INSERT_NODE_SQL)

    for (const [i, deferredFile] of deferredFiles.entries()) {
      try {
        const links = parseOneFile(db, insertStmt, deleteStmt, deferredFile)
        if (links === null) continue

        for (const wikilink of links) {
          pendingLinks.push(wikilink)
        }
        parsed++
      } catch (err) {
        log.debug?.(`parseDeferredSequential: error parsing ${deferredFile.fsPath}: ${String(err)}`)
      }

      if (i % BATCH_SIZE === 0) {
        await new Promise((resolve) => {
          setImmediate(resolve)
        })
        if (shouldAbort?.()) {
          log.debug?.(`parseDeferredSequential: aborted at ${i}/${total}`)
          break
        }
      }
    }

    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  log.debug?.(`parseDeferredSequential: completed, ${parsed} parsed, ${pendingLinks.length} links`)

  return { parsed, pendingLinks }
}

/**
 * Parse a single stub file synchronously.
 *
 * Use when targeting a specific file in discoverOnly mode - parse that file
 * eagerly so it has content before the board renders.
 *
 * @param db - Database instance
 * @param nodeId - The stub node ID
 * @param fsPath - Filesystem path to the markdown file
 * @returns true if parsed successfully, false if stub not found or parse failed
 */
// oxlint-disable-next-line complexity/complexity -- Stub-to-full parse with INSERT — shares insertNodeRow helper
export function parseStubFile(db: Database, nodeId: string, fsPath: string): boolean {
  log.debug?.(`parseStubFile: parsing ${fsPath}`)

  try {
    const content = readFileSync(fsPath, "utf-8")
    const { nodes } = parseMarkdownWithLinks(content, fsPath)

    const stubRow = db.prepare("SELECT parent_id, parent_idx FROM nodes WHERE id = ?").get(nodeId) as {
      parent_id: string | null
      parent_idx: number
    } | null

    if (!stubRow) {
      log.debug?.(`parseStubFile: stub ${nodeId} not found`)
      return false
    }

    db.run("BEGIN IMMEDIATE")

    try {
      db.prepare("DELETE FROM nodes WHERE id = ?").run(nodeId)

      const fileNode = nodes[0]
      const originalFileId = fileNode?.id
      if (fileNode?.type === "oi" && (fileNode.fstype === "file" || fileNode.fstype === "mdfile")) {
        fileNode.id = nodeId
        fileNode.parent_id = stubRow.parent_id
        fileNode.parent_idx = stubRow.parent_idx

        // Update child nodes to point to the preserved file node ID
        for (const node of nodes) {
          if (node.parent_id === originalFileId) {
            node.parent_id = nodeId
          }
        }
      }

      const insertStmt = db.prepare(INSERT_NODE_SQL)

      const now = Date.now()
      for (const node of nodes) {
        insertNodeRow(insertStmt, node, now)
      }

      db.run("COMMIT")
      log.debug?.(`parseStubFile: success, ${nodes.length} nodes`)
      return true
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }
  } catch (err) {
    log.debug?.(`parseStubFile: error ${String(err)}`)
    return false
  }
}
