/**
 * Delete and rename handlers
 *
 * Simple handlers for file/folder deletion and renaming.
 */

import { basename, dirname } from "path"
import { emitNodeUpdated, emitNodeDeleted, type Emitter } from "../../emitter.ts"
import { toRelativeFsPath } from "../../path-utils.ts"
import type { ReconcileOp } from "../reconcile.ts"
import type { ReconcileContext } from "./create-handler.ts"
import { getNode } from "../../index.ts"
import { getNodeByPath } from "../../db-queries/core-lookup.ts"
import type { Database } from "bun:sqlite"
import { isIndexFile } from "@km/tree"

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

  // Track both old and new parent folders for index refresh (move = child leaving + entering)
  if (db && ctx && op.oldPath) {
    const node = getNode(db, op.nodeId)
    if (node?.parent_id && node.parent_id !== ".") {
      // Old parent (source) needs refresh — child is leaving
      ctx.foldersToRefresh ??= new Set()
      ctx.foldersToRefresh.add(node.parent_id)
    }

    // New parent (destination) needs refresh — child is arriving
    const newRelPath = toRelativeFsPath(repoRoot, op.path)
    const newParentRelPath = dirname(newRelPath)
    if (newParentRelPath !== ".") {
      const newParent = getNodeByPath(db, newParentRelPath)
      if (newParent) {
        ctx.foldersToRefresh ??= new Set()
        ctx.foldersToRefresh.add(newParent.id)
      }
    }
  }

  const newName = basename(op.path).replace(/\.(md|txt)$/, "")
  emitNodeUpdated(emitter, "fs-watch", op.nodeId, {
    fs_path: toRelativeFsPath(repoRoot, op.path),
    name: newName,
  })
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
