/**
 * Delete and rename handlers
 *
 * Simple handlers for file/folder deletion and renaming.
 */

import { emitNodeUpdated, emitNodeDeleted, type Emitter } from "../../emitter.ts"
import { toRelativeFsPath } from "../../path-utils.ts"
import type { ReconcileOp } from "../reconcile.ts"
import type { ReconcileContext } from "./create-handler.ts"
import { getNode } from "../../index.ts"
import type { Database } from "bun:sqlite"
import { isIndexFile } from "@km/tree"

/**
 * Handle file/folder rename
 */
export function handleRename(emitter: Emitter, op: ReconcileOp, repoRoot: string): void {
  if (!op.nodeId) return

  emitNodeUpdated(emitter, "fs-watch", op.nodeId, {
    fs_path: toRelativeFsPath(repoRoot, op.path),
  })
}

/**
 * Handle file/folder deletion
 */
export function handleDelete(emitter: Emitter, op: ReconcileOp, db?: Database, ctx?: ReconcileContext): void {
  if (!op.nodeId) return

  // Before deleting, check if this was an index file — track parent for re-materialization
  if (db && ctx) {
    const node = getNode(db, op.nodeId)
    if (node?.fstype === "mdfile" && node.parent_id && node.parent_id !== ".") {
      const parent = getNode(db, node.parent_id)
      if (parent?.fstype === "folder" && isIndexFile(parent.name ?? "", node)) {
        ctx.foldersNeedingIndexUpdate ??= new Set()
        ctx.foldersNeedingIndexUpdate.add(parent.id)
      }
    }
  }

  emitNodeDeleted(emitter, "fs-watch", op.nodeId)
}
