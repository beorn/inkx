/**
 * Delete and rename handlers
 *
 * Simple handlers for file/folder deletion and renaming.
 */

import {
  emitNodeUpdated,
  emitNodeDeleted,
  type Emitter,
} from "../../emitter.ts"
import { toRelativeFsPath } from "../../path-utils.ts"
import type { ReconcileOp } from "../reconcile.ts"

/**
 * Handle file/folder rename
 */
export function handleRename(
  emitter: Emitter,
  op: ReconcileOp,
  repoRoot: string,
): void {
  if (!op.nodeId) return

  emitNodeUpdated(emitter, "fs-watch", op.nodeId, {
    fs_path: toRelativeFsPath(repoRoot, op.path),
  })
}

/**
 * Handle file/folder deletion
 */
export function handleDelete(emitter: Emitter, op: ReconcileOp): void {
  if (!op.nodeId) return

  emitNodeDeleted(emitter, "fs-watch", op.nodeId)
}
