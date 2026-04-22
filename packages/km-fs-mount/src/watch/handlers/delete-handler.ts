/**
 * Delete and rename handlers
 *
 * Simple handlers for file/folder deletion and renaming.
 */

import { basename, dirname } from "path"
import { emitNodeUpdated, emitNodeDeleted, type Emitter, getNode, getNodeByPath } from "@km/storage"
import { toRelativeFsPath } from "../../fs/path-utils.ts"
import type { ReconcileOp } from "../reconcile.ts"
import type { ReconcileContext } from "./create-handler.ts"
import type { Database } from "bun:sqlite"
import { isIndexFile } from "@km/core"

/**
 * Handle file/folder rename
 */
export function handleRename(
  emitter: Emitter,
  op: ReconcileOp,
  repoRoot: string,
  db?: Database,
  ctx?: ReconcileContext,
): void {
  if (!op.nodeId) return

  const newRelPath = toRelativeFsPath(repoRoot, op.path)
  const newName = basename(op.path).replace(/\.(md|txt)$/, "")

  // Build update payload — always includes fs_path and name
  const updates: Record<string, unknown> = {
    fs_path: newRelPath,
    name: newName,
  }
  if (op.ino !== undefined) updates.fs_ino = op.ino
  if (op.mtime !== undefined) updates.fs_mtime = op.mtime
  if (op.dev !== undefined) updates.fs_dev = op.dev
  if (op.size !== undefined) updates.fs_size = op.size
  if (op.contentHash !== undefined) updates.fs_content_hash = op.contentHash

  if (db) {
    const node = getNode(db, op.nodeId)
    if (node) {
      const newParentRelPath = dirname(newRelPath)
      const oldParentRelPath = node.fs_path ? dirname(node.fs_path) : null
      const parentChanged = oldParentRelPath != null && newParentRelPath !== oldParentRelPath

      // Resolve new parent folder (needed for cross-folder move and index refresh)
      const newParent = newParentRelPath !== "." ? getNodeByPath(db, newParentRelPath) : null

      // Cross-folder move: update parent_id when directory changed
      if (parentChanged && newParent) {
        updates.parent_id = newParent.id
      }

      if (ctx) {
        // Track old parent for index refresh — child is leaving
        if (op.oldPath && node.parent_id && node.parent_id !== ".") {
          ctx.foldersToRefresh ??= new Set()
          ctx.foldersToRefresh.add(node.parent_id)
        }

        // Track new parent for index refresh — child is arriving
        if (op.oldPath && newParent) {
          ctx.foldersToRefresh ??= new Set()
          ctx.foldersToRefresh.add(newParent.id)
        }

        // Add renamed mdfiles to modifiedIndexFiles for post-batch sync
        if (node.fstype === "mdfile") {
          ctx.modifiedIndexFiles ??= new Set()
          ctx.modifiedIndexFiles.add(op.nodeId)
        }
      }
    }
  }

  emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)
}

/**
 * Handle file/folder deletion
 */
export function handleDelete(emitter: Emitter, op: ReconcileOp, db?: Database, ctx?: ReconcileContext): void {
  if (!op.nodeId) return

  // Before deleting, track parent folder for index refresh and re-materialization
  if (db && ctx) {
    const node = getNode(db, op.nodeId)
    if (node?.parent_id && node.parent_id !== ".") {
      // Any deleted child means parent folder's index may need refresh
      ctx.foldersToRefresh ??= new Set()
      ctx.foldersToRefresh.add(node.parent_id)

      // If the deleted file was an index file, also track for re-materialization
      if (node.fstype === "mdfile") {
        const parent = getNode(db, node.parent_id)
        if (parent?.fstype === "folder" && isIndexFile(parent.name ?? "", node)) {
          ctx.foldersNeedingIndexUpdate ??= new Set()
          ctx.foldersNeedingIndexUpdate.add(parent.id)
        }
      }
    }
  }

  emitNodeDeleted(emitter, "fs-watch", op.nodeId)
}
