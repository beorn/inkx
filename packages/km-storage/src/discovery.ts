/**
 * Discovery Module
 *
 * Unified filesystem discovery for repo loading.
 * Supports both fast (stub) and full (parsed) modes with a shared core.
 *
 * Architecture:
 *   discoverFiles()     ← Streaming generator for file discovery
 *       ↓
 *   parseMode: "stub"   → Creates stub nodes (fast, no parsing)
 *   parseMode: "full"   → Parses markdown (slower, complete)
 *
 * Usage:
 *   // Fast discovery (for instant board render)
 *   const result = yield* discoverFiles(repoRoot, db, { parseMode: "stub" })
 *
 *   // Full discovery (for complete sync)
 *   const result = yield* discoverFiles(repoRoot, db, { parseMode: "full" })
 */

import type { Database } from "bun:sqlite"
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "fs"
import { join } from "path"
import type { Event } from "@km/core"
import { createLogger } from "loggily"
import { parseMarkdownWithLinks, parsePlainTextToNodes } from "@km/markdown"
import { getIgnorePatterns, shouldIgnore } from "./ignore.ts"
import type { StepYield, PendingLink, DeferredFile, LoadError } from "./repo-loader.ts"
import { generatePathBasedId } from "./id-utils.ts"
import { toRelativeFsPath } from "./path-utils.ts"

const log = createLogger("km:storage:discovery")

// ============================================================================
// TYPES
// ============================================================================

/** Discovery mode: "stub" for fast (no parsing), "full" for complete */
type DiscoveryMode = "stub" | "full"

/** A directory that was not explored due to preloadDepth limit */
export interface UnexploredDir {
  /** Node ID of the directory */
  id: string
  /** Relative fs_path */
  path: string
  /** Parent node ID */
  parentId: string
  /** Approximate child count from readdir (no stat) */
  childCount: number
}

/** Options for discoverFiles */
export interface DiscoveryOptions {
  /** Discovery mode: "stub" or "full" */
  parseMode: DiscoveryMode
  /** Errors accumulator */
  errors: LoadError[]
  /** Maximum directory depth to eagerly load. Infinity = load everything (default). */
  preloadDepth?: number
}

/** Result from discoverFiles */
export interface DiscoveryResult {
  events: Event[]
  pendingLinks: PendingLink[]
  /** Files to parse later (stub mode only) */
  deferredFiles?: DeferredFile[]
  /** Directories that were not explored due to depth limit */
  unexploredDirs?: UnexploredDir[]
}

// ============================================================================
// MAIN DISCOVERY FUNCTION
// ============================================================================

/**
 * Unified filesystem discovery.
 * Scans directory tree and generates events for files/folders.
 *
 * In "stub" mode: creates stub file nodes without parsing markdown.
 * In "full" mode: parses markdown and extracts wikilinks.
 *
 * @param repoRoot - Root directory to scan
 * @param db - Database for querying repo root node
 * @param options - Discovery options
 * @yields Progress updates
 * @returns Events and pending links/deferred files
 */
export function* discoverFiles(
  repoRoot: string,
  db: Database,
  options: DiscoveryOptions,
): Generator<StepYield, DiscoveryResult, unknown> {
  const { parseMode, errors } = options
  const preloadDepth = options.preloadDepth ?? Infinity

  yield "Discovering files"

  const events: Event[] = []
  const pendingLinks: PendingLink[] = []
  const deferredFiles: DeferredFile[] = []
  const unexploredDirs: UnexploredDir[] = []
  const now = Date.now()
  const ignorePatterns = getIgnorePatterns(repoRoot)

  // Query for existing repo root node (created by migration)
  // Use is_repo_root flag to distinguish from other folders with NULL parent_id
  const repoRootRow = db
    .prepare(
      "SELECT id FROM nodes WHERE type = 'h' AND item = 1 AND fstype = 'folder' AND json_extract(data, '$.is_repo_root') = 1",
    )
    .get() as { id: string } | undefined

  if (!repoRootRow) {
    throw new Error("Repo root node not found - migration failed")
  }

  const repoRootId = repoRootRow.id

  // Count files for progress
  const total = countMarkdownFilesFast(repoRoot, ignorePatterns)
  yield { current: 0, total }

  // Full mode yields "Parsing markdown" step
  if (parseMode === "full") {
    yield { current: total, total }
    yield "Parsing markdown"
  }

  let current = 0

  // Resolve repo root realpath once — used for repo-internal symlink detection
  let repoRealpath: string
  try {
    repoRealpath = realpathSync(repoRoot)
  } catch {
    throw new Error(`Cannot resolve repo root: ${repoRoot}`)
  }

  // Track visited directories by realpath to prevent symlink loops and deduplication.
  // Same approach as chokidar: realpathSync() every directory before entering.
  const visitedDirs = new Set<string>([repoRealpath])

  // Scan filesystem
  yield* scanDirectory(repoRoot, repoRootId, 0)

  yield { current, total }

  const result: DiscoveryResult =
    parseMode === "stub" ? { events, pendingLinks: [], deferredFiles } : { events, pendingLinks }
  if (unexploredDirs.length > 0) result.unexploredDirs = unexploredDirs
  return result

  /**
   * Check if a directory can be entered (not already visited).
   * For symlinks, also skips targets inside the repo root (already being indexed).
   */
  function tryEnterDirectory(dirPath: string, isSymlink = false): boolean {
    let real: string
    try {
      real = realpathSync(dirPath)
    } catch {
      errors.push({ phase: "discover", path: dirPath, message: `Broken symlink: ${dirPath}` })
      return false
    }

    if (isSymlink && (real.startsWith(repoRealpath + "/") || real === repoRealpath)) {
      log.debug?.(`symlink to repo-internal path, skipping: ${dirPath} → ${real}`)
      return false
    }

    if (visitedDirs.has(real)) {
      const msg = isSymlink ? `Symlink loop: ${dirPath} → ${real}` : `Already visited: ${dirPath} → ${real}`
      log.debug?.(msg)
      errors.push({ phase: "discover", path: dirPath, message: msg })
      return false
    }

    visitedDirs.add(real)
    if (isSymlink) log.debug?.(`following symlink: ${dirPath} → ${real}`)
    return true
  }

  // --- Nested generator for directory scanning ---
  function* scanDirectory(
    dirPath: string,
    parentId: string | null,
    depth: number,
  ): Generator<StepYield, void, unknown> {
    if (!existsSync(dirPath)) return

    // Skip ignored directories (except root)
    if (parentId !== null && shouldIgnore(dirPath, ignorePatterns, repoRoot)) {
      return
    }

    const entries = readdirSync(dirPath, { withFileTypes: true })
    let order = 0

    for (const entry of entries) {
      // Fast join: dirPath is always absolute, entry.name has no separators
      const fullPath = dirPath + "/" + entry.name

      // Skip ignored entries BEFORE creating nodes
      if (shouldIgnore(fullPath, ignorePatterns, repoRoot)) continue

      // Handle symlinks — follow to directories and files, detect loops
      if (entry.isSymbolicLink()) {
        let targetStat
        try {
          targetStat = statSync(fullPath) // follows symlink
        } catch {
          errors.push({ phase: "discover", path: fullPath, message: `Broken symlink: ${fullPath}` })
          continue
        }

        if (targetStat.isDirectory()) {
          if (!tryEnterDirectory(fullPath, true)) continue
          const folderId = generateId(repoRoot, fullPath)
          events.push(
            createFolderEvent(folderId, parentId, order++, toRelativeFsPath(repoRoot, fullPath), entry.name, now),
          )
          // Depth limit: record as unexplored instead of recursing
          if (depth >= preloadDepth) {
            const childCount = quickChildCount(fullPath, ignorePatterns, repoRoot)
            unexploredDirs.push({
              id: folderId,
              path: toRelativeFsPath(repoRoot, fullPath),
              parentId: parentId ?? ".",
              childCount,
            })
          } else {
            yield* scanDirectory(fullPath, folderId, depth + 1)
          }
        } else if (targetStat.isFile()) {
          // Files at depth >= preloadDepth are inside an unexplored dir's parent,
          // but since we're processing entries at this level, only skip files if
          // this directory itself is beyond the limit. Since we only enter scanDirectory
          // when depth < preloadDepth (or depth === 0 for root), files here are always valid.
          yield* handleFile(fullPath, parentId, order++, entry.name)
        }
        // Symlink to something else (socket, etc.) — skip
        continue
      }

      if (entry.isDirectory()) {
        if (!tryEnterDirectory(fullPath)) continue
        const folderId = generateId(repoRoot, fullPath)
        events.push(
          createFolderEvent(folderId, parentId, order++, toRelativeFsPath(repoRoot, fullPath), entry.name, now),
        )
        // Depth limit: record as unexplored instead of recursing
        if (depth >= preloadDepth) {
          const childCount = quickChildCount(fullPath, ignorePatterns, repoRoot)
          unexploredDirs.push({
            id: folderId,
            path: toRelativeFsPath(repoRoot, fullPath),
            parentId: parentId ?? ".",
            childCount,
          })
        } else {
          yield* scanDirectory(fullPath, folderId, depth + 1)
        }
        continue
      }

      if (entry.isFile()) {
        yield* handleFile(fullPath, parentId, order++, entry.name)
      }
    }
  }

  // --- Handle any file (markdown, plain text, or other) ---
  function* handleFile(
    fullPath: string,
    parentId: string | null,
    order: number,
    entryName: string,
  ): Generator<StepYield, void, unknown> {
    const isMd = entryName.endsWith(".md")
    const isTxt = entryName.endsWith(".txt")

    if (!isMd && !isTxt) {
      const fileId = generateId(repoRoot, fullPath)
      events.push(createNonMdFileEvent(fileId, parentId, order, toRelativeFsPath(repoRoot, fullPath), entryName, now))
      return
    }
    if (parseMode === "stub") {
      yield* handleStubFile(fullPath, parentId, order, entryName, isTxt)
    } else {
      yield* handleFullParseFile(fullPath, parentId, order, entryName, isTxt)
    }
  }

  // --- Stub mode: create stub node without parsing ---
  function* handleStubFile(
    fullPath: string,
    parentId: string | null,
    order: number,
    entryName: string,
    isTxt: boolean = false,
  ): Generator<StepYield, void, unknown> {
    const fileId = generateId(repoRoot, fullPath)
    const ext = isTxt ? /\.txt$/i : /\.md$/i
    const name = entryName.replace(ext, "")
    const fstype = isTxt ? "txtfile" : "mdfile"

    events.push(createStubFileEvent(fileId, parentId, order, toRelativeFsPath(repoRoot, fullPath), name, now, fstype))
    deferredFiles.push({ nodeId: fileId, fsPath: fullPath })

    current++
    if (current % 100 === 0) {
      yield { current, total }
    }
  }

  // --- Full mode: parse file content and extract nodes ---
  function* handleFullParseFile(
    fullPath: string,
    parentId: string | null,
    order: number,
    _entryName: string,
    isTxt: boolean = false,
  ): Generator<StepYield, void, unknown> {
    try {
      const content = readFileSync(fullPath, "utf-8")
      const { nodes, wikilinks } = isTxt
        ? parsePlainTextToNodes(content, fullPath)
        : parseMarkdownWithLinks(content, fullPath)

      // First node is always the file node
      const fileNode = nodes[0]
      if (fileNode?.type === "h" && fileNode?.item && (fileNode.fstype === "file" || fileNode.fstype === "mdfile")) {
        fileNode.parent_id = parentId
        fileNode.parent_idx = order
        fileNode.fs_path = toRelativeFsPath(repoRoot, fullPath)
      }

      // Convert nodes to events
      for (const node of nodes) {
        const nodeId = node.id ?? generateId(repoRoot, fullPath, node.md_line)
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
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Check if a filename has a parseable extension (.md or .txt) */
function isParseableFile(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".txt")
}

/**
 * Quick child count for an unexplored directory.
 * Uses readdirSync and filters out ignored entries without stat calls.
 */
function quickChildCount(dirPath: string, ignorePatterns: string[], repoRoot: string): number {
  try {
    const entries = readdirSync(dirPath)
    return entries.filter((name) => !shouldIgnore(join(dirPath, name), ignorePatterns, repoRoot)).length
  } catch {
    return 0
  }
}

/**
 * Fast parseable file count using stack-based iteration (no recursion).
 * Counts .md and .txt files. Follows symlinks with cycle detection.
 * Used for progress display only.
 */
// oxlint-disable-next-line complexity/complexity -- stack-based directory walker, complexity from error handling
function countMarkdownFilesFast(rootPath: string, ignorePatterns: string[]): number {
  if (!existsSync(rootPath)) return 0

  let count = 0
  const stack = [rootPath]
  // Track realpath of symlink targets to prevent cycles
  const visitedSymlinks = new Set<string>()

  while (stack.length > 0) {
    const dirPath = stack.pop()
    if (!dirPath) continue

    if (dirPath !== rootPath && shouldIgnore(dirPath, ignorePatterns, rootPath)) continue

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = dirPath + "/" + entry.name
        if (shouldIgnore(fullPath, ignorePatterns, rootPath)) continue

        if (entry.isSymbolicLink()) {
          try {
            const stat = statSync(fullPath)
            if (stat.isDirectory()) {
              const real = realpathSync(fullPath)
              if (!visitedSymlinks.has(real)) {
                visitedSymlinks.add(real)
                stack.push(fullPath)
              }
            } else if (stat.isFile() && isParseableFile(entry.name)) {
              count++
            }
          } catch {
            // Broken symlink — skip
          }
        } else if (entry.isDirectory()) {
          stack.push(fullPath)
        } else if (entry.isFile() && isParseableFile(entry.name)) {
          count++
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  return count
}

/** Generate node ID from path - delegate to shared utility */
function generateId(repoRoot: string, filePath: string, lineNum?: number): string {
  return generatePathBasedId(repoRoot, filePath, lineNum)
}

/** Create folder event */
function createFolderEvent(
  id: string,
  parentId: string | null,
  order: number,
  fsPath: string,
  name: string,
  ts: number,
): Event {
  return {
    id,
    type: "node_created",
    actor: "fs-scan",
    ts,
    data: {
      id,
      type: "h",
      item: true,
      fstype: "folder",
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
      name, // Folder name for link resolution (e.g., "inbox" for [[inbox]])
      content: name,
    },
  }
}

/** Create stub file event (no parsing) */
function createStubFileEvent(
  id: string,
  parentId: string | null,
  order: number,
  fsPath: string,
  name: string,
  ts: number,
  fstype: "mdfile" | "txtfile" = "mdfile",
): Event {
  return {
    id,
    type: "node_created",
    actor: "fs-scan",
    ts,
    data: {
      id,
      type: "h",
      item: true,
      fstype,
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
      name,
      title: name, // Title defaults to filename until parsed
      data: { _stub: true }, // Mark as unparsed stub
    },
  }
}

/** Create non-markdown file event */
function createNonMdFileEvent(
  id: string,
  parentId: string | null,
  order: number,
  fsPath: string,
  name: string,
  ts: number,
): Event {
  return {
    id,
    type: "node_created",
    actor: "fs-scan",
    ts,
    data: {
      id,
      type: "h",
      item: true,
      fstype: "file",
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
      content: name,
    },
  }
}
