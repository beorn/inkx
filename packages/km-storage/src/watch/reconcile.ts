/**
 * Reconciliation
 *
 * Compares filesystem state to database state and generates operations.
 * Operations are applied using the applier module.
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { dirname, join } from "path"
import type { KNode } from "@km/core"
import { getNodesUnderPath, getNodeByPath } from "../db-queries/core-lookup.ts"
import { scanDirectory, scanDirectoryAsync } from "./watcher.ts"
import type { PatternMatcher } from "../ignore.ts"
import { toRelativeFsPath } from "../path-utils.ts"
const log = createLogger("km:storage:watch:reconcile")

export interface ReconcileOp {
  type: "create" | "update" | "rename" | "delete"
  path: string
  nodeId?: string
  oldPath?: string
  ino?: number
  mtime?: number
}

interface FsEntry {
  path: string
  ino: number
  mtime: number
  isDirectory: boolean
  /** If true, entry is a symlink (typically skipped during scanning) */
  isSymlink?: boolean
}

export type DirectoryScanner = (dirPath: string, ignorePatterns?: string[] | PatternMatcher) => FsEntry[]

export type AsyncDirectoryScanner = (dirPath: string, ignorePatterns?: string[] | PatternMatcher) => Promise<FsEntry[]>

/**
 * Pure comparison logic: compare filesystem entries to database state and generate ops.
 * Shared by both sync and async reconciliation.
 */
function reconcileFromEntries(db: Database, dirPath: string, repoRoot: string, fsEntries: FsEntry[]): ReconcileOp[] {
  const ops: ReconcileOp[] = []

  // Convert dirPath to relative for DB queries (DB stores relative paths)
  const relDirPath = toRelativeFsPath(repoRoot, dirPath)

  // Get database state for this directory (using km-storage abstraction)
  const dbNodes = getNodesUnderPath(db, relDirPath)

  log.debug?.(`reconciling dirPath=${dirPath} fsEntries=${fsEntries.length} dbNodes=${dbNodes.length}`)

  // Index by inode and relative path for efficient lookup
  const dbByIno = new Map<number, KNode>()
  const dbByRelPath = new Map<string, KNode>()

  for (const node of dbNodes) {
    if (node.fs_ino) {
      dbByIno.set(node.fs_ino, node)
    }
    if (node.fs_path) {
      dbByRelPath.set(node.fs_path, node)
    }
  }

  // Process filesystem entries — convert to relative for comparison
  for (const entry of fsEntries) {
    const relPath = toRelativeFsPath(repoRoot, entry.path)
    const existingByIno = dbByIno.get(entry.ino)
    const existingByPath = dbByRelPath.get(relPath)

    if (existingByIno && existingByIno.fs_path !== relPath) {
      // If the target path already has a DIFFERENT node, it's been displaced
      // (e.g., folder A renamed to B, then later folder C renamed to B).
      // Delete the displaced node and its descendants before renaming.
      if (existingByPath && existingByPath.id !== existingByIno.id) {
        ops.push({
          type: "delete",
          nodeId: existingByPath.id,
          path: relPath,
        })
        dbByRelPath.delete(relPath)

        // Also delete displaced descendants (they're ghost nodes now)
        if (entry.isDirectory) {
          const displacedPrefix = relPath + "/"
          for (const [descPath, descNode] of dbByRelPath) {
            if (descPath.startsWith(displacedPrefix)) {
              ops.push({
                type: "delete",
                nodeId: descNode.id,
                path: descPath,
              })
              dbByRelPath.delete(descPath)
            }
          }
        }
      }

      // Renamed (same inode, different path)
      ops.push({
        type: "rename",
        nodeId: existingByIno.id,
        oldPath: existingByIno.fs_path,
        path: entry.path, // Keep absolute for FS operations
        ino: entry.ino,
      })
      // Remove OLD path from dbByRelPath to prevent spurious delete op
      if (existingByIno.fs_path) {
        dbByRelPath.delete(existingByIno.fs_path)
      }

      // Cascade rename to all descendants when a directory is renamed.
      // Without this, descendants keep their old fs_path and become stale nodes.
      if (entry.isDirectory && existingByIno.fs_path) {
        const oldPrefix = existingByIno.fs_path + "/"
        const newPrefix = relPath + "/"
        for (const [descRelPath, descNode] of dbByRelPath) {
          if (descRelPath.startsWith(oldPrefix)) {
            const newDescRelPath = newPrefix + descRelPath.slice(oldPrefix.length)
            ops.push({
              type: "rename",
              nodeId: descNode.id,
              oldPath: descRelPath,
              path: join(repoRoot, newDescRelPath),
              ino: descNode.fs_ino ?? 0,
            })
            dbByRelPath.delete(descRelPath)
          }
        }
      }
    } else if (existingByPath?.fs_ino && existingByPath.fs_ino !== entry.ino) {
      // Atomic write: same path but different inode
      // This happens when editors save via temp file + rename (Vim, VSCode, etc.)
      // Treat as an update but also update the inode
      log.debug?.(`atomic write detected path=${entry.path} oldIno=${existingByPath.fs_ino} newIno=${entry.ino}`)
      ops.push({
        type: "update",
        nodeId: existingByPath.id,
        path: entry.path, // Keep absolute for FS operations
        ino: entry.ino, // New inode to track
        mtime: entry.mtime,
      })
    } else if (!existingByPath) {
      // New file/folder
      ops.push({
        type: "create",
        path: entry.path, // Keep absolute for FS operations
        ino: entry.ino,
        mtime: entry.mtime,
      })
    } else if (entry.mtime !== existingByPath.fs_mtime && !entry.isDirectory) {
      // Modified (mtime changed - works for both forward and backward time changes)
      // Skip directories - their mtime changes when any file inside changes,
      // which is handled separately. We only care about .md file content changes.
      ops.push({
        type: "update",
        nodeId: existingByPath.id,
        path: entry.path, // Keep absolute for FS operations
        ino: entry.ino, // Also track inode in normal updates for consistency
        mtime: entry.mtime,
      })
    }

    // Remove from dbByRelPath so we can find deletions
    dbByRelPath.delete(relPath)
  }

  // Remaining in dbByRelPath are deleted
  for (const [relPath, node] of dbByRelPath) {
    // Only include if it's directly in this directory (compare relative paths)
    if (dirname(relPath) === relDirPath) {
      ops.push({
        type: "delete",
        nodeId: node.id,
        path: relPath, // Relative path — handlers only need nodeId for delete
      })
    }
  }

  if (ops.length > 0) {
    log.debug?.(`generated ${ops.length} ops: ${JSON.stringify(ops.map((o) => ({ type: o.type, path: o.path })))}`)
  }

  return ops
}

/**
 * Reconcile a directory - compare filesystem to database
 *
 * @param ignorePatterns - Either string[] (legacy) or PatternMatcher (fast, pre-compiled)
 */
export function reconcileDirectory(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: DirectoryScanner,
): ReconcileOp[] {
  // Get filesystem state (pass ignore patterns to filter out ignored files)
  const fsEntries = scanner ? scanner(dirPath, ignorePatterns) : scanDirectory(dirPath, ignorePatterns)

  return reconcileFromEntries(db, dirPath, repoRoot, fsEntries)
}

/**
 * Async version of reconcileDirectory - uses non-blocking fs operations.
 * Same logic as reconcileDirectory but accepts an async scanner.
 */
export async function reconcileDirectoryAsync(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: AsyncDirectoryScanner,
): Promise<ReconcileOp[]> {
  // Get filesystem state asynchronously
  const fsEntries = scanner ? await scanner(dirPath, ignorePatterns) : await scanDirectoryAsync(dirPath, ignorePatterns)

  // Rest is identical to sync version — just comparison logic, no I/O
  return reconcileFromEntries(db, dirPath, repoRoot, fsEntries)
}

/**
 * Recursively reconcile a directory and all subdirectories
 * Used when FSEvents coalesces multiple file events into a single directory event
 *
 * @param ignorePatterns - Either string[] (legacy) or PatternMatcher (fast, pre-compiled)
 */
export function reconcileDirectoryRecursive(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: DirectoryScanner,
): ReconcileOp[] {
  const ops: ReconcileOp[] = []

  // Reconcile this directory
  ops.push(...reconcileDirectory(db, dirPath, repoRoot, ignorePatterns, scanner))

  // Track paths already handled by parent-level ops (rename cascade + displaced deletes).
  // When a folder is renamed, reconcileDirectory generates rename ops for all
  // descendants and delete ops for any displaced nodes. Recursive descent into
  // the renamed directory would generate duplicate ops for the same paths.
  const handledPaths = new Set<string>()
  for (const op of ops) {
    if (op.type === "rename") {
      handledPaths.add(op.path)
    }
  }

  // Get subdirectories and recursively reconcile them
  const fsEntries = scanner ? scanner(dirPath, ignorePatterns) : scanDirectory(dirPath, ignorePatterns)
  for (const entry of fsEntries) {
    if (entry.isDirectory) {
      const childOps = reconcileDirectoryRecursive(db, entry.path, repoRoot, ignorePatterns, scanner)
      for (const op of childOps) {
        // Skip ops for paths already handled by parent cascade/displacement
        if (handledPaths.has(op.path)) {
          log.debug?.(`skipping duplicate op for already-handled path: ${op.path}`)
          continue
        }
        ops.push(op)
      }
    }
  }

  return ops
}

/**
 * Get parent node ID from filesystem path
 * @param fsPath - Relative filesystem path (as stored in DB)
 */
export function getParentNodeId(db: Database, fsPath: string): string | null {
  const parentPath = dirname(fsPath)
  const parentNode = getNodeByPath(db, parentPath)
  return parentNode?.id ?? null
}

// Re-export applier functions for backwards compatibility
export { applyReconcileOps, applyReconcileOpsAsync } from "./applier.ts"
