/**
 * Reconciliation
 *
 * Compares filesystem state to database state and generates operations.
 * Operations are applied using the applier module.
 */

import createDebug from "debug"
import type { Database } from "bun:sqlite"
import { dirname } from "path"
import type { KNode } from "@km/core"
import { getNodesUnderPath, getNodeByPath } from "../db-queries/core-lookup.ts"
import { scanDirectory } from "./watcher.ts"
import type { PatternMatcher } from "../ignore.ts"

const debug = createDebug("km:storage:watch:reconcile")

export interface ReconcileOp {
  type: "create" | "update" | "rename" | "delete"
  path: string
  nodeId?: string
  oldPath?: string
  ino?: number
  mtime?: number
}

export interface FsEntry {
  path: string
  ino: number
  mtime: number
  isDirectory: boolean
  /** If true, entry is a symlink (typically skipped during scanning) */
  isSymlink?: boolean
}

export type DirectoryScanner = (
  dirPath: string,
  ignorePatterns?: string[] | PatternMatcher,
) => FsEntry[]

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
  const ops: ReconcileOp[] = []

  // Get filesystem state (pass ignore patterns to filter out ignored files)
  const fsEntries = scanner
    ? scanner(dirPath, ignorePatterns)
    : scanDirectory(dirPath, ignorePatterns)

  // Get database state for this directory (using km-storage abstraction)
  const dbNodes = getNodesUnderPath(db, dirPath)

  debug("reconciling", {
    dirPath,
    fsEntries: fsEntries.length,
    dbNodes: dbNodes.length,
  })

  // Index by inode and path for efficient lookup
  const dbByIno = new Map<number, KNode>()
  const dbByPath = new Map<string, KNode>()

  for (const node of dbNodes) {
    if (node.fs_ino) {
      dbByIno.set(node.fs_ino, node)
    }
    if (node.fs_path) {
      dbByPath.set(node.fs_path, node)
    }
  }

  // Process filesystem entries
  for (const entry of fsEntries) {
    const existingByIno = dbByIno.get(entry.ino)
    const existingByPath = dbByPath.get(entry.path)

    if (existingByIno && existingByIno.fs_path !== entry.path) {
      // Renamed (same inode, different path)
      ops.push({
        type: "rename",
        nodeId: existingByIno.id,
        oldPath: existingByIno.fs_path,
        path: entry.path,
        ino: entry.ino,
      })
    } else if (existingByPath?.fs_ino && existingByPath.fs_ino !== entry.ino) {
      // Atomic write: same path but different inode
      // This happens when editors save via temp file + rename (Vim, VSCode, etc.)
      // Treat as an update but also update the inode
      debug("atomic write detected", {
        path: entry.path,
        oldIno: existingByPath.fs_ino,
        newIno: entry.ino,
      })
      ops.push({
        type: "update",
        nodeId: existingByPath.id,
        path: entry.path,
        ino: entry.ino, // New inode to track
        mtime: entry.mtime,
      })
    } else if (!existingByPath) {
      // New file/folder
      ops.push({
        type: "create",
        path: entry.path,
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
        path: entry.path,
        ino: entry.ino, // Also track inode in normal updates for consistency
        mtime: entry.mtime,
      })
    }

    // Remove from dbByPath so we can find deletions
    dbByPath.delete(entry.path)
  }

  // Remaining in dbByPath are deleted
  for (const [path, node] of dbByPath) {
    // Only include if it's directly in this directory
    if (dirname(path) === dirPath) {
      ops.push({
        type: "delete",
        nodeId: node.id,
        path,
      })
    }
  }

  if (ops.length > 0) {
    debug(
      "generated %d ops: %O",
      ops.length,
      ops.map((o) => ({ type: o.type, path: o.path })),
    )
  }

  return ops
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
  ops.push(
    ...reconcileDirectory(db, dirPath, repoRoot, ignorePatterns, scanner),
  )

  // Get subdirectories and recursively reconcile them
  const fsEntries = scanner
    ? scanner(dirPath, ignorePatterns)
    : scanDirectory(dirPath, ignorePatterns)
  for (const entry of fsEntries) {
    if (entry.isDirectory) {
      ops.push(
        ...reconcileDirectoryRecursive(
          db,
          entry.path,
          repoRoot,
          ignorePatterns,
          scanner,
        ),
      )
    }
  }

  return ops
}

/**
 * Get parent node ID from filesystem path
 */
export function getParentNodeId(db: Database, fsPath: string): string | null {
  const parentPath = dirname(fsPath)
  const parentNode = getNodeByPath(db, parentPath)
  return parentNode?.id ?? null
}

// Re-export applier functions for backwards compatibility
export { applyReconcileOps, applyReconcileOpsAsync } from "./applier.ts"

// Re-export handler types for consumers
export type { ReconcileContext } from "./handlers/index.ts"
