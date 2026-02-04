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
import { join } from "path"
import type { Event } from "@km/core"
import { parseMarkdownWithLinks } from "@km/markdown"
import { getIgnorePatterns, shouldIgnore } from "./ignore.ts"
import type {
  StepYield,
  PendingLink,
  DeferredFile,
  LoadError,
} from "./repo-loader.ts"
import { generatePathBasedId } from "./id-utils.ts"

// ============================================================================
// TYPES
// ============================================================================

/** Discovery mode: "stub" for fast (no parsing), "full" for complete */
type DiscoveryMode = "stub" | "full"

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
  // Use is_repo_root flag to distinguish from other folders with NULL parent_id
  const repoRootRow = db
    .prepare(
      "SELECT id FROM nodes WHERE type = 'folder' AND json_extract(data, '$.is_repo_root') = 1",
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
        const folderId = generateId(repoRoot, fullPath)
        events.push(
          createFolderEvent(
            folderId,
            parentId,
            order++,
            fullPath,
            entry.name,
            now,
          ),
        )
        yield* scanDirectory(fullPath, folderId)
        continue
      }

      if (!entry.isFile()) continue

      if (!entry.name.endsWith(".md")) {
        const fileId = generateId(repoRoot, fullPath)
        events.push(
          createNonMdFileEvent(
            fileId,
            parentId,
            order++,
            fullPath,
            entry.name,
            now,
          ),
        )
        continue
      }

      // Markdown file handling
      if (parseMode === "stub") {
        yield* handleStubFile(fullPath, parentId, order++, entry.name)
      } else {
        yield* handleFullParseFile(fullPath, parentId, order++, entry.name)
      }
    }
  }

  // --- Stub mode: create stub node without parsing ---
  function* handleStubFile(
    fullPath: string,
    parentId: string | null,
    order: number,
    entryName: string,
  ): Generator<StepYield, void, unknown> {
    const fileId = generateId(repoRoot, fullPath)
    const name = entryName.replace(/\.md$/i, "")

    events.push(
      createStubFileEvent(fileId, parentId, order, fullPath, name, now),
    )
    deferredFiles.push({ nodeId: fileId, fsPath: fullPath })

    current++
    if (current % 100 === 0) {
      yield { current, total }
    }
  }

  // --- Full mode: parse markdown and extract wikilinks ---
  function* handleFullParseFile(
    fullPath: string,
    parentId: string | null,
    order: number,
    _entryName: string,
  ): Generator<StepYield, void, unknown> {
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

/**
 * Fast markdown file count using stack-based iteration (no recursion).
 * Used for progress display only - minimal overhead.
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

/** Generate node ID from path - delegate to shared utility */
function generateId(
  repoRoot: string,
  filePath: string,
  lineNum?: number,
): string {
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
      type: "folder",
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
