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
import { existsSync, readdirSync, readFileSync } from "fs"
import { join, relative } from "path"
import type { Event } from "@km/core"
import { parseMarkdownWithLinks } from "@km/markdown"
import { getIgnorePatterns, shouldIgnore } from "./ignore.ts"
import type {
  StepYield,
  PendingLink,
  DeferredFile,
  LoadError,
} from "./repo-loader.ts"

// ============================================================================
// TYPES
// ============================================================================

/** Discovery mode: "stub" for fast (no parsing), "full" for complete */
export type DiscoveryMode = "stub" | "full"

/** Options for discoverFiles */
export interface DiscoveryOptions {
  /** Discovery mode: "stub" or "full" */
  parseMode: DiscoveryMode
  /** Errors accumulator */
  errors: LoadError[]
}

/** Result from discoverFiles */
export interface DiscoveryResult {
  events: Event[]
  pendingLinks: PendingLink[]
  /** Files to parse later (stub mode only) */
  deferredFiles?: DeferredFile[]
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

  yield "Discovering files"

  const events: Event[] = []
  const pendingLinks: PendingLink[] = []
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

  // Full mode yields "Parsing markdown" step
  if (parseMode === "full") {
    yield { current: total, total }
    yield "Parsing markdown"
  }

  let current = 0

  // Scan filesystem
  yield* scanDirectory(repoRoot, repoRootId)

  yield { current, total }

  return parseMode === "stub"
    ? { events, pendingLinks: [], deferredFiles }
    : { events, pendingLinks }

  // --- Nested generator for directory scanning ---
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
        order = processDirectory(entry, fullPath, parentId, order)
        yield* scanDirectory(fullPath, generateId(repoRoot, fullPath))
        continue
      }

      if (!entry.isFile()) continue

      const result = processFile(entry, fullPath, parentId, order)
      order = result.order
      if (result.shouldYield) {
        yield { current, total }
      }
    }
  }

  function processDirectory(
    entry: import("fs").Dirent,
    fullPath: string,
    parentId: string | null,
    order: number,
  ): number {
    const folderId = generateId(repoRoot, fullPath)
    events.push(
      createFolderEvent(folderId, parentId, order, fullPath, entry.name, now),
    )
    return order + 1
  }

  function processFile(
    entry: import("fs").Dirent,
    fullPath: string,
    parentId: string | null,
    order: number,
  ): { order: number; shouldYield: boolean } {
    if (!entry.name.endsWith(".md")) {
      return processNonMarkdownFile(entry, fullPath, parentId, order)
    }

    return parseMode === "stub"
      ? processStubMarkdownFile(fullPath, parentId, order)
      : processFullMarkdownFile(fullPath, parentId, order)
  }

  function processNonMarkdownFile(
    entry: import("fs").Dirent,
    fullPath: string,
    parentId: string | null,
    order: number,
  ): { order: number; shouldYield: boolean } {
    const fileId = generateId(repoRoot, fullPath)
    events.push(
      createNonMdFileEvent(fileId, parentId, order, fullPath, entry.name, now),
    )
    return { order: order + 1, shouldYield: false }
  }

  function processStubMarkdownFile(
    fullPath: string,
    parentId: string | null,
    order: number,
  ): { order: number; shouldYield: boolean } {
    const fileId = generateId(repoRoot, fullPath)
    const name = fullPath.split("/").pop()?.replace(/\.md$/i, "") ?? ""

    events.push(
      createStubFileEvent(fileId, parentId, order, fullPath, name, now),
    )
    deferredFiles.push({ nodeId: fileId, fsPath: fullPath })

    current++
    return { order: order + 1, shouldYield: current % 100 === 0 }
  }

  function processFullMarkdownFile(
    fullPath: string,
    parentId: string | null,
    order: number,
  ): { order: number; shouldYield: boolean } {
    try {
      const content = readFileSync(fullPath, "utf-8")
      const { nodes, wikilinks } = parseMarkdownWithLinks(content, fullPath)

      // First node is always the file node
      const fileNode = nodes[0]
      if (fileNode?.type === "file") {
        fileNode.parent_id = parentId
        fileNode.parent_idx = order
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
      pendingLinks.push(...wikilinks)

      current++
      return { order: order + 1, shouldYield: current % 50 === 0 }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ phase: "parse", path: fullPath, message })
      return { order, shouldYield: false }
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fast markdown file count using stack-based iteration (no recursion).
 * Used for progress display only - minimal overhead.
 */
export function countMarkdownFilesFast(
  rootPath: string,
  ignorePatterns: string[],
): number {
  if (!existsSync(rootPath)) return 0

  let count = 0
  const stack = [rootPath]

  while (stack.length > 0) {
    const dirPath = stack.pop()
    if (!dirPath) continue

    const isRoot = dirPath === rootPath
    if (!isRoot && shouldIgnore(dirPath, ignorePatterns, rootPath)) continue

    count += countDirectoryMarkdownFiles(
      dirPath,
      rootPath,
      ignorePatterns,
      stack,
    )
  }

  return count
}

/**
 * Count markdown files in a single directory and push subdirectories to stack.
 */
function countDirectoryMarkdownFiles(
  dirPath: string,
  rootPath: string,
  ignorePatterns: string[],
  stack: string[],
): number {
  let count = 0

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      if (shouldIgnore(fullPath, ignorePatterns, rootPath)) continue

      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (isMarkdownFile(entry)) {
        count++
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return count
}

/** Check if entry is a markdown file */
function isMarkdownFile(entry: import("fs").Dirent): boolean {
  return entry.isFile() && entry.name.endsWith(".md")
}

/** Generate node ID from path */
function generateId(
  repoRoot: string,
  filePath: string,
  lineNum?: number,
): string {
  const relPath = relative(repoRoot, filePath)
  return lineNum !== undefined ? `${relPath}:${lineNum}` : relPath
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
      type: "folder",
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
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
): Event {
  return {
    id,
    type: "node_created",
    actor: "fs-scan",
    ts,
    data: {
      id,
      type: "file",
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
      type: "file",
      parent_id: parentId,
      parent_idx: order,
      fs_path: fsPath,
      content: name,
    },
  }
}
