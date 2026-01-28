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

import createDebug from "debug"
import { Database } from "bun:sqlite"
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { join, dirname, relative, basename } from "path"
import type { Event } from "@km/core"
import { createParsePool } from "./parse-pool.ts"
import { runDeferredPipeline } from "./pipeline.ts"

/**
 * Progress yield type for step generators.
 * - String: creates new sub-step with that label
 * - Object { current, total }: updates progress on current sub-step
 * - Object { declare: [...] }: declare all sub-steps upfront (show as pending)
 */
export type StepYield =
  | string
  | { current?: number; total?: number }
  | { declare: string[] }
import { parseMarkdownWithLinks } from "@km/markdown"
import { SCHEMA } from "./schema.ts"
import { applyEventWithDb } from "./db-events.ts"
import { createLinkResolver } from "./link-resolver.ts"
import { evaluateAllRules, createRuleContext } from "./db-rules.ts"
import { findKmRootFromPath } from "./path-utils.ts"
import { MemoryStore, type NodeStore } from "./store.ts"
import { getIgnorePatterns, shouldIgnore } from "./ignore.ts"

const debug = createDebug("km:storage:repo-loader")

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
}

/** Files pending deferred parsing (for discoverOnly mode) */
export interface DeferredFile {
  nodeId: string
  fsPath: string
}

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
export function* loadRepo(
  rootPath?: string,
  options?: LoadOptions,
): Generator<StepYield, LoadResult, unknown> {
  const start = Date.now()
  const errors: LoadError[] = []

  // 1. Resolve path and detect mode
  const searchAncestors = options?.searchAncestors ?? true
  const { repoRoot, kmDir } = resolveRepoRoot(rootPath, searchAncestors)
  const mode = kmDir ? "disk" : "memory"

  debug("loadRepo repoRoot=%s mode=%s", repoRoot, mode)

  // Declare all sub-steps upfront so they appear as pending
  const skipLinks = options?.skipLinkResolution ?? false
  const discoverOnly = options?.discoverOnly ?? false

  if (mode === "memory") {
    if (discoverOnly) {
      // km-fast-md.7: Fast discover-only mode
      yield { declare: ["Discovering files", "Applying changes"] }
    } else if (skipLinks) {
      yield {
        declare: [
          "Discovering files",
          "Parsing markdown",
          "Applying changes",
          "Evaluating rules",
        ],
      }
    } else {
      yield {
        declare: [
          "Discovering files",
          "Parsing markdown",
          "Applying changes",
          "Resolving links",
          "Evaluating rules",
        ],
      }
    }
  } else {
    yield {
      declare: ["Reading events", "Applying changes", "Evaluating rules"],
    }
  }

  // 2. Set up database (explicit db required - no singletons)
  let db: Database
  if (options?.db) {
    db = options.db
    if (options?.force) {
      // Reset database tables (inline to avoid singleton dependency)
      db.run(`
        DROP TABLE IF EXISTS nodes_fts;
        DROP TABLE IF EXISTS nodes;
        DROP TABLE IF EXISTS links;
        DROP TABLE IF EXISTS meta;
      `)
      db.run(SCHEMA)
    }
  } else {
    // No db provided - create in-memory database
    // This is for memory mode when caller doesn't need to retain db reference
    db = new Database(":memory:")
    db.run(SCHEMA)
  }

  // 2a. Migration: ensure repo root node exists
  // Run in both memory and disk mode - all repos need a root folder node
  migrateToRepoRootNode(db, repoRoot)

  // 3. Mode-specific event source (yield* chains progress)
  // km-fast-md.7: Use fast discover for instant board render
  const source: EventSource =
    mode === "memory"
      ? discoverOnly
        ? yield* discoverFilesOnly(repoRoot, errors, db)
        : yield* discoverFromFilesystem(repoRoot, errors, db)
      : yield* discoverFromEvents(
          db,
          kmDir ?? "",
          options?.force ?? false,
          errors,
        )

  // 4. Shared pipeline (SAME for both modes)
  yield* applyEvents(db, source.events, errors)

  // Resolve links (memory mode has pending links, disk mode resolves during apply)
  let linkCount = 0
  let returnPendingLinks: PendingLink[] | undefined
  let returnDeferredFiles: DeferredFile[] | undefined

  // km-fast-md.7: In discover-only mode, skip link resolution and rules
  if (discoverOnly) {
    returnDeferredFiles = source.deferredFiles
    debug(
      "discover-only mode, %d files deferred",
      returnDeferredFiles?.length ?? 0,
    )
  } else {
    if (source.pendingLinks.length > 0) {
      if (options?.skipLinkResolution) {
        // Skip resolution - return pending links for deferred processing
        returnPendingLinks = source.pendingLinks
        debug(
          "skipping link resolution, %d links deferred",
          source.pendingLinks.length,
        )
      } else {
        linkCount = yield* resolveLinks(db, source.pendingLinks, errors)
      }
    }

    // Materialize rules
    yield* materializeRules(db)
  }

  // 5. Finalize
  const nodeCount = (
    db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }
  ).count

  // Real-time event application now handled via context-local database in emit.ts

  const duration = Date.now() - start
  debug("loadRepo complete", { mode, nodeCount, linkCount, duration })

  // Create store for backward compatibility (callers should use DataStore instead)
  // NOTE: DiskStore removed - use DataStore + Emitter pattern via createRepo()
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

// --- Types ---

interface EventSource {
  events: Event[]
  pendingLinks: PendingLink[]
  /** km-fast-md.7: Files to parse later (discover-only mode) */
  deferredFiles?: DeferredFile[]
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

// --- Path Resolution ---

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

// --- Migration ---

/**
 * Migrate existing repos to have a repo root node.
 * This ensures all nodes have a parent_id (either a folder or the repo root).
 *
 * @param db - Database instance
 * @param repoRoot - Absolute path to repo root
 */
export function migrateToRepoRootNode(db: Database, repoRoot: string): void {
  // Check if repo root node already exists
  const existingRoot = db
    .prepare("SELECT id FROM nodes WHERE parent_id IS NULL AND type = 'folder'")
    .get() as { id: string } | undefined

  let repoRootId: string

  if (existingRoot) {
    debug(
      "migrateToRepoRootNode: repo root node already exists (%s)",
      existingRoot.id,
    )
    repoRootId = existingRoot.id
  } else {
    // Check if there are any orphan nodes to migrate
    const orphanCount = (
      db
        .prepare("SELECT COUNT(*) as count FROM nodes WHERE parent_id IS NULL")
        .get() as { count: number }
    ).count

    debug(
      "migrateToRepoRootNode: creating repo root node (%d orphan nodes to migrate)",
      orphanCount,
    )

    // Create repo root node - always create it even if no orphans
    // This ensures the node exists for discover functions to query
    // Use "." as the ID since relative(repoRoot, repoRoot) would return ""
    repoRootId = "."
    const now = Date.now()

    db.run("BEGIN IMMEDIATE")
    try {
      // Insert repo root node
      db.prepare(
        `
        INSERT INTO nodes (
          id, type, parent_id, parent_idx, fs_path, content, data,
          created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        repoRootId,
        "folder",
        null, // Top level - repo root has no parent
        0,
        repoRoot,
        basename(repoRoot),
        JSON.stringify({ name: basename(repoRoot), is_repo_root: true }),
        now,
        now,
        "",
      )

      // Update all orphan nodes to be children of repo root (if any exist)
      const orphanCount = (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM nodes WHERE parent_id IS NULL AND type != 'folder'",
          )
          .get() as { count: number }
      ).count
      if (orphanCount > 0) {
        debug("migrateToRepoRootNode: updating %d orphan nodes", orphanCount)
        db.prepare(
          "UPDATE nodes SET parent_id = ? WHERE parent_id IS NULL AND type != 'folder'",
        ).run(repoRootId)
      }

      db.run("COMMIT")
      debug("migrateToRepoRootNode: migration complete")
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }
  }

  // Update orphan nodes even if repo root already exists
  // This handles files discovered after the initial migration
  const orphanCount = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM nodes WHERE parent_id IS NULL AND type != 'folder'",
      )
      .get() as { count: number }
  ).count

  if (orphanCount > 0) {
    debug("migrateToRepoRootNode: updating %d orphan nodes", orphanCount)
    db.run("BEGIN IMMEDIATE")
    try {
      db.prepare(
        "UPDATE nodes SET parent_id = ? WHERE parent_id IS NULL AND type != 'folder'",
      ).run(repoRootId)
      db.run("COMMIT")
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }
  }
}

// --- Memory Mode Discovery ---

/**
 * km-fast-md.7: Fast discover-only mode for instant board render.
 * Creates stub nodes for files/folders without parsing markdown.
 * Returns deferred files list for later background parsing.
 */
function* discoverFilesOnly(
  repoRoot: string,
  _errors: LoadError[],
  db: Database,
): Generator<StepYield, EventSource, unknown> {
  yield "Discovering files"

  const events: Event[] = []
  const deferredFiles: DeferredFile[] = []
  const now = Date.now()
  const ignorePatterns = getIgnorePatterns(repoRoot)

  // Query for existing repo root node (created by migration)
  const repoRootRow = db
    .prepare("SELECT id FROM nodes WHERE parent_id IS NULL AND type = 'folder'")
    .get() as { id: string } | undefined

  if (!repoRootRow) {
    throw new Error("Repo root node not found - migration failed")
  }

  const repoRootId = repoRootRow.id

  // Count files for progress
  const total = countMarkdownFilesFast(repoRoot, ignorePatterns)
  yield { current: 0, total }

  let current = 0
  yield* scanDirectory(repoRoot, repoRootId)

  yield { current, total }
  return { events, pendingLinks: [], deferredFiles }

  // Fast scanner - no markdown parsing
  function* scanDirectory(
    dirPath: string,
    parentId: string | null,
  ): Generator<StepYield, void, unknown> {
    if (!existsSync(dirPath)) return

    // Skip ignored directories (except root)
    if (parentId !== null && shouldIgnore(dirPath, ignorePatterns, repoRoot)) {
      return
    }

    const entries = readdirSync(dirPath, { withFileTypes: true })
    let order = 0

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      // Skip ignored entries BEFORE creating nodes
      if (shouldIgnore(fullPath, ignorePatterns, repoRoot)) continue

      if (entry.isDirectory()) {
        // Create folder node
        const folderId = generateId(repoRoot, fullPath)
        events.push({
          id: folderId,
          type: "node_created",
          actor: "fs-scan",
          ts: now,
          data: {
            id: folderId,
            type: "folder",
            parent_id: parentId,
            parent_idx: order++,
            fs_path: fullPath,
            content: entry.name,
          },
        })

        yield* scanDirectory(fullPath, folderId)
      } else if (entry.isFile()) {
        const fileId = generateId(repoRoot, fullPath)

        if (entry.name.endsWith(".md")) {
          // Create stub file node WITHOUT parsing
          const name = entry.name.replace(/\.md$/i, "")
          events.push({
            id: fileId,
            type: "node_created",
            actor: "fs-scan",
            ts: now,
            data: {
              id: fileId,
              type: "file",
              parent_id: parentId,
              parent_idx: order++,
              fs_path: fullPath,
              name,
              // Title defaults to filename until parsed
              title: name,
              // Mark as unparsed stub
              data: { _stub: true },
            },
          })

          // Add to deferred files for later parsing
          deferredFiles.push({ nodeId: fileId, fsPath: fullPath })

          current++
          if (current % 100 === 0) {
            yield { current, total }
          }
        } else {
          // Non-markdown file node
          events.push({
            id: fileId,
            type: "node_created",
            actor: "fs-scan",
            ts: now,
            data: {
              id: fileId,
              type: "file",
              parent_id: parentId,
              parent_idx: order++,
              fs_path: fullPath,
              content: entry.name,
            },
          })
        }
      }
    }
  }
}

function* discoverFromFilesystem(
  repoRoot: string,
  errors: LoadError[],
  db: Database,
): Generator<StepYield, EventSource, unknown> {
  // Single-pass: discover AND parse in one traversal (km-load-perf.0)
  yield "Discovering files"

  const events: Event[] = []
  const pendingLinks: PendingLink[] = []
  const now = Date.now()
  const ignorePatterns = getIgnorePatterns(repoRoot)

  // First pass: count markdown files (fast - no parsing)
  // Use a stack-based iteration to count without recursion overhead
  const total = countMarkdownFilesFast(repoRoot, ignorePatterns)
  yield { current: total, total }

  // Query for existing repo root node (created by migration)
  const repoRootRow = db
    .prepare("SELECT id FROM nodes WHERE parent_id IS NULL AND type = 'folder'")
    .get() as { id: string } | undefined

  if (!repoRootRow) {
    throw new Error("Repo root node not found - migration failed")
  }

  const repoRootId = repoRootRow.id

  // Parse - scan filesystem and generate events
  yield "Parsing markdown"
  let current = 0

  yield* scanDirectory(repoRoot, repoRootId, 0)

  return { events, pendingLinks }

  // Recursive scanner (hoisted generator)
  function* scanDirectory(
    dirPath: string,
    parentId: string | null,
    _sortOrder: number,
  ): Generator<StepYield, void, unknown> {
    if (!existsSync(dirPath)) return

    // Skip ignored directories (except root)
    if (parentId !== null && shouldIgnore(dirPath, ignorePatterns, repoRoot)) {
      return
    }

    const entries = readdirSync(dirPath, { withFileTypes: true })
    let order = 0

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      // Skip ignored entries BEFORE creating nodes
      if (shouldIgnore(fullPath, ignorePatterns, repoRoot)) continue

      if (entry.isDirectory()) {
        // Create folder node
        const folderId = generateId(repoRoot, fullPath)
        events.push({
          id: folderId,
          type: "node_created",
          actor: "fs-scan",
          ts: now,
          data: {
            id: folderId,
            type: "folder",
            parent_id: parentId,
            parent_idx: order++,
            fs_path: fullPath,
            content: entry.name,
          },
        })

        // Recurse into subdirectory
        yield* scanDirectory(fullPath, folderId, 0)
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".md")) {
          try {
            const content = readFileSync(fullPath, "utf-8")
            const { nodes, wikilinks } = parseMarkdownWithLinks(
              content,
              fullPath,
            )

            // First node is always the file node
            const fileNode = nodes[0]
            if (fileNode?.type === "file") {
              fileNode.parent_id = parentId
              fileNode.parent_idx = order++
            }

            // Convert nodes to events
            for (const node of nodes) {
              const nodeId =
                node.id ?? generateId(repoRoot, fullPath, node.md_line)
              events.push({
                id: nodeId,
                type: "node_created",
                actor: "fs-scan",
                ts: now,
                data: { ...node, id: nodeId },
              })
            }

            // Collect wikilinks for later resolution
            for (const wikilink of wikilinks) {
              pendingLinks.push(wikilink)
            }

            current++
            // Yield progress every 50 files
            if (current % 50 === 0) {
              yield { current, total }
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            errors.push({ phase: "parse", path: fullPath, message })
          }
        } else {
          // Non-markdown file node
          const fileId = generateId(repoRoot, fullPath)
          events.push({
            id: fileId,
            type: "node_created",
            actor: "fs-scan",
            ts: now,
            data: {
              id: fileId,
              type: "file",
              parent_id: parentId,
              parent_idx: order++,
              fs_path: fullPath,
              content: entry.name,
            },
          })
        }
      }
    }
  }
}

/**
 * Fast markdown file count using stack-based iteration (no recursion).
 * This is used for progress display only - minimal overhead.
 */
function countMarkdownFilesFast(
  rootPath: string,
  ignorePatterns: string[],
): number {
  if (!existsSync(rootPath)) return 0

  let count = 0
  const stack = [rootPath]

  while (stack.length > 0) {
    const dirPath = stack.pop()
    if (!dirPath) continue

    // Skip ignored directories (except root)
    if (
      dirPath !== rootPath &&
      shouldIgnore(dirPath, ignorePatterns, rootPath)
    ) {
      continue
    }

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)

        // Skip ignored entries
        if (shouldIgnore(fullPath, ignorePatterns, rootPath)) continue

        if (entry.isDirectory()) {
          stack.push(fullPath)
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          count++
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  return count
}

function generateId(
  repoRoot: string,
  filePath: string,
  lineNum?: number,
): string {
  const relPath = relative(repoRoot, filePath)
  return lineNum !== undefined ? `${relPath}:${lineNum}` : relPath
}

// --- Disk Mode Discovery ---

function* discoverFromEvents(
  db: Database,
  kmDir: string,
  force: boolean,
  _errors: LoadError[],
): Generator<StepYield, EventSource, unknown> {
  // Discover - read and count events
  yield "Reading events"

  // Use passed kmDir instead of getEventsPath() singleton (ADR-002)
  const eventsPath = join(kmDir, "events.jsonl")
  if (!existsSync(eventsPath)) {
    debug("no events file at %s", eventsPath)
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
  if (force) {
    events = allEvents
  } else {
    const lastApplied = db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("last_event") as { value: string } | undefined

    events = lastApplied?.value
      ? allEvents.filter((e) => e.id > lastApplied.value)
      : allEvents
  }

  yield { current: events.length, total: events.length }
  debug("discovered %d events (%d new)", allEvents.length, events.length)

  // Disk mode: links are resolved during applyEvent, no pending links
  return { events, pendingLinks: [] }
}

// --- Shared Pipeline ---

function* applyEvents(
  db: Database,
  events: Event[],
  errors: LoadError[],
): Generator<StepYield, void, unknown> {
  yield "Applying changes"

  const total = events.length
  if (total === 0) return

  // Bulk operations: events are applied here, rules are evaluated after via evaluateAllRules
  db.run("BEGIN IMMEDIATE")
  try {
    // km-load-perf.2: Batch INSERT for node_created events using prepared statement
    // This is significantly faster than individual db.run() calls
    const insertStmt = db.prepare(`
      INSERT INTO nodes (
        id, type, parent_id, link_to, link_alias, parent_idx,
        fs_path, fs_ino, fs_mtime, name, title, md_pos, md_line, md_slug,
        task_status, task_mark, assigned_to, due_date, scheduled_date, priority,
        content, content_hash, data,
        created_at, updated_at, version
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
    `)

    for (const [i, event] of events.entries()) {
      try {
        // Fast path for node_created (most common during memory mode)
        if (event.type === "node_created") {
          const data = event.data as Record<string, unknown>
          insertStmt.run(
            data.id as string,
            data.type as string,
            (data.parent_id as string) ?? null,
            (data.link_to as string) ?? null,
            (data.link_alias as string) ?? null,
            (data.parent_idx as number) ?? 0,
            (data.fs_path as string) ?? null,
            (data.fs_ino as number) ?? null,
            (data.fs_mtime as number) ?? null,
            (data.name as string) ?? null,
            (data.title as string) ?? null,
            (data.md_pos as number) ?? null,
            (data.md_line as number) ?? null,
            (data.md_slug as string) ?? null,
            (data.task_status as string) ?? null,
            (data.task_mark as string) ?? null,
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
          // Use generic applyEvent for other event types
          applyEventWithDb(db, event)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ phase: "apply", message })
      }

      // Yield progress every 100 events
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

function* resolveLinks(
  db: Database,
  pendingLinks: PendingLink[],
  errors: LoadError[],
): Generator<StepYield, number, unknown> {
  const total = pendingLinks.length
  if (total === 0) return 0

  yield "Resolving links"
  yield { current: 0, total }

  // Use shared LinkResolver for O(1) lookups (same as reconcile.ts)
  const resolver = createLinkResolver(db)

  // Collect all link data for batch INSERT
  const linksToInsert: Array<{
    source_id: string
    target_name: string
    target_id: string | null
    section: string | null
    block_id: string | null
    alias: string | null
    embedded: boolean
    relationship: string | null
  }> = []

  // Collect embedded link updates for batch UPDATE
  const embeddedUpdates: Array<{
    source_id: string
    target_id: string
    alias: string | null
  }> = []

  let resolved = 0

  // Phase 1: Build link data (O(1) lookups)
  for (const [i, { nodeId, link, relationship }] of pendingLinks.entries()) {
    try {
      // Use resolver for O(1) target and section lookup
      let targetId = resolver.resolveTarget(link.target)
      if (targetId && link.section) {
        const sectionId = resolver.resolveSection(targetId, link.section)
        if (sectionId) {
          targetId = sectionId
        }
      }

      linksToInsert.push({
        source_id: nodeId,
        target_name: link.target,
        target_id: targetId,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      })

      // Track embedded links that need node updates
      if (link.embedded && targetId) {
        embeddedUpdates.push({
          source_id: nodeId,
          target_id: targetId,
          alias: link.alias ?? null,
        })
      }

      if (targetId) {
        resolved++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ phase: "resolve", message })
    }

    // Yield progress every 100 links (building phase)
    if (i % 100 === 0) {
      yield { current: Math.floor(i / 2), total } // First half is building
    }
  }

  // Phase 2: Batch INSERT in single transaction
  const now = Date.now()

  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO links
      (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const link of linksToInsert) {
      insertStmt.run(
        link.source_id,
        link.target_name,
        link.target_id,
        link.section,
        link.block_id,
        link.alias,
        link.embedded ? 1 : 0,
        link.relationship,
        now,
      )
    }

    // Batch UPDATE for embedded links (update source node's link_to)
    if (embeddedUpdates.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE nodes SET link_to = ?, link_alias = ?, updated_at = ? WHERE id = ?
      `)
      for (const update of embeddedUpdates) {
        updateStmt.run(update.target_id, update.alias, now, update.source_id)
      }
    }

    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  yield { current: total, total }
  return resolved
}

/**
 * Resolve pending links asynchronously (after board renders).
 * Call this with pendingLinks from loadRepo({ skipLinkResolution: true }).
 *
 * Yields to event loop between batches to keep UI responsive.
 *
 * @param pendingLinks - Links to resolve (from LoadResult.pendingLinks)
 * @param onProgress - Optional callback for progress updates
 * @returns Number of successfully resolved links
 */
export async function resolveLinksAsync(
  db: Database,
  pendingLinks: PendingLink[],
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  const total = pendingLinks.length
  if (total === 0) return 0

  debug("resolveLinksAsync: starting %d links", total)

  // Use shared LinkResolver for O(1) lookups (same as reconcile.ts)
  const resolver = createLinkResolver(db)

  // Collect all link data for batch INSERT
  const linksToInsert: Array<{
    source_id: string
    target_name: string
    target_id: string | null
    section: string | null
    block_id: string | null
    alias: string | null
    embedded: boolean
    relationship: string | null
  }> = []

  // Collect embedded link updates for batch UPDATE
  const embeddedUpdates: Array<{
    source_id: string
    target_id: string
    alias: string | null
  }> = []

  let resolved = 0
  const BATCH_SIZE = 50

  // Phase 1: Build link data (O(1) lookups), yielding periodically
  for (const [i, { nodeId, link, relationship }] of pendingLinks.entries()) {
    // Use resolver for O(1) target and section lookup
    let targetId = resolver.resolveTarget(link.target)
    if (targetId && link.section) {
      const sectionId = resolver.resolveSection(targetId, link.section)
      if (sectionId) {
        targetId = sectionId
      }
    }

    linksToInsert.push({
      source_id: nodeId,
      target_name: link.target,
      target_id: targetId,
      section: link.section ?? null,
      block_id: link.blockId ?? null,
      alias: link.alias ?? null,
      embedded: link.embedded ?? false,
      relationship: relationship ?? null,
    })

    // Track embedded links that need node updates
    if (link.embedded && targetId) {
      embeddedUpdates.push({
        source_id: nodeId,
        target_id: targetId,
        alias: link.alias ?? null,
      })
    }

    if (targetId) {
      resolved++
    }

    // Yield to event loop periodically to keep UI responsive
    if (i % BATCH_SIZE === 0) {
      onProgress?.(i, total)
      await new Promise((resolve) => {
        setImmediate(resolve)
      })
    }
  }

  // Phase 2: Batch INSERT in single transaction
  const now = Date.now()

  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO links
      (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const link of linksToInsert) {
      insertStmt.run(
        link.source_id,
        link.target_name,
        link.target_id,
        link.section,
        link.block_id,
        link.alias,
        link.embedded ? 1 : 0,
        link.relationship,
        now,
      )
    }

    // Batch UPDATE for embedded links (update source node's link_to)
    if (embeddedUpdates.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE nodes SET link_to = ?, link_alias = ?, updated_at = ? WHERE id = ?
      `)
      for (const update of embeddedUpdates) {
        updateStmt.run(update.target_id, update.alias, now, update.source_id)
      }
    }

    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  onProgress?.(total, total)
  debug("resolveLinksAsync: completed, %d resolved", resolved)
  return resolved
}

function* materializeRules(db: Database): Generator<StepYield, void, unknown> {
  yield "Evaluating rules"
  const ctx = createRuleContext()
  for (const progress of evaluateAllRules(db, ctx)) {
    yield { current: progress.current, total: progress.total }
  }
  // Note: ctx.pendingWriteBack contains files that need write-back after materialization
  // This is handled by the sync layer after loadRepo completes
}

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

  // km-fast-md.6: Use worker pool for parallel parsing (default: true)
  const useWorkerPool = options?.useWorkerPool ?? true

  if (useWorkerPool && total >= 4) {
    // Only use pool for 4+ files (overhead not worth it for fewer)
    return parseDeferredWithPool(db, deferredFiles, shouldAbort)
  }

  return parseDeferredSequential(db, deferredFiles, shouldAbort)
}

/**
 * km-fast-md.6: Parse files in parallel using worker pool.
 * Uses composable async generator pipeline for unified parse/apply flow.
 */
async function parseDeferredWithPool(
  db: Database,
  deferredFiles: DeferredFile[],
  _shouldAbort?: () => boolean,
): Promise<{ parsed: number; pendingLinks: PendingLink[] }> {
  const total = deferredFiles.length
  debug("parseDeferredWithPool: starting %d files with pipeline", total)

  const pool = createParsePool()
  await pool.start()

  try {
    // Use composable pipeline: parseFiles → applyNodes → resolveLinks → applyLinks
    const result = await runDeferredPipeline(db, deferredFiles, pool)

    // Convert ResolvedLink[] back to PendingLink[] for compatibility
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

    debug(
      "parseDeferredWithPool: completed, %d parsed, %d links",
      result.parsed,
      pendingLinks.length,
    )

    return { parsed: result.parsed, pendingLinks }
  } finally {
    await pool.stop()
  }
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
  debug("parseDeferredSequential: starting %d files", total)
  const pendingLinks: PendingLink[] = []
  const BATCH_SIZE = 10
  let parsed = 0

  db.run("BEGIN IMMEDIATE")

  try {
    // Prepared statements for batch operations
    const deleteStmt = db.prepare("DELETE FROM nodes WHERE id = ?")
    const insertStmt = db.prepare(`
      INSERT INTO nodes (
        id, type, parent_id, link_to, link_alias, parent_idx,
        fs_path, fs_ino, fs_mtime, name, title, md_pos, md_line, md_slug,
        task_status, task_mark, assigned_to, due_date, scheduled_date, priority,
        content, content_hash, data,
        created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const [i, { nodeId, fsPath }] of deferredFiles.entries()) {
      try {
        // Read and parse the file
        const content = readFileSync(fsPath, "utf-8")
        const { nodes, wikilinks } = parseMarkdownWithLinks(content, fsPath)

        // Get the stub's parent info before deleting
        const stubRow = db
          .prepare("SELECT parent_id, parent_idx FROM nodes WHERE id = ?")
          .get(nodeId) as {
          parent_id: string | null
          parent_idx: number
        } | null

        if (!stubRow) {
          debug("parseDeferredSequential: stub %s not found, skipping", nodeId)
          continue
        }

        // Delete the stub node
        deleteStmt.run(nodeId)

        // First node is always the file node - preserve its ID and parent info
        const fileNode = nodes[0]
        if (fileNode?.type === "file") {
          fileNode.id = nodeId // Keep original ID
          fileNode.parent_id = stubRow.parent_id
          fileNode.parent_idx = stubRow.parent_idx
        }

        // Insert all parsed nodes
        const now = Date.now()
        for (const node of nodes) {
          const data = node.data ?? {}
          insertStmt.run(
            node.id,
            node.type,
            node.parent_id ?? null,
            node.link_to ?? null,
            node.link_alias ?? null,
            node.parent_idx ?? 0,
            node.fs_path ?? null,
            node.fs_ino ?? null,
            node.fs_mtime ?? null,
            node.name ?? null,
            node.title ?? null,
            node.md_pos ?? null,
            node.md_line ?? null,
            node.md_slug ?? null,
            node.task_status ?? null,
            node.task_mark ?? null,
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

        // Collect wikilinks for later resolution
        for (const wikilink of wikilinks) {
          pendingLinks.push(wikilink)
        }

        parsed++
      } catch (err) {
        debug("parseDeferredSequential: error parsing %s: %s", fsPath, err)
      }

      // Yield to event loop periodically and check for abort
      if (i % BATCH_SIZE === 0) {
        await new Promise((resolve) => {
          setImmediate(resolve)
        })
        // Check abort after yielding
        if (shouldAbort?.()) {
          debug("parseDeferredSequential: aborted at %d/%d", i, total)
          break
        }
      }
    }

    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  debug(
    "parseDeferredSequential: completed, %d parsed, %d links",
    parsed,
    pendingLinks.length,
  )

  return { parsed, pendingLinks }
}
