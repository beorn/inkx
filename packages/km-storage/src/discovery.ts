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
import type { Change } from "@km/core"
import { createLogger } from "loggily"
import { parseMarkdownWithLinks, parsePlainTextToNodes } from "@km/markdown"
import {
  createIgnoreMatcher,
  shouldIgnore,
  type PatternMatcher,
  generatePathBasedId,
  toRelativeFsPath,
} from "@km/fs-mount"
import type { StepYield, PendingLink, DeferredFile, LoadError } from "./repo/loader.ts"
import { readSiblingOrder, applySiblingOrder } from "./sibling-order.ts"
import { createNullCollapseParseMatcher, type CollapseParseMatcher } from "./markdown/collapse-parse.ts"
import { extractLinks, type ExtractedLink } from "./markdown/extract-links.ts"

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
  /**
   * Collapse-parse matcher. When set, files whose relative path matches the
   * matcher are stored as opaque stubs (same shape as stub mode) and are
   * NOT added to the deferred-parse queue. They're promoted on demand when
   * the user navigates into them (via `parseStubFile`).
   *
   * Omit or pass a null matcher to disable collapse-parse entirely
   * (backward-compatible default: every file is fully parsed).
   */
  collapseMatcher?: CollapseParseMatcher
}

/**
 * Regex-extracted outgoing link edges for a single collapsed file.
 * Paired with the host node's id so the loader can write them after the
 * parent stub has been applied.
 */
export interface CollapsedExtraction {
  hostId: string
  extracted: ExtractedLink[]
}

/** Result from discoverFiles */
export interface DiscoveryResult {
  changes: Change[]
  pendingLinks: PendingLink[]
  /** Files to parse later (stub mode only) */
  deferredFiles?: DeferredFile[]
  /** Directories that were not explored due to depth limit */
  unexploredDirs?: UnexploredDir[]
  /**
   * Link edges extracted from collapsed files — one entry per collapsed stub
   * that was encountered during the walk. Empty when no `inactive:` globs configured
   * or no files matched.
   */
  collapsedExtractions?: CollapsedExtraction[]
}

// ============================================================================
// MAIN DISCOVERY FUNCTION
// ============================================================================

/**
 * Unified filesystem discovery.
 * Scans directory tree and generates changes for files/folders.
 *
 * In "stub" mode: creates stub file nodes without parsing markdown.
 * In "full" mode: parses markdown and extracts wikilinks.
 *
 * @param repoRoot - Root directory to scan
 * @param db - Database for querying repo root node
 * @param options - Discovery options
 * @yields Progress updates
 * @returns Changes and pending links/deferred files
 */
export function* discoverFiles(
  repoRoot: string,
  db: Database,
  options: DiscoveryOptions,
): Generator<StepYield, DiscoveryResult, unknown> {
  const { parseMode, errors } = options
  const preloadDepth = options.preloadDepth ?? Infinity
  const collapseMatcher = options.collapseMatcher ?? createNullCollapseParseMatcher()

  yield "Discovering files"

  const changes: Change[] = []
  const pendingLinks: PendingLink[] = []
  const deferredFiles: DeferredFile[] = []
  const unexploredDirs: UnexploredDir[] = []
  const collapsedExtractions: CollapsedExtraction[] = []
  const now = Date.now()
  const ignoreMatcher = createIgnoreMatcher(repoRoot)
  const siblingOrders = readSiblingOrder(repoRoot)

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
  const total = countMarkdownFilesFast(repoRoot, ignoreMatcher)
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
    parseMode === "stub" ? { changes, pendingLinks: [], deferredFiles } : { changes, pendingLinks }
  if (unexploredDirs.length > 0) result.unexploredDirs = unexploredDirs
  if (collapsedExtractions.length > 0) result.collapsedExtractions = collapsedExtractions
  return result

  /**
   * Check if a directory can be entered (not already visited).
   * For symlinks, also skips targets inside the repo root (already being indexed).
   */
  function tryEnterDirectory(dirPath: string, isEmbed = false): boolean {
    let real: string
    try {
      real = realpathSync(dirPath)
    } catch {
      errors.push({ phase: "discover", path: dirPath, message: `Broken symlink: ${dirPath}` })
      return false
    }

    if (isEmbed && (real.startsWith(repoRealpath + "/") || real === repoRealpath)) {
      log.debug?.(`symlink to repo-internal path, skipping: ${dirPath} → ${real}`)
      return false
    }

    if (visitedDirs.has(real)) {
      const msg = isEmbed ? `Symlink loop: ${dirPath} → ${real}` : `Already visited: ${dirPath} → ${real}`
      log.debug?.(msg)
      errors.push({ phase: "discover", path: dirPath, message: msg })
      return false
    }

    visitedDirs.add(real)
    if (isEmbed) log.debug?.(`following symlink: ${dirPath} → ${real}`)
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
    if (parentId !== null && shouldIgnore(dirPath, ignoreMatcher, repoRoot)) {
      return
    }

    const entries = readdirSync(dirPath, { withFileTypes: true })

    // Check for persisted sibling order for this directory
    const parentRelPath = toRelativeFsPath(repoRoot, dirPath)
    const persistedOrder = siblingOrders[parentRelPath]

    // Build name→order map from persisted order, or fall back to sequential
    const orderMap = persistedOrder
      ? applySiblingOrder(
          persistedOrder,
          entries.filter((e) => !shouldIgnore(join(dirPath, e.name), ignoreMatcher, repoRoot)).map((e) => e.name),
        )
      : null

    let fallbackOrder = 0

    function getOrder(name: string): number {
      if (orderMap) {
        return orderMap.get(name) ?? fallbackOrder++
      }
      return fallbackOrder++
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      // Skip ignored entries BEFORE creating nodes
      if (shouldIgnore(fullPath, ignoreMatcher, repoRoot)) continue

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
          changes.push(
            createFolderChange(
              folderId,
              parentId,
              getOrder(entry.name),
              toRelativeFsPath(repoRoot, fullPath),
              entry.name,
              now,
            ),
          )
          // Depth limit: record as unexplored instead of recursing
          if (depth >= preloadDepth) {
            const childCount = quickChildCount(fullPath, ignoreMatcher, repoRoot)
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
          yield* handleFile(fullPath, parentId, getOrder(entry.name), entry.name)
        }
        // Symlink to something else (socket, etc.) — skip
        continue
      }

      if (entry.isDirectory()) {
        if (!tryEnterDirectory(fullPath)) continue
        const folderId = generateId(repoRoot, fullPath)
        changes.push(
          createFolderChange(
            folderId,
            parentId,
            getOrder(entry.name),
            toRelativeFsPath(repoRoot, fullPath),
            entry.name,
            now,
          ),
        )
        // Depth limit: record as unexplored instead of recursing
        if (depth >= preloadDepth) {
          const childCount = quickChildCount(fullPath, ignoreMatcher, repoRoot)
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
        yield* handleFile(fullPath, parentId, getOrder(entry.name), entry.name)
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
      changes.push(createNonMdFileChange(fileId, parentId, order, toRelativeFsPath(repoRoot, fullPath), entryName, now))
      return
    }

    // Collapse-parse: if this file is under a designated opaque folder,
    // force a stub that stays unparsed until the user navigates into it.
    // The stub looks identical to a normal `parseMode: "stub"` entry but
    // carries `_collapsed: true` so the loader re-queue path skips it.
    //
    // Even though the file stays opaque, we run a lightweight regex pass
    // over its content to extract outgoing link edges. This preserves the
    // backlink graph — targets keep seeing backlinks from the collapsed
    // sources without having to fully parse them. See
    // `markdown/extract-links.ts` and `db/collapsed-file-links.ts`.
    const relPath = toRelativeFsPath(repoRoot, fullPath)
    const isCollapsed = collapseMatcher.matches(relPath)

    if (isCollapsed) {
      yield* handleStubFile(fullPath, parentId, order, entryName, isTxt, true)
      return
    }

    if (parseMode === "stub") {
      yield* handleStubFile(fullPath, parentId, order, entryName, isTxt, false)
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
    isCollapsed: boolean = false,
  ): Generator<StepYield, void, unknown> {
    const fileId = generateId(repoRoot, fullPath)
    const ext = isTxt ? /\.txt$/i : /\.md$/i
    const name = entryName.replace(ext, "")
    const fstype = isTxt ? "txtfile" : "mdfile"

    changes.push(
      createStubFileChange(
        fileId,
        parentId,
        order,
        toRelativeFsPath(repoRoot, fullPath),
        name,
        now,
        fstype,
        isCollapsed,
      ),
    )

    // Collapsed stubs are NOT queued for background parse. They stay opaque
    // until the user navigates into them (parseStubFile is called eagerly
    // by `km view <path>` when the target is a `_stub: true` node).
    if (!isCollapsed) {
      deferredFiles.push({ nodeId: fileId, fsPath: fullPath })
    } else if (!isTxt) {
      // Collapsed markdown: regex-extract outgoing links so the backlink
      // graph stays intact. Plaintext (.txt) files don't get link extraction;
      // the parser (parsePlainTextToNodes) doesn't emit links either.
      tryExtractCollapsedLinks(fullPath, fileId)
    }

    current++
    if (current % 100 === 0) {
      yield { current, total }
    }
  }

  // --- Lightweight link extraction for a collapsed file ---
  // Reads the file and runs the regex pass. Logs and swallows errors so a
  // single malformed file can't abort discovery.
  function tryExtractCollapsedLinks(fullPath: string, hostId: string): void {
    try {
      const content = readFileSync(fullPath, "utf-8")
      const extracted = extractLinks(content)
      if (extracted.length > 0) {
        collapsedExtractions.push({ hostId, extracted })
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

      // Convert nodes to changes
      for (const node of nodes) {
        const nodeId = node.id ?? generateId(repoRoot, fullPath, node.md_line)
        changes.push({
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
function quickChildCount(dirPath: string, ignoreMatcher: PatternMatcher, repoRoot: string): number {
  try {
    const entries = readdirSync(dirPath)
    return entries.filter((name) => !shouldIgnore(join(dirPath, name), ignoreMatcher, repoRoot)).length
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
function countMarkdownFilesFast(rootPath: string, ignoreMatcher: PatternMatcher): number {
  if (!existsSync(rootPath)) return 0

  let count = 0
  const stack = [rootPath]
  // Track realpath of symlink targets to prevent cycles
  const visitedSymlinks = new Set<string>()

  while (stack.length > 0) {
    const dirPath = stack.pop()
    if (!dirPath) continue

    if (dirPath !== rootPath && shouldIgnore(dirPath, ignoreMatcher, rootPath)) continue

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        if (shouldIgnore(fullPath, ignoreMatcher, rootPath)) continue

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

/** Create folder change */
function createFolderChange(
  id: string,
  parentId: string | null,
  order: number,
  fsPath: string,
  name: string,
  ts: number,
): Change {
  return {
    id,
    type: "node_created",
    actor: "fs-scan",
    ts,
    data: {
      id,
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
      name, // Folder name for link resolution (e.g., "inbox" for [[inbox]])
      content: name,
    },
  }
}

/** Create stub file change (no parsing). `isCollapsed` marks stubs under
 * collapse-parse folders so the loader's re-queue path skips them. */
function createStubFileChange(
  id: string,
  parentId: string | null,
  order: number,
  fsPath: string,
  name: string,
  ts: number,
  fstype: "mdfile" | "txtfile" = "mdfile",
  isCollapsed: boolean = false,
): Change {
  const nodeData: Record<string, unknown> = { _stub: true }
  if (isCollapsed) nodeData._collapsed = true

  return {
    id,
    type: "node_created",
    actor: "fs-scan",
    ts,
    data: {
      id,
      type: "h",
      item: {},
      fstype,
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
      name,
      title: name, // Title defaults to filename until parsed
      data: nodeData,
    },
  }
}

/** Create non-markdown file change */
function createNonMdFileChange(
  id: string,
  parentId: string | null,
  order: number,
  fsPath: string,
  name: string,
  ts: number,
): Change {
  return {
    id,
    type: "node_created",
    actor: "fs-scan",
    ts,
    data: {
      id,
      type: "h",
      item: {},
      fstype: "file",
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
      content: name,
    },
  }
}
